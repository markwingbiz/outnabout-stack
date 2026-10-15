// forge-command — Forge intake + structural planning (Phase A).
//
// POST { text, funnel_id?, thread_id?, idempotency_key? }
// Creates: forge_threads row (status 'active') + forge_jobs row
// (status 'queued') + one tasks row per planned step + task_queue rows +
// forge_messages transcript (user message + forge plan summary).
//
// Planning is STRUCTURAL ONLY: if funnel_id is given, or the text contains
// a funnel name/slug, the command attaches to that funnel and uses its
// config.task_sequence; otherwise a single general step is created.
// Approval-gated actions (external_send / publish / spend / delete /
// production_change) get approval_required=true on the step and a pending
// approvals row. NOTHING IS EXECUTED here — forge-worker (Phase B) runs
// approved, queued work.

import {
  type GatedAction,
  HttpError,
  classifyGatedActions,
  findByIdempotencyKey,
  handleRequest,
  jsonResponse,
  parseJsonBody,
  requireOperator,
  taskTypeToGatedAction,
  writeAudit,
} from "../_shared/helpers.ts";

interface PlanStep {
  stepIndex: number;
  taskType: string;
  title: string;
  workerSlug: string | null;
  approvalRequired: boolean;
  gatedActions: GatedAction[];
}

