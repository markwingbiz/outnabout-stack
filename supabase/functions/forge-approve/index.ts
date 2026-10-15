// forge-approve — Decide an approval (Phase A).
//
// POST { approval_id, decision: 'approve'|'approved'|'reject'|'rejected', reason? }
// Only forge_operator (admin counts). Idempotent: deciding an already-decided
// approval returns its current state and changes nothing.
//
// On approve: approval -> 'approved'; linked tasks blocked on it move
// 'awaiting_approval' -> 'queued' (and their task_queue rows too); linked
// jobs move to 'queued' only when NO OTHER pending approval still blocks
// them. A 'funnel_activate' approval moves its funnel APPROVAL_REQUIRED ->
// ACTIVE (gates re-checked at approval time).
//
// On reject: approval -> 'rejected'; linked tasks/jobs -> 'cancelled'.
// A rejected action is NEVER executed. A rejected 'funnel_activate'
// approval returns its funnel to VALIDATED.
//
// SCHEMA NOTE: the approvals table has NO decided_by column (per the Phase A
// migration). The decider is recorded in approved_by. decided_at is set.
//
// DEVIATION FROM DESIGN §5.2: the design lets a job continue with remaining
// steps when one step's approval is rejected. This function follows the
// stricter Phase A rule instead: rejection cancels the linked job.

import {
  HttpError,
  checkFunnelGates,
  handleRequest,
  jsonResponse,
  parseJsonBody,
  requireOperator,
  writeAudit,
  type SupabaseClient,
} from "../_shared/helpers.ts";

const DECIDED = ["approved", "rejected", "expired", "cancelled"];

/** Task ids linked to an approval: tasks.approval_id = id, plus approval.task_id. */
async function linkedTaskIds(
  service: SupabaseClient,
  approval: Record<string, unknown>,
): Promise<string[]> {
  const ids = new Set<string>();
  const { data: byApproval } = await service
    .from("tasks")
    .select("id")
    .eq("approval_id", String(approval.id));
  for (const t of (byApproval ?? []) as Array<Record<string, unknown>>) ids.add(String(t.id));
  if (approval.task_id) ids.add(String(approval.task_id));
  return [...ids];
}

/** Job ids linked to an approval: forge_jobs.approval_id = id, plus jobs owning linked tasks. */
async function linkedJobIds(
  service: SupabaseClient,
  approval: Record<string, unknown>,
  taskIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  const { data: byApproval } = await service
    .from("forge_jobs")
    .select("id")
    .eq("approval_id", String(approval.id));
  for (const j of (byApproval ?? []) as Array<Record<string, unknown>>) ids.add(String(j.id));
  if (taskIds.length > 0) {
    const { data: tasks } = await service
      .from("tasks")
      .select("forge_job_id")
      .in("id", taskIds);
    for (const t of (tasks ?? []) as Array<Record<string, unknown>>) {
      if (t.forge_job_id) ids.add(String(t.forge_job_id));
    }
  }
  return [...ids];
}

/** True when a job is still blocked by some OTHER pending approval. */
async function jobHasOtherPendingApprovals(
  service: SupabaseClient,
  jobId: string,
  excludeApprovalId: string,
): Promise<boolean> {
  const candidateIds = new Set<string>();
  const { data: job } = await service
    .from("forge_jobs")
    .select("approval_id")
    .eq("id", jobId)
    .maybeSingle();
  if (job?.approval_id && String(job.approval_id) !== excludeApprovalId) {
    candidateIds.add(String(job.approval_id));
  }
  const { data: tasks } = await service
    .from("tasks")
    .select("approval_id")
    .eq("forge_job_id", jobId);
  for (const t of (tasks ?? []) as Array<Record<string, unknown>>) {
    if (t.approval_id && String(t.approval_id) !== excludeApprovalId) {
      candidateIds.add(String(t.approval_id));
    }
  }
  if (candidateIds.size === 0) return false;
  const { data: pending } = await service
    .from("approvals")
    .select("id")
    .in("id", [...candidateIds])
    .eq("status", "pending");
  return ((pending ?? []) as Array<unknown>).length > 0;
}

