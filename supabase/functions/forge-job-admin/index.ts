// forge-job-admin — Operator-only job retry (Phase 8 Slice 4).
//
// POST { action: 'retry', job_id, idempotency_key? }
//
// Only forge_operator (admin counts). Only FAILED jobs can be retried.
// Retry enqueues a NEW attempt and never mutates the failed job:
//  - a new forge_jobs row (status 'queued') copying the failed job's plan,
//  - new tasks rows for every step (full re-run from step 1 — completed
//    steps are re-run, not resumed),
//  - new task_queue rows (attempt_count 0, available now),
//  - FRESH pending approvals for gated tasks (the original approvals are
//    never reused — an approval belongs to one attempt only),
//  - one audit row (job.retried).
//
// The failed job and its tasks/approvals stay exactly as they were:
// history is preserved, and a retry can never auto-pass a gate. Retry is
// blocked (400) while the failed job still has pending approvals —
// decide those first so one attempt never has two live gates.
//
// Idempotent replay: a retry with a previously used idempotency_key
// returns the existing job with deduped: true and creates nothing.
//
// DEPLOY NOTE: this function is source-only until deployed. The
// Livework+ job-detail screen calls it; until it is deployed retry
// fails with an error shown on screen. Deploy with:
//   supabase functions deploy forge-job-admin
// Do NOT use --no-verify-jwt.

import {
  HttpError,
  findByIdempotencyKey,
  handleRequest,
  jsonResponse,
  parseJsonBody,
  requireOperator,
  writeAudit,
  type SupabaseClient,
} from "../_shared/helpers.ts";

type Row = Record<string, unknown>;

