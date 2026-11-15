// _shared/stripe-core.ts — Pure Stripe pay-side primitives.
//
// No imports, no I/O, no Deno/Supabase references: everything here runs
// identically in the Edge Function runtime and in the local test harness
// (tools/stripe-harness). Money is integer cents end to end
// (pay-logic-spec §2/§8.1). Amounts are never invented — every figure a
// caller computes comes from a Stripe event payload or the stored product
// catalog below (decided prices only: MONETIZATION.md / product-funnel-map).
//
// Secrets rule: the webhook signing secret is passed IN by the caller from
// function secrets (STRIPE_WEBHOOK_SECRET). It is never read from env here,
// never logged, never committed.

// ------------------------------------------------------------- Signatures --

export interface ParsedSignatureHeader {
  timestamp: number;
  signatures: string[];
}

/** Parse a `Stripe-Signature` header: t=<sec>,v1=<hex>[,v1=<hex>...]. */
export function parseSignatureHeader(header: string): ParsedSignatureHeader | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === "v1" && value) {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** HMAC-SHA256 hex of `${timestamp}.${rawBody}` under the signing secret. */
export async function computeSignatureHex(
  secret: string,
  timestamp: number,
  rawBody: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  return bytesToHex(new Uint8Array(mac));
}

/** Constant-time string comparison (lengths are not secret here). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type SignatureCheck =
  | { ok: true; timestamp: number }
  | { ok: false; reason: string };

/**
 * Verify a Stripe webhook signature exactly as Stripe specifies: HMAC-SHA256
 * over `<timestamp>.<raw body>` with the endpoint signing secret, compared
 * against every v1 candidate, with a replay tolerance (default 300s).
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSec = 300,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<SignatureCheck> {
  if (!signatureHeader) return { ok: false, reason: "missing_signature_header" };
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { ok: false, reason: "malformed_signature_header" };
  if (Math.abs(nowSec - parsed.timestamp) > toleranceSec) {
    return { ok: false, reason: "timestamp_outside_tolerance" };
  }
  const expected = await computeSignatureHex(secret, parsed.timestamp, rawBody);
  for (const candidate of parsed.signatures) {
    if (constantTimeEqual(candidate, expected)) {
      return { ok: true, timestamp: parsed.timestamp };
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}

// ----------------------------------------------------------------- Money ---

/**
 * round_half_up(amountCents * numerator / denominator) with integer math
 * only (pay-logic §8.1: round half-up, once, at the final step).
 */
export function roundHalfUpRatio(
  amountCents: number,
  numerator: number,
  denominator: number,
): number {
  const product = amountCents * numerator;
  // floor((2*product + denominator) / (2*denominator)) == round-half-up(product/denominator)
  return Math.floor((2 * product + denominator) / (2 * denominator));
}

/** Bownd ticket fee per ticket: 2.5% (rounded half-up) + $0.99 (pay-logic §4.1). */
export function ticketFeeCents(faceCents: number): number {
  return roundHalfUpRatio(faceCents, 250, 10000) + 99;
}

/**
 * The venue's settlement debit for a refund: the original venue_net share of
 * the refunded portion of the captured total (pay-logic §5 — exact reversal
 * of the original split, proportional for partial refunds).
 */
export function settlementAdjustmentForRefund(
  venueNetCents: number | null,
  refundAmountCents: number,
  capturedTotalCents: number,
): number {
  if (venueNetCents === null || capturedTotalCents <= 0) return 0;
  return roundHalfUpRatio(venueNetCents * refundAmountCents, 1, capturedTotalCents);
}

// -------------------------------------------------------------- Products ---

export type ProductKind = "subscription_tier" | "placement" | "package";
export type ChargeMode = "payment" | "subscription";

export interface ProductInclusion {
  product_key: string;
  duration_days: number | null;
}

export interface ProductDef {
  product_key: string;
  /** Stripe Product display name (Master Offer Template wording). */
  name: string;
  kind: ProductKind;
  /** money_funnels.key of the ONE funnel that owns the revenue. */
  funnel_key: string;
  amount_cents: number;
  mode: ChargeMode;
  /** For mode='subscription': the billing interval. */
  interval: "month" | null;
  /** Access duration granted per verified payment period; null = no fixed expiry. */
  duration_days: number | null;
  features: string[];
  inclusions: ProductInclusion[];
}

/**
 * The v1 sellable catalog — decided prices only (product-funnel-map.md).
 * The three NYE campaign products are F1 (campaign sales); venue tiers are
 * F2. Anything not in this catalog can still be ACTIVATED from explicit
 * checkout metadata (the order flow stamps product + duration server-side),
 * but Payment Links are only minted for catalog products.
 */
export const PRODUCT_CATALOG: Record<string, ProductDef> = {
  // NYE campaign — Spotlight month sold under "Bownd presents KC NYE" (F1).
  placement_spotlight_event_campaign: {
    product_key: "placement_spotlight_event_campaign",
    name: "Spotlight — Event/Campaign (NYE)",
    kind: "placement",
    funnel_key: "f1",
    amount_cents: 29900,
    mode: "subscription",
    interval: "month",
    duration_days: 30,
    features: ["placement_spotlight"],
    inclusions: [],
  },
  // NYE campaign — Event Launch package, $249/event (F1). Inclusions per
  // product-funnel-map: listing support + 1 week Spotlight + 3 promo posts
  // (posts are fulfillment deliverables, not entitlements).
  pkg_event_launch: {
    product_key: "pkg_event_launch",
    name: "Event Launch Package",
    kind: "package",
    funnel_key: "f1",
    amount_cents: 24900,
    mode: "payment",
    interval: null,
    duration_days: null,
    features: ["pkg_event_launch"],
    inclusions: [{ product_key: "placement_spotlight_event", duration_days: 7 }],
  },
  // NYE campaign — Major Event Partner, $599/campaign (F1). Inclusions:
  // campaign placement + 2 weeks Spotlight + specialized list placement.
  pkg_major_event_partner: {
    product_key: "pkg_major_event_partner",
    name: "Major Event Partner",
    kind: "package",
    funnel_key: "f1",
    amount_cents: 59900,
    mode: "payment",
    interval: null,
    duration_days: null,
    features: ["pkg_major_event_partner", "placement_campaign"],
    inclusions: [
      { product_key: "placement_spotlight_event", duration_days: 14 },
      { product_key: "placement_specialized_list", duration_days: 14 },
    ],
  },
  // Venue subscription tiers (F2) — for Connect-era venue billing.
  venue_featured: {
    product_key: "venue_featured",
    name: "Featured Venue",
    kind: "subscription_tier",
    funnel_key: "f2",
    amount_cents: 2500,
    mode: "subscription",
    interval: "month",
    duration_days: 30,
    features: ["venue_featured"],
    inclusions: [],
  },
  venue_pro: {
    product_key: "venue_pro",
    name: "Venue Pro",
    kind: "subscription_tier",
    funnel_key: "f2",
    amount_cents: 9900,
    mode: "subscription",
    interval: "month",
    duration_days: 30,
    features: ["venue_featured", "venue_pro"],
    inclusions: [],
  },
};

export function catalogProduct(productKey: string | null | undefined): ProductDef | null {
  if (!productKey) return null;
  return PRODUCT_CATALOG[productKey] ?? null;
}

// ------------------------------------------------------- Entitlement math --

export interface EntitlementSpec {
  product_key: string;
  kind: "subscription_tier" | "placement" | "package" | "package_inclusion";
  features: string[];
  duration_days: number | null;
}

/** Main entitlement + package_inclusion rows for a verified purchase. */
export function entitlementSpecsForProduct(product: ProductDef): EntitlementSpec[] {
  const specs: EntitlementSpec[] = [
    {
      product_key: product.product_key,
      kind: product.kind,
      features: product.features,
      duration_days: product.duration_days,
    },
  ];
  for (const inclusion of product.inclusions) {
    specs.push({
      product_key: inclusion.product_key,
      kind: "package_inclusion",
      features: [],
      duration_days: inclusion.duration_days,
    });
  }
  return specs;
}

/** Add whole days to an ISO timestamp; null duration → null (no fixed expiry). */
export function expiresFrom(effectiveIso: string, durationDays: number | null): string | null {
  if (durationDays === null) return null;
  const ms = new Date(effectiveIso).getTime() + durationDays * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

// ------------------------------------------------------------ Refunds ------

/** Failed-payment grace length — DECIDED 2026-10-22 (Mark): 7 days. */
export const FAILED_PAYMENT_GRACE_DAYS = 7;

export function graceEndsAt(failedAtIso: string): string {
  return expiresFrom(failedAtIso, FAILED_PAYMENT_GRACE_DAYS) as string;
}

export type RefundEntitlementAction = "revoke" | "hook_only" | "none";

/**
 * What a verified refund does to access (access-provisioning-spec §5):
 *  - placement / package money back → the access it bought is revoked.
 *  - subscription money back → the entitlement mirrors the refund (revoke;
 *    the caller applies full-vs-partial nuance via `fullRefund`).
 *  - tickets → no entitlement change here; the caller emits the ticket/QR
 *    invalidation hook exactly once (execution owned by redemption system).
 */
export function refundEntitlementAction(
  paymentKind: string,
  fullRefund: boolean,
): RefundEntitlementAction {
  switch (paymentKind) {
    case "placement":
    case "package":
      return "revoke";
    case "subscription":
      return fullRefund ? "revoke" : "none";
    case "ticket":
      return "hook_only";
    default:
      return "none";
  }
}

/** Stripe refund.status → refunds.status enum. */
export function mapRefundStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "succeeded":
      return "succeeded";
    case "pending":
    case "requires_action":
      return "pending";
    case "failed":
      return "failed";
    case "canceled":
      return "cancelled";
    default:
      return "processing";
  }
}

/** Stripe refund.reason is not our vocabulary; default to 'other' unless the
 *  payment's own stored metadata names one of our decided reasons. */
const OUR_REFUND_REASONS = new Set([
  "organizer_cancelled",
  "postponed_window",
  "refund_template",
  "dispute",
  "legal_exception",
  "authorized_exception",
  "other",
]);

export function mapRefundReason(paymentMetadataReason: unknown): string {
  return typeof paymentMetadataReason === "string" && OUR_REFUND_REASONS.has(paymentMetadataReason)
    ? paymentMetadataReason
    : "other";
}
