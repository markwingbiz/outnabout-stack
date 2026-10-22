// forge-deliverable-admin — Operator-only deliverable lifecycle (Phase 8 Slice 2).
//
// POST { action: 'transition_deliverable', deliverable_id,
//        transition: 'approve'|'publish'|'reject', idempotency_key?,
//        reason? }
//
// Only forge_operator (admin counts). Transitions are enforced here,
// never in the UI (design §5.1):
//   approve: ready -> approved
//   publish: approved -> published (requires the linked approval, when
//            approval_id is set, to be 'approved' — a deliverable is
//            only published after its approval, if required, is approved)
//   reject:  draft|ready -> failed (the deliverables CHECK allows only
//            draft/ready/approved/published/failed — there is no
//            'rejected'. 'failed' means REWORK, never a dead end: the
//            row is stamped with metadata.needs_rework so the worker
//            loop picks it back up for revision. Mark, 2026-10-21.)
//
// Idempotent replay: a deliverable already in the target status returns
// its current row with deduped: true and changes nothing.
//
// This function does NOT decide approvals — forge-approve owns approval
// decisions. It only moves the deliverable's own status, and for publish
// it verifies the linked approval's state.
//
// DEPLOY NOTE: this function is source-only until deployed. The
// Livework+ Deliverables screen calls it; until it is deployed the
// Approve/Publish/Reject buttons fail with an error shown on screen.
// Deploy with:
//   supabase functions deploy forge-deliverable-admin
// Do NOT use --no-verify-jwt.

import {
  HttpError,
  handleRequest,
  jsonResponse,
  parseJsonBody,
  requireOperator,
  writeAudit,
} from "../_shared/helpers.ts";

const TRANSITIONS: Record<
  string,
  { from: string[]; to: string; audit: string }
> = {
  approve: { from: ["ready"], to: "approved", audit: "deliverable.approved" },
  publish: { from: ["approved"], to: "published", audit: "deliverable.published" },
  reject: { from: ["draft", "ready"], to: "failed", audit: "deliverable.rejected" },
};

Deno.serve((req) =>
  handleRequest(req, async (innerReq) => {
    const { user, service } = await requireOperator(innerReq);
    const body = await parseJsonBody(innerReq);

    const action = typeof body.action === "string" ? body.action : "";
    if (action !== "transition_deliverable") {
      throw new HttpError(400, "action must be 'transition_deliverable'");
    }
    const deliverableId =
      typeof body.deliverable_id === "string" ? body.deliverable_id : "";
    if (!deliverableId) throw new HttpError(400, "deliverable_id is required");
    const transition =
      typeof body.transition === "string" ? body.transition.toLowerCase() : "";
    const rule = TRANSITIONS[transition];
    if (!rule) {
      throw new HttpError(400, "transition must be 'approve', 'publish', or 'reject'");
    }
    // Optional rejection reason (the current Livework+ caller does not
    // send one; accepted so a reason can ride along when provided).
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    const { data: deliverable, error } = await service
      .from("deliverables")
      .select("*")
      .eq("id", deliverableId)
      .maybeSingle();
    if (error) throw new Error(`Deliverable lookup failed: ${error.message}`);
    if (!deliverable) throw new HttpError(404, "deliverable not found");

    const current = String(deliverable.status ?? "").toLowerCase();

    // Idempotent replay: already in the target status -> change nothing.
    if (current === rule.to) {
      return jsonResponse({ deliverable, deduped: true });
    }

    if (!rule.from.includes(current)) {
      throw new HttpError(
        400,
        `Cannot ${transition} a deliverable in status '${deliverable.status}'. ` +
          `Allowed from: ${rule.from.join(", ")}.`,
      );
    }

    // Publish gate: when the deliverable carries an approval_id, the
    // linked approval must be 'approved' before publishing.
    if (transition === "publish" && deliverable.approval_id) {
      const { data: approval, error: approvalError } = await service
        .from("approvals")
        .select("id, status")
        .eq("id", String(deliverable.approval_id))
        .maybeSingle();
      if (approvalError) throw new Error(`Approval lookup failed: ${approvalError.message}`);
      if (!approval || String(approval.status ?? "").toLowerCase() !== "approved") {
        throw new HttpError(
          409,
          "Linked approval is not approved — publish is blocked until the approval is approved.",
        );
      }
    }

    const update: Record<string, unknown> = { status: rule.to };
    if (transition === "reject") {
      // REWORK stamp (Mark, 2026-10-21): 'failed' sends the deliverable
      // back to its producing worker via the loop, so record everything
      // the loop needs to pick it back up — merged over existing metadata.
      const existingMetadata =
        deliverable.metadata &&
        typeof deliverable.metadata === "object" &&
        !Array.isArray(deliverable.metadata)
          ? (deliverable.metadata as Record<string, unknown>)
          : {};
      update.metadata = {
        ...existingMetadata,
        needs_rework: true,
        rework_reason: reason || null,
        rejected_at: new Date().toISOString(),
        rejected_from_status: current,
      };
    }

    const { data: updated, error: updateError } = await service
      .from("deliverables")
      .update(update)
      .eq("id", deliverableId)
      .select("*")
      .single();
    if (updateError || !updated) {
      throw new Error(`Deliverable update failed: ${updateError?.message ?? "unknown"}`);
    }

    await writeAudit(service, {
      actorUserId: user.id,
      actorType: "user",
      action: rule.audit,
      entityType: "deliverable",
      entityId: deliverableId,
      before: { status: deliverable.status ?? null },
      after: { status: rule.to },
      metadata: { transition, approval_id: deliverable.approval_id ?? null },
    });

    return jsonResponse({ deliverable: updated, deduped: false });
  }),
);