function asString(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

async function pendingApprovalIdsForJob(
  service: SupabaseClient,
  taskIds: string[],
  taskApprovalIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  if (taskIds.length > 0) {
    const { data } = await service
      .from("approvals")
      .select("id")
      .in("task_id", taskIds)
      .eq("status", "pending");
    for (const r of ((data ?? []) as Row[])) {
      const id = asString(r.id);
      if (id) ids.add(id);
    }
  }
  const unique = [...new Set(taskApprovalIds.filter(Boolean))];
  if (unique.length > 0) {
    const { data } = await service
      .from("approvals")
      .select("id")
      .in("id", unique)
      .eq("status", "pending");
    for (const r of ((data ?? []) as Row[])) {
      const id = asString(r.id);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

Deno.serve((req) =>
  handleRequest(req, async (innerReq) => {
    const { user, service } = await requireOperator(innerReq);
    const body = await parseJsonBody(innerReq);

    const action = typeof body.action === "string" ? body.action : "";
    if (action !== "retry") {
      throw new HttpError(400, "action must be 'retry'");
    }
    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    if (!jobId) throw new HttpError(400, "job_id is required");
    const idempotencyKey =
      typeof body.idempotency_key === "string" && body.idempotency_key
        ? body.idempotency_key
        : null;

    // Idempotent replay: a prior retry with this key returns its job.
    if (idempotencyKey) {
      const existing = await findByIdempotencyKey(service, "forge_jobs", idempotencyKey);
      if (existing) {
        const { data: existingTasks } = await service
          .from("tasks")
          .select("id")
          .eq("forge_job_id", String(existing.id))
          .order("step_index", { ascending: true });
        return jsonResponse({
          job: existing,
          task_ids: ((existingTasks ?? []) as Row[]).map((t) => String(t.id)),
          approval_ids: [],
          deduped: true,
        });
      }
    }

    const { data: job, error: jobError } = await service
      .from("forge_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw new Error(`Job lookup failed: ${jobError.message}`);
    if (!job) throw new HttpError(404, "job not found");
    if (String((job as Row).status ?? "").toLowerCase() !== "failed") {
      throw new HttpError(400, "only failed jobs can be retried");
    }
    const jobRow = job as Row;

    const { data: oldTasks, error: tasksError } = await service
      .from("tasks")
      .select("*")
      .eq("forge_job_id", jobId)
      .order("step_index", { ascending: true });
    if (tasksError) throw new Error(`Task lookup failed: ${tasksError.message}`);
    const oldTaskRows = ((oldTasks ?? []) as Row[]);

    // Block retry while the failed job still has pending approvals: one
    // attempt must never have two live gates. Decide them first.
    const oldTaskIds = oldTaskRows.map((t) => String(t.id));
    const oldTaskApprovalIds = oldTaskRows
      .map((t) => asString(t.approval_id))
      .filter((v): v is string => v !== null);
    const pending = await pendingApprovalIdsForJob(service, oldTaskIds, oldTaskApprovalIds);
    if (pending.length > 0) {
      throw new HttpError(
        400,
        "job still has pending approvals — decide them first, then retry",
      );
    }

    const jobKey = idempotencyKey ?? `retry:${jobId}:${crypto.randomUUID()}`;
    const { data: newJob, error: newJobError } = await service
      .from("forge_jobs")
      .insert({
        job_type: jobRow.job_type ?? "forge_command",
        title: jobRow.title,
        detail: jobRow.detail,
        thread_id: jobRow.thread_id,
        funnel_id: jobRow.funnel_id,
        worker_id: jobRow.worker_id,
        plan_json: jobRow.plan_json,
        status: "queued",
        idempotency_key: jobKey,
      })
      .select("*")
      .single();
    if (newJobError || !newJob) {
      throw new Error(`Retry job creation failed: ${newJobError?.message ?? "unknown"}`);
    }
    const newJobId = String((newJob as Row).id);

    const newTaskIds: string[] = [];
    const newApprovalIds: string[] = [];
    const nowISO = new Date().toISOString();
    const expiresISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const old of oldTaskRows) {
      const approvalRequired = old.approval_required === true;
      const taskKey = `${jobKey}:step:${String(old.step_index ?? 0)}`;
      const { data: newTask, error: taskError } = await service
        .from("tasks")
        .insert({
          funnel_id: old.funnel_id,
          worker_id: old.worker_id,
          worker_name: old.worker_name,
          task_type: old.task_type,
          title: old.title,
          input: old.input,
          status: approvalRequired ? "awaiting_approval" : "queued",
          priority: old.priority ?? 0,
          thread_id: old.thread_id,
          forge_job_id: newJobId,
          step_index: old.step_index,
          approval_required: approvalRequired,
          idempotency_key: taskKey,
          metadata: { ...(typeof old.metadata === "object" && old.metadata !== null ? old.metadata as Row : {}), source: "forge-job-admin-retry", retried_from_task_id: String(old.id) },
        })
        .select("*")
        .single();
      if (taskError || !newTask) throw new Error(`Retry task creation failed: ${taskError?.message ?? "unknown"}`);
      const newTaskId = String((newTask as Row).id);
      newTaskIds.push(newTaskId);

      // Fresh approval for gated tasks. The original approval (if any) is
      // never reused: it belongs to the failed attempt.
      if (approvalRequired) {
        let orig: Row | null = null;
        const origApprovalId = asString(old.approval_id);
        if (origApprovalId) {
          const { data } = await service
            .from("approvals")
            .select("request_type, title, description, payload, priority")
            .eq("id", origApprovalId)
            .maybeSingle();
          orig = (data ?? null) as Row | null;
        }
        const { data: approval, error: approvalError } = await service
          .from("approvals")
          .insert({
            status: "pending",
            request_type: (orig?.request_type as string | undefined) ?? "general",
            title: (orig?.title as string | undefined) ?? `Approval required — ${String(old.title ?? old.task_type ?? "task")}`.slice(0, 200),
            description: (orig?.description as string | undefined) ??
              "Retry of a failed job: this gated step needs a fresh approval. Nothing has been sent, published, spent, deleted, or changed.",
            payload: orig?.payload ?? { retried_from_task_id: String(old.id), retried_from_job_id: jobId },
            task_id: newTaskId,
            funnel_id: old.funnel_id,
            worker_id: old.worker_id,
            requested_by: user.id,
            priority: (orig?.priority as string | undefined) ?? "normal",
            expires_at: expiresISO,
          })
          .select("id")
          .single();
        if (approvalError || !approval) {
          throw new Error(`Retry approval creation failed: ${approvalError?.message ?? "unknown"}`);
        }
        const newApprovalId = String((approval as Row).id);
        newApprovalIds.push(newApprovalId);
        await service.from("tasks").update({ approval_id: newApprovalId }).eq("id", newTaskId);
        await writeAudit(service, {
          actorUserId: user.id,
          actorType: "user",
          action: "approval.requested",
          entityType: "approval",
          entityId: newApprovalId,
          after: { status: "pending", task_id: newTaskId, retried_from_job_id: jobId },
          metadata: { source: "forge-job-admin", job_id: newJobId },
        });
      }

      // Fresh queue row for the new task (attempt_count 0, available now).
      const { data: oldQueue } = await service
        .from("task_queue")
        .select("worker_id, priority, payload, max_attempts, metadata")
        .eq("task_id", String(old.id))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const q = (oldQueue ?? {}) as Row;
      const { error: queueError } = await service.from("task_queue").insert({
        task_id: newTaskId,
        worker_id: (q.worker_id as string | undefined) ?? (old.worker_id as string | undefined) ?? null,
        queue_status: approvalRequired ? "awaiting_approval" : "queued",
        priority: (q.priority as number | undefined) ?? (old.priority as number | undefined) ?? 0,
        available_at: nowISO,
        payload: (q.payload as Record<string, unknown> | undefined) ?? (old.input as Record<string, unknown> | undefined) ?? {},
        attempt_count: 0,
        max_attempts: (q.max_attempts as number | undefined) ?? 3,
        next_retry_at: null,
        idempotency_key: `${taskKey}:queue`,
        metadata: { ...(typeof q.metadata === "object" && q.metadata !== null ? q.metadata as Row : {}), source: "forge-job-admin-retry", retried_from_task_id: String(old.id) },
      });
      if (queueError) throw new Error(`Retry queue insert failed: ${queueError.message}`);
    }

    await writeAudit(service, {
      actorUserId: user.id,
      actorType: "user",
      action: "job.retried",
      entityType: "forge_job",
      entityId: newJobId,
      before: { retried_from: jobId, status: "failed" },
      after: { status: "queued" },
      metadata: { original_job_id: jobId, task_ids: newTaskIds, approval_ids: newApprovalIds },
    });

    return jsonResponse({
      job: newJob,
      original_job_id: jobId,
      task_ids: newTaskIds,
      approval_ids: newApprovalIds,
      deduped: false,
    });
  }),
);
