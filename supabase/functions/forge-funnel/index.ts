// forge-funnel — Funnel lifecycle controls (Phase A).
//
// POST { action: 'validate'|'activate'|'pause'|'resume'|'stop'|'status', funnel_id }
// Lifecycle: DRAFT → VALIDATED → READY → ACTIVE → PAUSED → COMPLETED/FAILED;
// STOPPED is terminal (no transitions out); APPROVAL_REQUIRED gates
// activation when the funnel declares any approval-gated step.
// Status changes ONLY through this function — the UI never writes
// funnels.status directly.
//
// A funnel is NEVER ACTIVE unless its gates pass: workers assigned, config
// present, money goal present, worker contracts complete (activate/resume).
// 'validate' checks workers + config + money goal only (no contracts) and
// never demotes a funnel already past VALIDATED.
//
// Revenue rule: money-goal progress uses money_funnels.verified_revenue_cents
// (stored verified figures). Amount-0 revenue_events are tracking only and
// are never summed as revenue. Projected/estimated revenue is never reported
// as earned.

import {
  HttpError,
  checkFunnelGates,
  getAssignedWorkerIds,
  getMoneyTarget,
  handleRequest,
  jsonResponse,
  parseJsonBody,
  requireOperator,
  writeAudit,
  type SupabaseClient,
} from "../_shared/helpers.ts";

const TERMINAL = ["COMPLETED", "FAILED", "STOPPED"];
const GATED_WORKER_ACTIONS = ["external_send", "publish", "spend", "delete", "production_change"];

function normalizeStatus(status: unknown): string {
  return String(status ?? "DRAFT").toUpperCase();
}

async function updateFunnelStatus(
  service: SupabaseClient,
  funnelId: string,
  status: string,
  userId: string,
  action: string,
  beforeStatus: string,
): Promise<void> {
  const { error } = await service.from("funnels").update({ status }).eq("id", funnelId);
  if (error) throw new Error(`Funnel status update failed: ${error.message}`);
  await writeAudit(service, {
    actorUserId: userId,
    actorType: "user",
    action,
    entityType: "funnel",
    entityId: funnelId,
    before: { status: beforeStatus },
    after: { status },
    metadata: {},
  });
}

