// forge-cleanup — Reap stuck Forge jobs and tasks (Phase A).
//
// POST { dry_run?: boolean (default true), max_age_minutes?: number (default 60) }
//
// Finds forge_jobs stuck in 'running' and tasks stuck in 'running' past
// their worker timeout_seconds. dry_run=true (default) returns what WOULD
// be marked failed and changes NOTHING. dry_run=false marks them 'failed'
// with an audit row each (actor 'forge-cleanup', reason 'stuck job timeout').
//
// SCHEDULING IS OUT OF SCOPE HERE: this function does not schedule anything.
// Scheduling via pg_cron is a separate Mark-approved step.
//
// SCHEMA NOTES (from the Phase A migration):
//  - forge_jobs has NO updated_at column, so stuckness is judged on
//    COALESCE(started_at, created_at).
//  - tasks has NO created_at/updated_at column, so stuckness is judged on
//    started_at only. Tasks with NULL started_at cannot be proven stuck;
//    they are reported as skipped, never marked failed.

import {
  HttpError,
  handleRequest,
  jsonResponse,
  parseJsonBody,
  requireOperator,
  writeAudit,
} from "../_shared/helpers.ts";

Deno.serve((req) =>
  handleRequest(req, async (innerReq) => {
    const { service } = await requireOperator(innerReq);
    const body = await parseJsonBody(innerReq);

    const dryRun = body.dry_run === undefined ? true : body.dry_run === true;
    let maxAgeMinutes = 60;
    if (body.max_age_minutes !== undefined) {
      const n = Number(body.max_age_minutes);
      if (!Number.isFinite(n) || n <= 0) {
        throw new HttpError(400, "max_age_minutes must be a positive number");
      }
      maxAgeMinutes = Math.min(n, 43200); // cap at 30 days
    }
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    // Stuck jobs: status 'running' and COALESCE(started_at, created_at) < cutoff.
    const { data: runningJobs, error: jobsError } = await service
      .from("forge_jobs")
      .select("id, status, started_at, created_at, title")
      .eq("status", "running");
    if (jobsError) throw new Error(`forge_jobs lookup failed: ${jobsError.message}`);
    const stuckJobs = ((runningJobs ?? []) as Array<Record<string, unknown>>).filter((j) => {
      const anchor = (j.started_at as string | null) ?? (j.created_at as string | null);
      return anchor != null && new Date(String(anchor)).getTime() < cutoff.getTime();
    });

    // Stuck tasks: status 'running' and started_at + worker timeout < now.
    const { data: runningTasks, error: tasksError } = await service
      .from("tasks")
      .select("id, status, started_at, worker_id, forge_job_id")
      .eq("status", "running");
    if (tasksError) throw new Error(`tasks lookup failed: ${tasksError.message}`);
    const taskRows = (runningTasks ?? []) as Array<Record<string, unknown>>;
    const workerIds = [...new Set(taskRows.map((t) => String(t.worker_id ?? "")).filter(Boolean))];
    const timeoutByWorker = new Map<string, number>();
    if (workerIds.length > 0) {
      const { data: workers } = await service
        .from("workers")
        .select("id, timeout_seconds")
        .in("id", workerIds);
      for (const w of (workers ?? []) as Array<Record<string, unknown>>) {
        timeoutByWorker.set(String(w.id), Number(w.timeout_seconds ?? 300));
      }
    }
    const stuckTasks: Array<Record<string, unknown>> = [];
    let skippedNullStartedAt = 0;
    const nowMs = Date.now();
    for (const t of taskRows) {
      if (!t.started_at) {
        skippedNullStartedAt += 1;
        continue;
      }
      const timeoutSeconds = t.worker_id ? (timeoutByWorker.get(String(t.worker_id)) ?? 300) : 300;
      if (new Date(String(t.started_at)).getTime() + timeoutSeconds * 1000 < nowMs) {
        stuckTasks.push(t);
      }
    }

    if (dryRun) {
      return jsonResponse({
        dry_run: true,
        max_age_minutes: maxAgeMinutes,
        cutoff: cutoff.toISOString(),
        stuck_jobs: stuckJobs.map((j) => ({
          id: j.id,
          started_at: j.started_at,
          created_at: j.created_at,
          title: j.title,
        })),
        stuck_tasks: stuckTasks.map((t) => ({
          id: t.id,
          started_at: t.started_at,
          worker_id: t.worker_id,
          forge_job_id: t.forge_job_id,
        })),
        counts: {
          stuck_jobs: stuckJobs.length,
          stuck_tasks: stuckTasks.length,
          skipped_tasks_null_started_at: skippedNullStartedAt,
        },
        note: "dry_run: nothing was changed.",
      });
    }

    const now = new Date().toISOString();
    const errors: string[] = [];
    const failedJobIds: string[] = [];
    for (const job of stuckJobs) {
      const jobId = String(job.id);
      const { error } = await service
        .from("forge_jobs")
        .update({
          status: "failed",
          error_text: "reaped: stuck (no execution progress)",
          completed_at: now,
        })
        .eq("id", jobId);
      if (error) {
        errors.push(`job ${jobId}: ${error.message}`);
        continue;
      }
      failedJobIds.push(jobId);
      try {
        await writeAudit(service, {
          actorUserId: null,
          actorType: "system",
          action: "job.reaped",
          entityType: "forge_job",
          entityId: jobId,
          before: { status: "running" },
          after: { status: "failed" },
          metadata: { actor: "forge-cleanup", reason: "stuck job timeout", max_age_minutes: maxAgeMinutes },
        });
      } catch (e) {
        errors.push(`job ${jobId} audit: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const failedTaskIds: string[] = [];
    for (const task of stuckTasks) {
      const taskId = String(task.id);
      const { error } = await service
        .from("tasks")
        .update({
          status: "failed",
          error_text: "reaped: stuck (worker timeout)",
          completed_at: now,
        })
        .eq("id", taskId);
      if (error) {
        errors.push(`task ${taskId}: ${error.message}`);
        continue;
      }
      failedTaskIds.push(taskId);
      // Best-effort: release the claim row for the reaped task, if any.
      await service
        .from("task_queue")
        .update({ queue_status: "failed", last_error: "reaped: stuck (worker timeout)" })
        .eq("task_id", taskId)
        .eq("queue_status", "claimed");
      try {
        await writeAudit(service, {
          actorUserId: null,
          actorType: "system",
          action: "task.reaped",
          entityType: "task",
          entityId: taskId,
          before: { status: "running" },
          after: { status: "failed" },
          metadata: { actor: "forge-cleanup", reason: "stuck job timeout", max_age_minutes: maxAgeMinutes },
        });
      } catch (e) {
        errors.push(`task ${taskId} audit: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return jsonResponse({
      dry_run: false,
      max_age_minutes: maxAgeMinutes,
      cutoff: cutoff.toISOString(),
      failed_jobs: failedJobIds,
      failed_tasks: failedTaskIds,
      counts: {
        failed_jobs: failedJobIds.length,
        failed_tasks: failedTaskIds.length,
        skipped_tasks_null_started_at: skippedNullStartedAt,
      },
      errors,
    });
  }),
);