/** Current task/job state for an approval (used in every response). */
async function buildState(
  service: SupabaseClient,
  approval: Record<string, unknown>,
  deduped: boolean,
) {
  const taskIds = await linkedTaskIds(service, approval);
  const jobIds = await linkedJobIds(service, approval, taskIds);
  let tasks: Array<Record<string, unknown>> = [];
  if (taskIds.length > 0) {
    const { data } = await service.from("tasks").select("id, status").in("id", taskIds);
    tasks = (data ?? []) as Array<Record<string, unknown>>;
  }
  let jobs: Array<Record<string, unknown>> = [];
  if (jobIds.length > 0) {
    const { data } = await service.from("forge_jobs").select("id, status").in("id", jobIds);
    jobs = (data ?? []) as Array<Record<string, unknown>>;
  }
  return {
    approval,
    tasks,
    jobs,
    task_status: tasks[0]?.status ?? null,
    job_status: jobs[0]?.status ?? null,
    deduped,
  };
}

/** Cancel everything linked to an approval (reject + expire paths). */
async function cancelLinked(
  service: SupabaseClient,
  approval: Record<string, unknown>,
): Promise<{ taskIds: string[]; jobIds: string[] }> {
  const taskIds = await linkedTaskIds(service, approval);
  const jobIds = await linkedJobIds(service, approval, taskIds);
  if (taskIds.length > 0) {
    await service
      .from("tasks")
      .update({ status: "cancelled" })
      .in("id", taskIds)
      .eq("status", "awaiting_approval");
    await service
      .from("task_queue")
      .update({ queue_status: "cancelled" })
      .in("task_id", taskIds)
      .eq("queue_status", "awaiting_approval");
  }
  for (const jobId of jobIds) {
    await service
      .from("forge_jobs")
      .update({ status: "cancelled" })
      .eq("id", jobId)
      .in("status", ["awaiting_approval", "queued"]);
  }
  return { taskIds, jobIds };
}

