// Livework — venue verification helpers (verification gate v1).
//
// The REAL gate is server-side: bownd-sync refuses to publish anything
// whose venue is not 'verified' (venues.verification_status), and a
// database trigger stops tenants from granting themselves verification.
// This file is only the app-side surface: status labels, the
// request-review action, and the operator review RPCs.
//
// v2 phone codes slot in later by writing the same columns with
// verification_method='phone_code' — the gate reads STATUS only.
import { supabase } from "./supabase";

export type VerificationStatus = "unverified" | "pending_review" | "verified" | "rejected";

export function verificationStatusOf(v: {
  verification_status?: unknown;
  is_test?: boolean;
}): VerificationStatus | "test" {
  if (v.is_test === true) return "test";
  const s = typeof v.verification_status === "string" ? v.verification_status : "unverified";
  if (s === "verified" || s === "pending_review" || s === "rejected") return s;
  return "unverified";
}

export function verificationLabel(status: VerificationStatus | "test"): string {
  if (status === "verified") return "Verified";
  if (status === "pending_review") return "In review";
  if (status === "rejected") return "Not verified";
  if (status === "test") return "Test data";
  return "Unverified";
}

export function verificationHint(status: VerificationStatus | "test"): string {
  if (status === "verified") return "Approved — this venue can publish to Bownd.";
  if (status === "pending_review")
    return "An operator is checking this venue. Publishing unlocks after approval.";
  if (status === "rejected")
    return "Verification was declined. Request a review again after fixing your details.";
  if (status === "test") return "Operator test venue — exempt from verification.";
  return "Only verified venues publish to Bownd. Request a review to get verified.";
}

/** True when the venue is allowed to publish (UX gate only — bownd-sync re-checks). */
export function canPublishToBownd(v: {
  verification_status?: unknown;
  is_test?: boolean;
}): boolean {
  if (v.is_test === true) return true;
  return verificationStatusOf(v) === "verified";
}

/**
 * Request a verification review for one of the vendor's own venues.
 * Moves it into the operator's review queue. The database trigger
 * allows ONLY the unverified/rejected -> pending_review move, so this
 * cannot grant verification by itself.
 */
export async function requestVerificationReview(venueId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("venues")
    .update({ verification_status: "pending_review" })
    .eq("id", venueId);
  if (error) throw error;
}

export type PendingVerification = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  tenantId: string | null;
  createdAt: string | null;
};

/** Operator-only: pending venue claims across ALL tenants. */
export async function listPendingVerifications(): Promise<PendingVerification[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("list_pending_venue_verifications");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    name: String(r.name ?? "Unnamed venue"),
    address: typeof r.address === "string" ? r.address : null,
    city: typeof r.city === "string" ? r.city : null,
    state: typeof r.state === "string" ? r.state : null,
    phone: typeof r.phone === "string" ? r.phone : null,
    website: typeof r.website === "string" ? r.website : null,
    tenantId: typeof r.tenant_id === "string" ? r.tenant_id : null,
    createdAt: typeof r.created_at === "string" ? r.created_at : null,
  }));
}

/**
 * Operator-only: approve or reject a pending venue claim. Writes an
 * audit row (venue.verification.review) and flips the status to
 * 'verified' (method 'manual_review') or 'rejected'.
 */
export async function reviewVerification(
  venueId: string,
  approve: boolean,
  note: string | null,
): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("review_venue_verification", {
    p_venue_id: venueId,
    p_approve: approve,
    p_note: note,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const status = row && typeof row.status === "string" ? row.status : approve ? "verified" : "rejected";
  return status;
}
