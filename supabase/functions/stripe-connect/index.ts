// stripe-connect — Venue Stripe Connect Express onboarding (STRIPE-PLAN §1b).
//
// POST { action: 'onboard' | 'link' | 'status', tenant_id?, venue_id?,
//        refresh_url?, return_url? }
//
// Auth: any signed-in user, but the caller must be a forge_operator OR a
// member of the tenant (tenant_users) — the same JWT verification the other
// functions use (_shared/helpers.ts authenticate). A venue NEVER gets an
// account for a tenant it doesn't belong to. The venue must also pass the
// existing verification gate before onboarding starts (bownd-sync rule:
// selling access follows verification + onboarding, never replaces them).
//
// Stripe collects KYC + payout bank details on its hosted pages — Bownd
// never sees or stores bank details. The connected account id is persisted
// on the venue's metadata (venues.metadata.stripe_account_id) — the venue-
// level source the payments rows' stripe_connected_account_id derives from
// — and account.updated webhooks mirror the live status back onto it.
//
// SECRET: STRIPE_SECRET_KEY (test mode sk_test_... for v1) from function
// secrets. Missing → 500 naming it, nothing done.

import {
  authenticate,
  handleRequest,
  HttpError,
  jsonResponse,
  parseJsonBody,
  type SupabaseClient,
} from "../_shared/helpers.ts";
import { FetchStripeApi, type StripeObject } from "../_shared/stripe-api.ts";

const DEFAULT_RETURN_URL = "https://getbownd.com/livework";
const DEFAULT_REFRESH_URL = "https://getbownd.com/livework";

interface VenueRow {
  id: string;
  tenant_id: string | null;
  verification_status: string | null;
  metadata: Record<string, unknown> | null;
}

async function resolveTenantId(
  service: SupabaseClient,
  userId: string,
  isOperator: boolean,
  requested: string | null,
): Promise<string> {
  const { data, error } = await service
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId);
  if (error) throw new Error(`tenant membership lookup failed: ${error.message}`);
  const memberships = ((data ?? []) as Array<{ tenant_id?: string }>)
    .map((r) => r.tenant_id)
    .filter((v): v is string => typeof v === "string");
  if (requested) {
    if (isOperator || memberships.includes(requested)) return requested;
    throw new HttpError(403, "caller is not a member of the requested tenant");
  }
  if (memberships.length === 1) return memberships[0];
  if (isOperator && memberships.length === 0) {
    throw new HttpError(400, "tenant_id is required (operator has no tenant membership)");
  }
  throw new HttpError(400, "tenant_id is required (caller belongs to zero or several tenants)");
}

async function loadVenue(
  service: SupabaseClient,
  venueId: string,
  tenantId: string,
): Promise<VenueRow> {
  const { data, error } = await service
    .from("venues")
    .select("id, tenant_id, verification_status, metadata")
    .eq("id", venueId)
    .maybeSingle();
  if (error) throw new Error(`venue lookup failed: ${error.message}`);
  if (!data) throw new HttpError(404, "venue not found");
  const venue = data as VenueRow;
  if (venue.tenant_id !== tenantId) {
    throw new HttpError(403, "venue does not belong to the caller's tenant");
  }
  return venue;
}

async function saveVenueMetadata(
  service: SupabaseClient,
  venue: VenueRow,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await service
    .from("venues")
    .update({ metadata: { ...(venue.metadata ?? {}), ...patch } })
    .eq("id", venue.id);
  if (error) throw new Error(`venue metadata update failed: ${error.message}`);
}

function accountStatus(account: StripeObject): Record<string, unknown> {
  const requirements = (account.requirements as Record<string, unknown> | undefined) ?? {};
  return {
    account_id: account.id,
    charges_enabled: account.charges_enabled === true,
    payouts_enabled: account.payouts_enabled === true,
    details_submitted: account.details_submitted === true,
    requirements_due: Array.isArray(requirements.currently_due)
      ? requirements.currently_due
      : [],
  };
}

Deno.serve((req: Request) =>
  handleRequest(req, async () => {
    const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!secretKey) throw new HttpError(500, "Missing secret STRIPE_SECRET_KEY");
    const stripe = new FetchStripeApi(secretKey);
    const { user, service } = await authenticate(req);
    const body = await parseJsonBody(req);

    const action = typeof body.action === "string" ? body.action : "onboard";
    if (action !== "onboard" && action !== "link" && action !== "status") {
      throw new HttpError(400, "action must be 'onboard', 'link', or 'status'");
    }
    const venueId = typeof body.venue_id === "string" ? body.venue_id : null;
    if (!venueId) throw new HttpError(400, "venue_id is required");
    const tenantId = await resolveTenantId(
      service,
      user.id,
      user.isOperator,
      typeof body.tenant_id === "string" ? body.tenant_id : null,
    );
    const venue = await loadVenue(service, venueId, tenantId);
    const metadata = venue.metadata ?? {};
    let accountId = typeof metadata.stripe_account_id === "string"
      ? metadata.stripe_account_id
      : null;

    if (action === "status") {
      if (!accountId) {
        return jsonResponse({ onboarded: false, account_id: null, venue_id: venueId });
      }
      const account = await stripe.retrieveAccount(accountId);
      if (!account) throw new HttpError(404, "connected account not found in Stripe");
      const status = accountStatus(account);
      await saveVenueMetadata(service, venue, {
        stripe_charges_enabled: status.charges_enabled,
        stripe_payouts_enabled: status.payouts_enabled,
        stripe_details_submitted: status.details_submitted,
        stripe_requirements_due: status.requirements_due,
      });
      return jsonResponse({ onboarded: true, venue_id: venueId, ...status });
    }

    // onboard / link both end in a fresh hosted onboarding link.
    // The verification gate is server-side and comes first (bownd-sync):
    // selling/ticketing access requires a verified venue + enabled account.
    // Operators bypass it for test venues during setup; venue users don't.
    if (!user.isOperator && venue.verification_status !== "verified") {
      throw new HttpError(
        403,
        "venue is not verified yet; Connect onboarding opens after verification",
      );
    }
    if (!accountId) {
      const account = await stripe.createAccount({
        type: "express",
        country: "US",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { tenant_id: tenantId, venue_id: venueId },
      });
      accountId = account.id;
      await saveVenueMetadata(service, venue, { stripe_account_id: accountId });
    }
    const link = await stripe.createAccountLink({
      account: accountId,
      refresh_url: typeof body.refresh_url === "string" ? body.refresh_url : DEFAULT_REFRESH_URL,
      return_url: typeof body.return_url === "string" ? body.return_url : DEFAULT_RETURN_URL,
      type: "account_onboarding",
    });
    return jsonResponse({
      account_id: accountId,
      venue_id: venueId,
      onboarding_url: typeof link.url === "string" ? link.url : null,
      expires_at: typeof link.expires_at === "number" ? link.expires_at : null,
    });
  })
);