Deno.serve((req) =>
  handleRequest(req, async (innerReq) => {
    const { user, service } = await requireOperator(innerReq);
    const body = await parseJsonBody(innerReq);

    const approvalId = typeof body.approval_id === "string" ? body.approval_id : "";
    if (!approvalId) throw new HttpError(400, "approval_id is required");
    const rawDecision = typeof body.decision === "string" ? body.decision.toLowerCase() : "";
    if (!["approve", "approved", "reject", "rejected"].includes(rawDecision)) {
      throw new HttpError(400, "decision must be 'approve' or 'reject'");
    }
    const approve = rawDecision === "approve" || rawDecision === "approved";
    const reason = typeof body.reason === "string" ? body.reason : null;

    const { data: approval, error } = await service
      .from("approvals")
      .select("*")
      .eq("id", approvalId)
      .maybeSingle();
    if (error) throw new Error(`Approval lookup failed: ${error.message}`);
    if (!approval) throw new HttpError(404, "approval not found");

    // Idempotent: already decided -> return current state, change nothing.
    if (DECIDED.includes(String(approval.status))) {
      return jsonResponse(await buildState(service, approval, true));
    }

    const now = new Date().toISOString();

    // Auto-expire stale pending approvals instead of deciding them.
    // Per design §5.2, expiry cancels the linked tasks/jobs like a rejection.
    if (approval.expires_at && new Date(String(approval.expires_at)).getTime() < Date.now()) {
      const { data: expired, error: expireError } = await service
        .from("approvals")
        .update({
          status: "expired",
          reviewed_at: now,
          decided_at: now,
          resolution: "expired: past expires_at",
        })
        .eq("id", approvalId)
        .select("*")
        .single();
      if (expireError || !expired) throw new Error(`Approval expiry failed: ${expireError?.message ?? "unknown"}`);
      await cancelLinked(service, approval);
      await writeAudit(service, {
        actorUserId: null,
        actorType: "system",
        action: "approval.expired",
        entityType: "approval",
        entityId: approvalId,
        before: { status: "pending" },
        after: { status: "expired" },
        metadata: { reason: "past expires_at" },
      });
      return jsonResponse({ ...(await buildState(service, expired, false)), decision: "expired" });
    }

    const patch = approve
      ? {
        status: "approved",
        approved_by: user.id,
        approved_at: now,
        decided_at: now,
        reviewed_at: now,
        reviewer_notes: reason,
        resolution: reason,
      }
      : {
        status: "rejected",
        approved_by: user.id,
        rejected_at: now,
        decided_at: now,
        reviewed_at: now,
        reviewer_notes: reason,
        resolution: reason,
      };
    const { data: updated, error: updateError } = await service
      .from("approvals")
      .update(patch)
      .eq("id", approvalId)
      .select("*")
      .single();
    if (updateError || !updated) throw new Error(`Approval update failed: ${updateError?.message ?? "unknown"}`);

    await writeAudit(service, {
      actorUserId: user.id,
      actorType: "user",
      action: approve ? "approval.approved" : "approval.rejected",
      entityType: "approval",
      entityId: approvalId,
      before: { status: "pending" },
      after: { status: updated.status, decided_by: user.id },
      metadata: { reason },
    });

    if (approve) {
      const taskIds = await linkedTaskIds(service, approval);
      const jobIds = await linkedJobIds(service, approval, taskIds);
      if (taskIds.length > 0) {
        await service
          .from("tasks")
          .update({ status: "queued" })
          .in("id", taskIds)
          .eq("status", "awaiting_approval");
        await service
          .from("task_queue")
          .update({ queue_status: "queued" })
          .in("task_id", taskIds)
          .eq("queue_status", "awaiting_approval");
      }
      for (const jobId of jobIds) {
        const stillBlocked = await jobHasOtherPendingApprovals(service, jobId, approvalId);
        if (!stillBlocked) {
          await service
            .from("forge_jobs")
            .update({ status: "queued" })
            .eq("id", jobId)
            .eq("status", "awaiting_approval");
        }
      }

      // Funnel activation approvals: APPROVAL_REQUIRED -> ACTIVE (gates re-checked).
      let funnelStatus: string | null = null;
      let gatesFailed: string[] | undefined;
      if (approval.request_type === "funnel_activate" && approval.funnel_id) {
        const funnelId = String(approval.funnel_id);
        const { data: funnel } = await service
          .from("funnels")
          .select("id, status")
          .eq("id", funnelId)
          .maybeSingle();
        if (funnel && String(funnel.status ?? "").toUpperCase() === "APPROVAL_REQUIRED") {
          const gates = await checkFunnelGates(service, funnelId);
          if (gates.ok) {
            await service.from("funnels").update({ status: "ACTIVE" }).eq("id", funnelId);
            funnelStatus = "ACTIVE";
            await writeAudit(service, {
              actorUserId: user.id,
              actorType: "user",
              action: "funnel.activated",
              entityType: "funnel",
              entityId: funnelId,
              before: { status: "APPROVAL_REQUIRED" },
              after: { status: "ACTIVE" },
              metadata: { approval_id: approvalId },
            });
          } else {
            funnelStatus = "APPROVAL_REQUIRED";
            gatesFailed = gates.missing;
            await writeAudit(service, {
              actorUserId: user.id,
              actorType: "user",
              action: "funnel.activation_blocked",
              entityType: "funnel",
              entityId: funnelId,
              before: { status: "APPROVAL_REQUIRED" },
              after: { status: "APPROVAL_REQUIRED" },
              metadata: { approval_id: approvalId, missing_gates: gates.missing },
            });
          }
        } else {
          funnelStatus = funnel ? String(funnel.status ?? "").toUpperCase() : null;
        }
      }
      return jsonResponse({
        ...(await buildState(service, updated, false)),
        funnel_status: funnelStatus,
        ...(gatesFailed ? { gates_failed: gatesFailed } : {}),
      });
    }

    // Reject: cancel linked tasks/jobs. A rejected action is never executed.
    await cancelLinked(service, approval);
    let funnelStatus: string | null = null;
    if (approval.request_type === "funnel_activate" && approval.funnel_id) {
      const funnelId = String(approval.funnel_id);
      await service.from("funnels").update({ status: "VALIDATED" }).eq("id", funnelId);
      funnelStatus = "VALIDATED";
      await writeAudit(service, {
        actorUserId: user.id,
        actorType: "user",
        action: "funnel.activation_rejected",
        entityType: "funnel",
        entityId: funnelId,
        before: { status: "APPROVAL_REQUIRED" },
        after: { status: "VALIDATED" },
        metadata: { approval_id: approvalId, reason },
      });
    }
    return jsonResponse({ ...(await buildState(service, updated, false)), funnel_status: funnelStatus });
  }),
);
