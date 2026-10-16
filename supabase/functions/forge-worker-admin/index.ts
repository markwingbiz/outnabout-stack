// forge-worker-admin — Operator-only worker registry admin (Phase 8 Slice 2).
//
// POST { action: 'set_worker_status', worker_id, status: 'active'|'idle'|'disabled', idempotency_key? }
//
// Only forge_operator (admin counts). Transitions are enforced here,
// never in the UI: the status must be a legal workers.status value
// (design §4.1: 'active' | 'idle' | 'disabled').
//
// Idempotent replay: setting a worker to the status it already has
// returns its current row with deduped: true and changes nothing.
//
// DEPLOY NOTE: this function is source-only until deployed. The
// Livework+ Workers screen calls it; until it is deployed the toggle
// fails with an error shown on screen. Deploy with:
//   supabase functions deploy forge-worker-admin
// Do NOT use --no-verify-jwt.

import {
  HttpError,
  handleRequest,
  jsonResponse,
  parseJsonBody,
  requireOperator,
  writeAudit,
} from "../_shared/helpers.ts";

const WORKER_STATUSES = ["active", "idle", "disabled"];

Deno.serve((req) =>
  handleRequest(req, async (innerReq) => {
    const { user, service } = await requireOperator(innerReq);
    const body = await parseJsonBody(innerReq);

    const action = typeof body.action === "string" ? body.action : "";
    if (action !== "set_worker_status") {
      throw new HttpError(400, "action must be 'set_worker_status'");
    }
    const workerId = typeof body.worker_id === "string" ? body.worker_id : "";
    if (!workerId) throw new HttpError(400, "worker_id is required");
    const status = typeof body.status === "string" ? body.status.toLowerCase() : "";
    if (!WORKER_STATUSES.includes(status)) {
      throw new HttpError(400, "status must be 'active', 'idle', or 'disabled'");
    }

    const { data: worker, error } = await service
      .from("workers")
      .select("*")
      .eq("id", workerId)
      .maybeSingle();
    if (error) throw new Error(`Worker lookup failed: ${error.message}`);
    if (!worker) throw new HttpError(404, "worker not found");

    // Idempotent replay: already in the target status -> change nothing.
    if (String(worker.status ?? "").toLowerCase() === status) {
      return jsonResponse({ worker, deduped: true });
    }

    const { data: updated, error: updateError } = await service
      .from("workers")
      .update({ status })
      .eq("id", workerId)
      .select("*")
      .single();
    if (updateError || !updated) {
      throw new Error(`Worker status update failed: ${updateError?.message ?? "unknown"}`);
    }

    await writeAudit(service, {
      actorUserId: user.id,
      actorType: "user",
      action: "worker.status_changed",
      entityType: "worker",
      entityId: workerId,
      before: { status: worker.status ?? null },
      after: { status },
      metadata: {},
    });

    return jsonResponse({ worker: updated, deduped: false });
  }),
);