/** Full status payload: funnel + money views + money-goal progress + workers + jobs + approvals. */
async function buildStatusPayload(service: SupabaseClient, funnel: Record<string, unknown>) {
  const funnelId = String(funnel.id);
  const { data: moneyRows } = await service
    .from("money_funnels")
    .select("*")
    .eq("funnel_id", funnelId)
    .order("created_at", { ascending: true });
  const moneyList = (moneyRows ?? []) as Array<Record<string, unknown>>;
  // Canonical money view: prefer the backfill mirror (key backfill_*), else the first row.
  // SCHEMA NOTE: money_funnels.funnel_id is a plain FK (NOT unique) per the
  // migration deviation — a funnel may have several money views.
  const canonical =
    moneyList.find((m) => String(m.key ?? "").startsWith("backfill_")) ?? moneyList[0] ?? null;
  const progress = canonical
    ? {
      revenue_model: canonical.revenue_model ?? null,
      revenue_target_cents: getMoneyTarget(canonical),
      verified_revenue_cents: Number(canonical.verified_revenue_cents ?? 0),
      spent_cents: Number(canonical.spent_cents ?? 0),
      budget_cents: Number(canonical.budget_cents ?? 0),
      currency: canonical.currency ?? "USD",
      net_cents: Number(canonical.verified_revenue_cents ?? 0) - Number(canonical.spent_cents ?? 0),
    }
    : null;

  const workerIds = await getAssignedWorkerIds(service, funnelId);
  let workers: Array<Record<string, unknown>> = [];
  if (workerIds.length > 0) {
    const { data } = await service
      .from("workers")
      .select("id, slug, name, status, last_run_at, input_schema, output_schema, tools, queue_name")
      .in("id", workerIds);
    workers = (data ?? []) as Array<Record<string, unknown>>;
  }
  const { data: jobs } = await service
    .from("forge_jobs")
    .select("id, job_type, status, title, created_at, completed_at, error_text")
    .eq("funnel_id", funnelId)
    .order("created_at", { ascending: false })
    .limit(20);
  const { data: approvals } = await service
    .from("approvals")
    .select("id, status, request_type, title, created_at, expires_at")
    .eq("funnel_id", funnelId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return {
    funnel,
    money_funnels: moneyList,
    money_goal: progress,
    workers,
    recent_jobs: jobs ?? [],
    pending_approvals: approvals ?? [],
  };
}

Deno.serve((req) =>
  handleRequest(req, async (innerReq) => {
    const { user, service } = await requireOperator(innerReq);
    const body = await parseJsonBody(innerReq);

    const action = typeof body.action === "string" ? body.action.toLowerCase() : "";
    const funnelId = typeof body.funnel_id === "string" ? body.funnel_id : "";
    if (!["validate", "activate", "pause", "resume", "stop", "status"].includes(action)) {
      throw new HttpError(400, "action must be one of: validate, activate, pause, resume, stop, status");
    }
    if (!funnelId) throw new HttpError(400, "funnel_id is required");

    const { data: funnel, error } = await service
      .from("funnels")
      .select("*")
      .eq("id", funnelId)
      .maybeSingle();
    if (error) throw new Error(`Funnel lookup failed: ${error.message}`);
    if (!funnel) throw new HttpError(404, "funnel not found");
    const status = normalizeStatus(funnel.status);

    switch (action) {
      case "validate": {
        const gates = await checkFunnelGates(service, funnelId, { includeContracts: false });
        if (!gates.ok) {
          // Missing gates: report them, change NOTHING.
          return jsonResponse({
            funnel_id: funnelId,
            status,
            valid: false,
            missing: gates.missing,
            gates: gates.details,
          });
        }
        // Never demote a funnel that is already past VALIDATED.
        if (status === "DRAFT" || status === "VALIDATED") {
          await updateFunnelStatus(service, funnelId, "VALIDATED", user.id, "funnel.validated", status);
          return jsonResponse({ funnel_id: funnelId, status: "VALIDATED", valid: true, missing: [], gates: gates.details });
        }
        return jsonResponse({ funnel_id: funnelId, status, valid: true, missing: [], gates: gates.details });
      }

      case "activate": {
        if (status === "ACTIVE") {
          return jsonResponse({ funnel_id: funnelId, status: "ACTIVE", already: true });
        }
        if (status !== "VALIDATED" && status !== "READY") {
          throw new HttpError(
            409,
            `Cannot activate from ${status}. Run validate first (DRAFT → VALIDATED → READY → ACTIVE).`,
          );
        }
        const gates = await checkFunnelGates(service, funnelId);
        if (!gates.ok) {
          throw new HttpError(409, `Activation gates not met: ${gates.missing.join(", ")}`);
        }
        // Gated activation: any approval-gated step, approval checkpoint,
        // or assigned worker with an approval gate -> APPROVAL_REQUIRED.
        const config = (funnel.config ?? {}) as Record<string, unknown>;
        const sequence = Array.isArray(config.task_sequence)
          ? (config.task_sequence as Array<Record<string, unknown>>)
          : [];
        const stepGated = sequence.some((s) => s.approval_required === true);
        const checkpoints = Array.isArray(config.approval_checkpoints) ? config.approval_checkpoints : [];
        let workerGated = false;
        const workerIds = await getAssignedWorkerIds(service, funnelId);
        if (workerIds.length > 0) {
          const { data: workers } = await service
            .from("workers")
            .select("requires_approval_for")
            .in("id", workerIds);
          workerGated = ((workers ?? []) as Array<Record<string, unknown>>).some((w) =>
            Array.isArray(w.requires_approval_for) &&
            (w.requires_approval_for as unknown[]).some((a) => GATED_WORKER_ACTIONS.includes(String(a)))
          );
        }
        if (stepGated || checkpoints.length > 0 || workerGated) {
          const { data: approval, error: approvalError } = await service
            .from("approvals")
            .insert({
              status: "pending",
              request_type: "funnel_activate",
              title: `Activate funnel: ${funnel.name ?? funnelId}`,
              description:
                "Activating this funnel may run approval-gated steps (external send / publish / spend / delete / production change). Approve to activate.",
              payload: { funnel_id: funnelId, action: "activate" },
              funnel_id: funnelId,
              requested_by: user.id,
              priority: "normal",
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .select("id")
            .single();
          if (approvalError || !approval) {
            throw new Error(`Activation approval creation failed: ${approvalError?.message ?? "unknown"}`);
          }
          await updateFunnelStatus(service, funnelId, "APPROVAL_REQUIRED", user.id, "funnel.activation_requested", status);
          await writeAudit(service, {
            actorUserId: user.id,
            actorType: "user",
            action: "approval.requested",
            entityType: "approval",
            entityId: String(approval.id),
            after: { status: "pending", request_type: "funnel_activate", funnel_id: funnelId },
            metadata: { source: "forge-funnel" },
          });
          return jsonResponse({ funnel_id: funnelId, status: "APPROVAL_REQUIRED", approval_id: approval.id });
        }
        await updateFunnelStatus(service, funnelId, "ACTIVE", user.id, "funnel.activated", status);
        return jsonResponse({ funnel_id: funnelId, status: "ACTIVE" });
      }

      case "pause": {
        if (status === "PAUSED") {
          return jsonResponse({ funnel_id: funnelId, status: "PAUSED", already: true });
        }
        if (status !== "ACTIVE") {
          throw new HttpError(409, `Cannot pause from ${status}. Only ACTIVE funnels can be paused.`);
        }
        await updateFunnelStatus(service, funnelId, "PAUSED", user.id, "funnel.paused", status);
        return jsonResponse({ funnel_id: funnelId, status: "PAUSED" });
      }

      case "resume": {
        if (status === "ACTIVE") {
          return jsonResponse({ funnel_id: funnelId, status: "ACTIVE", already: true });
        }
        if (status !== "PAUSED") {
          throw new HttpError(409, `Cannot resume from ${status}. Only PAUSED funnels can be resumed.`);
        }
        // Resume re-checks the full gates (money goal + worker contracts).
        const gates = await checkFunnelGates(service, funnelId);
        if (!gates.ok) {
          throw new HttpError(409, `Resume gates not met: ${gates.missing.join(", ")}`);
        }
        await updateFunnelStatus(service, funnelId, "ACTIVE", user.id, "funnel.resumed", status);
        return jsonResponse({ funnel_id: funnelId, status: "ACTIVE" });
      }

      case "stop": {
        if (status === "STOPPED") {
          return jsonResponse({ funnel_id: funnelId, status: "STOPPED", already: true });
        }
        if (TERMINAL.includes(status)) {
          throw new HttpError(409, `Cannot stop a ${status} funnel (terminal).`);
        }
        await updateFunnelStatus(service, funnelId, "STOPPED", user.id, "funnel.stopped", status);
        return jsonResponse({ funnel_id: funnelId, status: "STOPPED" });
      }

      case "status": {
        return jsonResponse(await buildStatusPayload(service, funnel));
      }
    }
  }),
);