Deno.serve((req) =>
  handleRequest(req, async (innerReq) => {
    const { user, service } = await requireOperator(innerReq);
    const body = await parseJsonBody(innerReq);

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) throw new HttpError(400, "text is required");
    const funnelId = typeof body.funnel_id === "string" && body.funnel_id ? body.funnel_id : null;
    const threadIdParam = typeof body.thread_id === "string" && body.thread_id ? body.thread_id : null;
    const idempotencyKey = typeof body.idempotency_key === "string" && body.idempotency_key
      ? body.idempotency_key
      : null;

    // Idempotency: a prior job with this key returns its existing result.
    if (idempotencyKey) {
      const existing = await findByIdempotencyKey(service, "forge_jobs", idempotencyKey);
      if (existing) {
        const { data: existingTasks } = await service
          .from("tasks")
          .select("id")
          .eq("forge_job_id", String(existing.id))
          .order("step_index", { ascending: true });
        return jsonResponse({
          thread_id: existing.thread_id,
          job_id: existing.id,
          task_ids: ((existingTasks ?? []) as Array<{ id: string }>).map((t) => t.id),
          status: existing.status,
          deduped: true,
        });
      }
    }

    // Resolve the funnel: explicit funnel_id wins; otherwise match a funnel
    // name/slug appearing in the command text (longest match wins).
    let funnel: { id: string; name: string | null; slug: string | null; config: Record<string, unknown> } | null = null;
    if (funnelId) {
      const { data, error } = await service
        .from("funnels")
        .select("id, name, slug, config")
        .eq("id", funnelId)
        .maybeSingle();
      if (error) throw new Error(`Funnel lookup failed: ${error.message}`);
      if (!data) throw new HttpError(404, "funnel not found");
      funnel = {
        id: String(data.id),
        name: (data.name as string | null) ?? null,
        slug: (data.slug as string | null) ?? null,
        config: ((data.config as Record<string, unknown> | null) ?? {}),
      };
    } else {
      const { data: allFunnels } = await service.from("funnels").select("id, name, slug, config");
      const lower = text.toLowerCase();
      const matches = ((allFunnels ?? []) as Array<Record<string, unknown>>)
        .filter((f) => {
          const name = String(f.name ?? "").toLowerCase();
          const slug = String(f.slug ?? "").toLowerCase().replace(/-/g, " ");
          return (name && lower.includes(name)) || (slug && lower.includes(slug));
        })
        .sort((a, b) => String(b.name ?? "").length - String(a.name ?? "").length);
      if (matches.length > 0) {
        const m = matches[0];
        funnel = {
          id: String(m.id),
          name: (m.name as string | null) ?? null,
          slug: (m.slug as string | null) ?? null,
          config: ((m.config as Record<string, unknown> | null) ?? {}),
        };
      }
    }

    // Build the plan steps.
    const steps: PlanStep[] = [];
    const sequence = Array.isArray(funnel?.config?.task_sequence)
      ? (funnel!.config.task_sequence as Array<Record<string, unknown>>)
      : [];
    if (funnel && sequence.length > 0) {
      sequence.forEach((step, i) => {
        const taskType = typeof step.task_type === "string" ? step.task_type : "funnel_step";
        const gated = taskTypeToGatedAction(taskType);
        steps.push({
          stepIndex: i + 1,
          taskType,
          title: typeof step.title === "string" ? step.title : `${taskType} (step ${i + 1})`,
          workerSlug: typeof step.worker_slug === "string" ? step.worker_slug : null,
          approvalRequired: step.approval_required === true || gated !== null,
          gatedActions: gated ? [gated] : [],
        });
      });
    } else {
      const gatedActions = classifyGatedActions(text);
      steps.push({
        stepIndex: 1,
        taskType: "command_execute",
        title: text.slice(0, 120),
        workerSlug: null,
        approvalRequired: gatedActions.length > 0,
        gatedActions,
      });
    }

    // Thread: reuse the caller's thread when given, else create one.
    let threadId = threadIdParam;
    if (threadId) {
      const { data: existingThread } = await service
        .from("forge_threads")
        .select("id, owner_user_id")
        .eq("id", threadId)
        .maybeSingle();
      if (!existingThread) throw new HttpError(404, "thread not found");
      if (existingThread.owner_user_id !== user.id && !user.isAdmin) {
        throw new HttpError(403, "thread belongs to another user");
      }
    } else {
      const { data: thread, error: threadError } = await service
        .from("forge_threads")
        .insert({
          owner_user_id: user.id,
          title: text.slice(0, 60),
          status: "active",
          funnel_id: funnel?.id ?? null,
        })
        .select("id")
        .single();
      if (threadError || !thread) throw new Error(`Thread creation failed: ${threadError?.message ?? "unknown"}`);
      threadId = String(thread.id);
    }

    // Job.
    const jobKey = idempotencyKey ?? crypto.randomUUID();
    const allGated = [...new Set(steps.flatMap((s) => s.gatedActions))];
    const { data: job, error: jobError } = await service
      .from("forge_jobs")
      .insert({
        job_type: "forge_command",
        status: "queued",
        title: text.slice(0, 120),
        detail: text,
        thread_id: threadId,
        funnel_id: funnel?.id ?? null,
        plan_json: {
          text,
          parsed_intent: {
            funnel_id: funnel?.id ?? null,
            funnel_name: funnel?.name ?? null,
            gated_actions: allGated,
            steps: steps.map((s) => ({
              step_index: s.stepIndex,
              task_type: s.taskType,
              worker_slug: s.workerSlug,
              approval_required: s.approvalRequired,
              gated_actions: s.gatedActions,
            })),
          },
        },
        idempotency_key: jobKey,
      })
      .select("id")
      .single();
    if (jobError || !job) throw new Error(`Job creation failed: ${jobError?.message ?? "unknown"}`);
    const jobId = String(job.id);

    // Tasks + approvals + queue rows.
    const taskIds: string[] = [];
    const approvalIds: string[] = [];
    for (const step of steps) {
      let workerId: string | null = null;
      let workerName: string | null = null;
      if (step.workerSlug) {
        const { data: worker } = await service
          .from("workers")
          .select("id, name")
          .eq("slug", step.workerSlug)
          .maybeSingle();
        if (worker) {
          workerId = String(worker.id);
          workerName = String(worker.name);
        }
      }
      const taskStatus = step.approvalRequired ? "awaiting_approval" : "queued";
      const taskKey = `${jobKey}:step:${step.stepIndex}`;
      const { data: task, error: taskError } = await service
        .from("tasks")
        .insert({
          funnel_id: funnel?.id ?? null,
          worker_id: workerId,
          worker_name: workerName,
          task_type: step.taskType,
          title: step.title,
          input: { text, step: step.stepIndex, task_type: step.taskType },
          status: taskStatus,
          priority: 0,
          thread_id: threadId,
          forge_job_id: jobId,
          step_index: step.stepIndex,
          approval_required: step.approvalRequired,
          idempotency_key: taskKey,
          metadata: { source: "forge-command" },
        })
        .select("id")
        .single();
      if (taskError || !task) throw new Error(`Task creation failed: ${taskError?.message ?? "unknown"}`);
      const taskId = String(task.id);
      taskIds.push(taskId);

      // One approval per gated action class (or one 'general' approval when
      // the step is gated without a specific class).
      const approvalTypes: Array<GatedAction | "general"> = step.approvalRequired
        ? (step.gatedActions.length > 0 ? step.gatedActions : ["general"])
        : [];
      let firstApprovalId: string | null = null;
      for (const requestType of approvalTypes) {
        const { data: approval, error: approvalError } = await service
          .from("approvals")
          .insert({
            status: "pending",
            request_type: requestType,
            title: `Approval required: ${requestType} — ${step.title}`.slice(0, 200),
            description: `Command requested an approval-gated action (${requestType}). Review the exact action before approving. Nothing has been sent, published, spent, deleted, or changed.`,
            payload: {
              text,
              task_type: step.taskType,
              funnel_id: funnel?.id ?? null,
              step_index: step.stepIndex,
              gated_action: requestType,
            },
            task_id: taskId,
            funnel_id: funnel?.id ?? null,
            worker_id: workerId,
            requested_by: user.id,
            priority: "normal",
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .select("id")
          .single();
        if (approvalError || !approval) throw new Error(`Approval creation failed: ${approvalError?.message ?? "unknown"}`);
        const approvalId = String(approval.id);
        approvalIds.push(approvalId);
        if (!firstApprovalId) firstApprovalId = approvalId;
        await writeAudit(service, {
          actorUserId: user.id,
          actorType: "user",
          action: "approval.requested",
          entityType: "approval",
          entityId: approvalId,
          after: { status: "pending", request_type: requestType, task_id: taskId },
          metadata: { source: "forge-command", job_id: jobId },
        });
      }
      if (firstApprovalId) {
        await service.from("tasks").update({ approval_id: firstApprovalId }).eq("id", taskId);
      }

      const { error: queueError } = await service.from("task_queue").insert({
        task_id: taskId,
        worker_id: workerId,
        queue_status: taskStatus === "awaiting_approval" ? "awaiting_approval" : "queued",
        priority: 0,
        available_at: new Date().toISOString(),
        payload: { text, step: step.stepIndex, task_type: step.taskType },
        attempt_count: 0,
        max_attempts: 3,
        idempotency_key: taskKey,
        metadata: { source: "forge-command" },
      });
      if (queueError) throw new Error(`task_queue insert failed: ${queueError.message}`);
    }

    // Transcript: user message + deterministic plan summary (not a result).
    const planSummary = [
      `Plan created: ${steps.length} step(s)${funnel ? ` for funnel "${funnel.name}"` : ""}.`,
      `Job ${jobId} is queued.`,
      approvalIds.length > 0
        ? `${approvalIds.length} approval(s) pending — gated steps wait for approval and will not run.`
        : "No approvals required for this plan.",
      "Nothing has been executed.",
    ].join(" ");
    await service.from("forge_messages").insert([
      { thread_id: threadId, role: "user", content: text },
      { thread_id: threadId, role: "forge", content: planSummary },
    ]);

    await writeAudit(service, {
      actorUserId: user.id,
      actorType: "user",
      action: "command.received",
      entityType: "thread",
      entityId: threadId,
      after: { text, funnel_id: funnel?.id ?? null },
      metadata: { job_id: jobId },
    });
    await writeAudit(service, {
      actorUserId: user.id,
      actorType: "user",
      action: "plan.created",
      entityType: "forge_job",
      entityId: jobId,
      after: { status: "queued", task_ids: taskIds, approval_ids: approvalIds },
      metadata: { thread_id: threadId },
    });

    return jsonResponse({
      thread_id: threadId,
      job_id: jobId,
      task_ids: taskIds,
      status: "queued",
      approval_ids: approvalIds,
      deduped: false,
    });
  }),
);
