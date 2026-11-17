// _shared/stripe-processing.ts — Webhook routing + AccessPrime activation.
//
// Authority order: STRIPE-PLAN §1d (receiver), access-provisioning-spec
// (entitlements), pay-logic-spec (amounts), refund-templates (refund rules).
// One deliberate deviation from the access spec's job-queue sketch, recorded
// in the build report: activation runs inline in the receiver through THIS
// module (the AccessPrime logic lives here, one writer, one idempotency
// rule) because no queue-runner can be invoked from a webhook in the current
// stack. Every handler is idempotent, so the worker loop's reconciliation
// pass can re-run any event safely and converge to the same state.
//
// Rules baked in:
//  - payment_intent.succeeded is THE activation trigger (access spec §2).
//    checkout.session.completed records the order as pending and activates
//    NOTHING.
//  - Activation exactly once: entitlement idempotency key =
//    source_event_id + product_key + account_id, where source_event_id is
//    the event stored on the payments row at verification — the first
//    verifier wins the slot (payments.source_event_id is UNIQUE), so the
//    session event and the PI event can never double-grant.
//  - Amounts come only from the event payload + stored catalog. Integer
//    cents. A non-USD object halts its own processing with a recorded
//    failure (pay-logic §8.3) — never a conversion guess.
//  - Tenants are never guessed: a venue entitlement without a resolvable
//    tenant_id is blocked and recorded (bownd-sync tenant rule).
//  - Test-mode build: livemode events are recorded and ignored.

import {
  catalogProduct,
  entitlementSpecsForProduct,
  expiresFrom,
  graceEndsAt,
  mapRefundReason,
  mapRefundStatus,
  refundEntitlementAction,
  settlementAdjustmentForRefund,
  type EntitlementSpec,
  verifyStripeSignature,
} from "./stripe-core.ts";
import type { StripeApi } from "./stripe-api.ts";
import type { PaymentsDb, PaymentRow, RefundRow } from "./stripe-db.ts";

// ------------------------------------------------------------ utilities ----

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function obj(v: unknown): Json {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
}

function unixToIso(sec: unknown): string | null {
  const n = num(sec);
  return n === null ? null : new Date(n * 1000).toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --------------------------------------------------------------- binding ---

export interface PurchaseBinding {
  account_id: string | null;
  account_scope: "customer" | "venue";
  tenant_id: string | null;
  venue_id: string | null;
  product_keys: string[];
  funnel_key: string | null;
  kind: string | null;
  term_days: number | null;
  bownd_fee_cents: number;
  connect_account_id: string | null;
  customer_id: string | null;
}

/** Our checkout surfaces stamp the purchase binding into Stripe metadata
 *  server-side at order creation (Payment Links do it via
 *  payment_intent_data / subscription_data metadata). All values are
 *  strings in Stripe metadata. */
export function bindingFromMetadata(
  md: Record<string, string> | undefined | null,
): PurchaseBinding {
  const m = md ?? {};
  let productKeys: string[] = [];
  if (m.products) {
    try {
      const parsed = JSON.parse(m.products) as unknown;
      if (Array.isArray(parsed)) {
        productKeys = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      productKeys = m.products.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  if (productKeys.length === 0 && m.product_key) productKeys = [m.product_key];
  const termDays = m.term_days ? Number(m.term_days) : NaN;
  const fee = m.bownd_fee_cents ? Number(m.bownd_fee_cents) : NaN;
  return {
    account_id: m.account_id ?? null,
    account_scope: m.account_scope === "customer" ? "customer" : "venue",
    tenant_id: m.tenant_id ?? null,
    venue_id: m.venue_id ?? null,
    product_keys: productKeys,
    funnel_key: m.funnel ?? m.funnel_key ?? null,
    kind: m.kind ?? null,
    term_days: Number.isFinite(termDays) ? termDays : null,
    bownd_fee_cents: Number.isFinite(fee) ? fee : 0,
    connect_account_id: m.connect_account_id ?? null,
    customer_id: m.customer_id ?? null,
  };
}

function invoiceSubscriptionId(inv: Json): string | null {
  const direct = str(inv.subscription);
  if (direct) return direct;
  const parent = obj(inv.parent);
  const details = obj(parent.subscription_details);
  return str(details.subscription);
}

/** Compact per-line snapshot for the invoices record (self-proving inputs). */
function invoiceLineSummaries(inv: Json): unknown[] {
  const lines = obj(inv.lines);
  const data = Array.isArray(lines.data) ? (lines.data as Json[]) : [];
  return data.map((line) => {
    const period = obj(line.period);
    return {
      description: str(line.description),
      amount_cents: num(line.amount),
      quantity: num(line.quantity),
      period_start: unixToIso(period.start),
      period_end: unixToIso(period.end),
    };
  });
}

function invoicePeriod(inv: Json): { start: string | null; end: string | null } {
  const lines = obj(inv.lines);
  const data = Array.isArray(lines.data) ? (lines.data as Json[]) : [];
  const period = data.length > 0 ? obj(data[0].period) : {};
  return {
    start: unixToIso(period.start) ?? unixToIso(inv.period_start),
    end: unixToIso(period.end) ?? unixToIso(inv.period_end),
  };
}

/** Binding for a PaymentIntent: its own metadata first; for subscription
 *  invoices the binding lives on the Subscription (subscription_data), so
 *  walk PI → invoice → subscription before giving up. */
async function resolveBindingForPI(
  stripe: StripeApi,
  pi: Json,
): Promise<PurchaseBinding> {
  // Destination charges (§1b): the connected account rides on the PI
  // itself (transfer_data.destination / on_behalf_of), not in metadata.
  const destination = str(obj(pi.transfer_data).destination) ??
    str(pi.on_behalf_of);
  const withDestination = (b: PurchaseBinding): PurchaseBinding =>
    b.connect_account_id || !destination
      ? b
      : { ...b, connect_account_id: destination };
  const own = withDestination(
    bindingFromMetadata(pi.metadata as Record<string, string> | undefined),
  );
  if (own.account_id) return own;
  const invoiceId = str(pi.invoice);
  if (invoiceId) {
    const inv = await stripe.retrieveInvoice(invoiceId);
    if (inv) {
      const fromInvoice = withDestination(
        bindingFromMetadata(inv.metadata as Record<string, string> | undefined),
      );
      if (fromInvoice.account_id) return fromInvoice;
      const subId = invoiceSubscriptionId(inv as Json);
      if (subId) {
        const sub = await stripe.retrieveSubscription(subId);
        if (sub) {
          return withDestination(
            bindingFromMetadata(sub.metadata as Record<string, string> | undefined),
          );
        }
      }
    }
  }
  return own;
}

// ------------------------------------------------------- AccessPrime core --

interface ActivationOutcome {
  granted: string[];
  notes: string[];
}

/**
 * Grant the entitlements a verified payment bought — exactly once per
 * (source_event_id, product_key, account_id). Re-running with the same
 * inputs is a no-op that reports what already exists (reconciliation-safe).
 */
async function activateEntitlements(
  db: PaymentsDb,
  payment: PaymentRow,
  binding: PurchaseBinding,
  sourceEventId: string,
): Promise<ActivationOutcome> {
  const granted: string[] = [];
  const notes: string[] = [];
  if (!binding.account_id) {
    return { granted, notes: ["activation_skipped_no_account_binding"] };
  }
  if (binding.product_keys.length === 0) {
    return { granted, notes: ["activation_skipped_no_product_binding"] };
  }

  let tenantId = binding.tenant_id;
  if (!tenantId && binding.account_scope === "venue" && binding.venue_id) {
    tenantId = await db.findTenantIdForVenue(binding.venue_id);
  }
  if (binding.account_scope === "venue" && !tenantId) {
    // entitlements.tenant_id is required for venue rows; never guess it.
    return { granted, notes: ["activation_blocked_no_tenant_mapping"] };
  }

  const effectiveAt = payment.verified_at ?? nowIso();
  for (const productKey of binding.product_keys) {
    const product = catalogProduct(productKey);
    const specs: EntitlementSpec[] = product
      ? entitlementSpecsForProduct(product)
      : [{
        product_key: productKey,
        kind: binding.kind === "placement" || binding.kind === "subscription_tier"
          ? binding.kind
          : "package",
        features: [],
        duration_days: binding.term_days,
      }];
    for (const spec of specs) {
      const key = `${sourceEventId}:${spec.product_key}:${binding.account_id}`;
      const existing = await db.findEntitlementByIdempotencyKey(key);
      if (existing) {
        notes.push(`already_active:${spec.product_key}`);
        continue;
      }
      const inserted = await db.insertEntitlement({
        account_scope: binding.account_scope,
        account_id: binding.account_id,
        tenant_id: binding.account_scope === "venue" ? tenantId : null,
        kind: spec.kind,
        product_key: spec.product_key,
        plan_detail: {
          duration_days: spec.duration_days,
          stripe_customer_id: binding.customer_id ?? payment.stripe_customer_id,
          stripe_subscription_id: payment.stripe_subscription_id,
          source: "stripe_webhook",
        },
        features: spec.features,
        status: "active",
        effective_at: effectiveAt,
        expires_at: expiresFrom(effectiveAt, spec.duration_days),
        source: "verified_webhook",
        source_event_id: sourceEventId,
        payment_id: payment.id,
        idempotency_key: key,
        metadata: { funnel_key: product?.funnel_key ?? binding.funnel_key },
      });
      if (inserted === "inserted") granted.push(spec.product_key);
      else notes.push(`already_active:${spec.product_key}`);
    }
  }
  return { granted, notes };
}

// ------------------------------------------------------------- handlers ----

interface RouteOutcome {
  action: string;
  ignored?: boolean;
}

async function onPaymentIntentSucceeded(
  db: PaymentsDb,
  stripe: StripeApi,
  event: Json,
): Promise<RouteOutcome> {
  const pi = obj(obj(event.data).object);
  const piId = str(pi.id);
  if (!piId) throw new Error("payment_intent.succeeded without an intent id");
  if (pi.currency !== undefined && pi.currency !== "usd") {
    throw new Error(`non-USD payment intent halted (${String(pi.currency)})`);
  }
  const binding = await resolveBindingForPI(stripe, pi);
  const received = num(pi.amount_received) ?? num(pi.amount) ?? 0;
  const latestCharge = pi.latest_charge;
  const chargeId = typeof latestCharge === "string"
    ? latestCharge
    : str(obj(latestCharge).id);

  let payment = await db.findPaymentByIntentId(piId);
  if (!payment && pi.invoice) {
    payment = await db.findPaymentByInvoiceId(String(pi.invoice));
  }

  const funnelKey = binding.funnel_key ??
    (binding.product_keys[0] ? catalogProduct(binding.product_keys[0])?.funnel_key : null) ??
    null;
  const funnelId = funnelKey ? await db.findFunnelIdByKey(funnelKey) : null;

  if (!payment) {
    payment = await db.insertPayment({
      stripe_payment_intent_id: piId,
      stripe_checkout_session_id: null,
      stripe_charge_id: chargeId,
      stripe_customer_id: str(pi.customer) ?? binding.customer_id,
      stripe_connected_account_id: binding.connect_account_id,
      stripe_subscription_id: null,
      stripe_invoice_id: str(pi.invoice),
      payer_scope: binding.account_scope,
      payer_account_id: binding.account_id,
      payer_tenant_id: binding.tenant_id,
      seller_tenant_id: null,
      seller_venue_id: binding.venue_id,
      kind: binding.kind ?? catalogProduct(binding.product_keys[0])?.kind ?? "other",
      product_key: binding.product_keys[0] ?? null,
      order_id: null,
      funnel_id: funnelId,
      amount_gross_cents: received,
      bownd_fee_cents: binding.bownd_fee_cents,
      stripe_fee_cents: null,
      venue_net_cents: null,
      refunded_total_cents: 0,
      currency: "USD",
      status: "verified",
      fee_included_in_package: false,
      fee_included_in_product_key: null,
      attributed_venue_id: null,
      attribution_source: null,
      source_event_id: str(event.id),
      idempotency_key: `pi:${piId}`,
      verified_at: nowIso(),
      settled_at: null,
      metadata: { binding: { ...binding }, livemode: pi.livemode === true },
    });
  } else {
    const verifiedAt = payment.verified_at ?? nowIso();
    const patch: Partial<PaymentRow> = {
      status: payment.status === "fulfilled" ? "fulfilled" : "verified",
      verified_at: verifiedAt,
      source_event_id: payment.source_event_id ?? str(event.id),
      stripe_charge_id: payment.stripe_charge_id ?? chargeId,
      stripe_customer_id: payment.stripe_customer_id ?? str(pi.customer),
      stripe_invoice_id: payment.stripe_invoice_id ?? str(pi.invoice),
      amount_gross_cents: payment.amount_gross_cents > 0
        ? payment.amount_gross_cents
        : received,
      bownd_fee_cents: payment.bownd_fee_cents > 0
        ? payment.bownd_fee_cents
        : binding.bownd_fee_cents,
      payer_account_id: payment.payer_account_id ?? binding.account_id,
      payer_tenant_id: payment.payer_tenant_id ?? binding.tenant_id,
      seller_venue_id: payment.seller_venue_id ?? binding.venue_id,
      stripe_connected_account_id:
        payment.stripe_connected_account_id ?? binding.connect_account_id,
      funnel_id: payment.funnel_id ?? funnelId,
      product_key: payment.product_key ?? binding.product_keys[0] ?? null,
    };
    await db.updatePayment(payment.id, patch);
    payment = { ...payment, ...patch };
  }

  const sourceEventId = payment.source_event_id ?? str(event.id) ?? "";
  const activation = await activateEntitlements(db, payment, binding, sourceEventId);
  const parts = [
    `verified payment=${payment.id}`,
    activation.granted.length ? `granted=${activation.granted.join(",")}` : "granted=none",
    ...activation.notes,
  ];
  return { action: parts.join(" ") };
}

async function onCheckoutSessionCompleted(
  db: PaymentsDb,
  event: Json,
): Promise<RouteOutcome> {
  const session = obj(obj(event.data).object);
  const sessionId = str(session.id);
  if (!sessionId) throw new Error("checkout.session.completed without a session id");
  const binding = bindingFromMetadata(
    session.metadata as Record<string, string> | undefined,
  );
  const piId = str(session.payment_intent);
  const subscriptionId = str(session.subscription);

  let payment = await db.findPaymentBySessionId(sessionId);
  if (!payment && piId) payment = await db.findPaymentByIntentId(piId);

  if (payment) {
    await db.updatePayment(payment.id, {
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: payment.stripe_payment_intent_id ?? piId,
      stripe_subscription_id: payment.stripe_subscription_id ?? subscriptionId,
      stripe_customer_id: payment.stripe_customer_id ?? str(session.customer),
      status: payment.status === "created" ? "pending" : payment.status,
    });
    // Cross-check only (access spec §2): NOT an activation trigger.
    return { action: `session_recorded payment=${payment.id} activation=waiting_for_payment_intent` };
  }

  const product = catalogProduct(binding.product_keys[0]);
  const inserted = await db.insertPayment({
    stripe_payment_intent_id: piId,
    stripe_checkout_session_id: sessionId,
    stripe_charge_id: null,
    stripe_customer_id: str(session.customer) ?? binding.customer_id,
    stripe_connected_account_id: binding.connect_account_id,
    stripe_subscription_id: subscriptionId,
    stripe_invoice_id: null,
    payer_scope: binding.account_scope,
    payer_account_id: binding.account_id,
    payer_tenant_id: binding.tenant_id,
    seller_tenant_id: null,
    seller_venue_id: binding.venue_id,
    kind: binding.kind ?? product?.kind ?? "other",
    product_key: binding.product_keys[0] ?? null,
    order_id: null,
    funnel_id: binding.funnel_key
      ? await db.findFunnelIdByKey(binding.funnel_key)
      : product
      ? await db.findFunnelIdByKey(product.funnel_key)
      : null,
    amount_gross_cents: 0,
    bownd_fee_cents: binding.bownd_fee_cents,
    stripe_fee_cents: null,
    venue_net_cents: null,
    refunded_total_cents: 0,
    currency: "USD",
    status: "pending",
    fee_included_in_package: false,
    fee_included_in_product_key: null,
    attributed_venue_id: null,
    attribution_source: null,
    source_event_id: null,
    idempotency_key: `session:${sessionId}`,
    verified_at: null,
    settled_at: null,
    metadata: {
      binding: { ...binding },
      session_amount_total: num(session.amount_total),
      session_mode: str(session.mode),
    },
  });
  return { action: `session_recorded payment=${inserted.id} activation=waiting_for_payment_intent` };
}

async function onPaymentIntentFailed(
  db: PaymentsDb,
  event: Json,
): Promise<RouteOutcome> {
  const pi = obj(obj(event.data).object);
  const piId = str(pi.id);
  if (!piId) throw new Error("payment_intent.payment_failed without an intent id");
  const existing = await db.findPaymentByIntentId(piId);
  if (existing) {
    if (existing.status === "verified" || existing.status === "fulfilled") {
      return { action: `payment_failed_ignored_already_verified payment=${existing.id}` };
    }
    await db.updatePayment(existing.id, { status: "failed" });
    return { action: `payment_failed payment=${existing.id} activated=none` };
  }
  const binding = bindingFromMetadata(pi.metadata as Record<string, string> | undefined);
  await db.insertPayment({
    stripe_payment_intent_id: piId,
    stripe_checkout_session_id: null,
    stripe_charge_id: null,
    stripe_customer_id: str(pi.customer),
    stripe_connected_account_id: binding.connect_account_id,
    stripe_subscription_id: null,
    stripe_invoice_id: str(pi.invoice),
    payer_scope: binding.account_scope,
    payer_account_id: binding.account_id,
    payer_tenant_id: binding.tenant_id,
    seller_tenant_id: null,
    seller_venue_id: binding.venue_id,
    kind: binding.kind ?? "other",
    product_key: binding.product_keys[0] ?? null,
    order_id: null,
    funnel_id: binding.funnel_key
      ? await db.findFunnelIdByKey(binding.funnel_key)
      : null,
    amount_gross_cents: num(pi.amount) ?? 0,
    bownd_fee_cents: binding.bownd_fee_cents,
    stripe_fee_cents: null,
    venue_net_cents: null,
    refunded_total_cents: 0,
    currency: "USD",
    status: "failed",
    fee_included_in_package: false,
    fee_included_in_product_key: null,
    attributed_venue_id: null,
    attribution_source: null,
    source_event_id: null,
    idempotency_key: `pi:${piId}`,
    verified_at: null,
    settled_at: null,
    metadata: { binding: { ...binding }, failure: obj(pi.last_payment_error).code ?? null },
  });
  return { action: "payment_failed recorded activated=none" };
}

async function onInvoicePaid(
  db: PaymentsDb,
  stripe: StripeApi,
  event: Json,
): Promise<RouteOutcome> {
  const inv = obj(obj(event.data).object);
  const invoiceId = str(inv.id);
  if (!invoiceId) throw new Error("invoice.paid without an invoice id");
  if (inv.currency !== undefined && inv.currency !== "usd") {
    throw new Error(`non-USD invoice halted (${String(inv.currency)})`);
  }
  const subId = invoiceSubscriptionId(inv);
  let binding = bindingFromMetadata(inv.metadata as Record<string, string> | undefined);
  if (!binding.account_id && subId) {
    const sub = await stripe.retrieveSubscription(subId);
    if (sub) {
      binding = bindingFromMetadata(sub.metadata as Record<string, string> | undefined);
    }
  }
  const amountPaid = num(inv.amount_paid) ?? 0;
  const period = invoicePeriod(inv);
  const productKey = binding.product_keys[0] ?? null;
  const product = catalogProduct(productKey);

  let payment = await db.findPaymentByInvoiceId(invoiceId);
  if (!payment) {
    const funnelKey = binding.funnel_key ?? product?.funnel_key ?? null;
    payment = await db.insertPayment({
      stripe_payment_intent_id: str(inv.payment_intent),
      stripe_checkout_session_id: null,
      stripe_charge_id: str(inv.charge),
      stripe_customer_id: str(inv.customer) ?? binding.customer_id,
      stripe_connected_account_id: binding.connect_account_id,
      stripe_subscription_id: subId,
      stripe_invoice_id: invoiceId,
      payer_scope: binding.account_scope,
      payer_account_id: binding.account_id,
      payer_tenant_id: binding.tenant_id,
      seller_tenant_id: null,
      seller_venue_id: binding.venue_id,
      kind: "subscription",
      product_key: productKey,
      order_id: null,
      funnel_id: funnelKey ? await db.findFunnelIdByKey(funnelKey) : null,
      amount_gross_cents: amountPaid,
      bownd_fee_cents: 0,
      stripe_fee_cents: null,
      venue_net_cents: null,
      refunded_total_cents: 0,
      currency: "USD",
      status: "verified",
      fee_included_in_package: false,
      fee_included_in_product_key: null,
      attributed_venue_id: null,
      attribution_source: null,
      source_event_id: str(event.id),
      idempotency_key: `invoice:${invoiceId}`,
      verified_at: nowIso(),
      settled_at: null,
      metadata: { binding: { ...binding } },
    });
  } else if (payment.status !== "verified" && payment.status !== "fulfilled") {
    await db.updatePayment(payment.id, {
      status: "verified",
      verified_at: payment.verified_at ?? nowIso(),
      source_event_id: payment.source_event_id ?? str(event.id),
      stripe_subscription_id: payment.stripe_subscription_id ?? subId,
    });
    payment = { ...payment, status: "verified" };
  }

  // Mirror the Stripe invoice into `invoices` (self-proving record).
  const periodKey = period.start ?? str(event.id) ?? invoiceId;
  const invoiceInsert = await db.insertInvoice({
    account_scope: "venue",
    account_id: binding.account_id ?? "",
    tenant_id: binding.tenant_id,
    kind: "subscription",
    product_key: productKey ?? "unknown",
    status: "paid",
    period_start: period.start,
    period_end: period.end,
    currency: "USD",
    lines: invoiceLineSummaries(inv),
    inputs_snapshot: {
      source: "stripe_invoice",
      stripe_invoice_id: invoiceId,
      amount_paid_cents: amountPaid,
      config_note: "Stripe Billing generated; amount taken from the verified invoice payload",
    },
    subtotal_cents: num(inv.subtotal) ?? amountPaid,
    tax_cents: 0,
    total_cents: amountPaid,
    stripe_invoice_id: invoiceId,
    stripe_charge_id: str(inv.charge),
    stripe_subscription_id: subId,
    payment_id: payment.id,
    idempotency_key: `${binding.account_id ?? "unknown"}:subscription:${productKey ?? "unknown"}:${periodKey}`,
    source: "system",
    issued_at: unixToIso(inv.created) ?? nowIso(),
    paid_at: nowIso(),
    metadata: {},
  });
  if (invoiceInsert === "duplicate") {
    const existingInvoice = await db.findInvoiceByStripeInvoiceId(invoiceId);
    if (existingInvoice && existingInvoice.status !== "paid") {
      await db.updateInvoice(existingInvoice.id, { status: "paid", paid_at: nowIso() });
    }
  }

  // Activate / renew the subscription entitlement for the paid period.
  const notes: string[] = [`invoice_mirrored=${invoiceInsert}`];
  if (subId && binding.account_id && productKey) {
    let tenantId = binding.tenant_id;
    if (!tenantId && binding.venue_id) {
      tenantId = await db.findTenantIdForVenue(binding.venue_id);
    }
    const existing = await db.findEntitlementBySubscriptionId(subId);
    if (existing) {
      const planDetail = { ...existing.plan_detail };
      delete planDetail.grace_started_at;
      delete planDetail.grace_ends_at;
      delete planDetail.grace_reason;
      await db.updateEntitlement(existing.id, {
        status: "active",
        effective_at: period.start ?? existing.effective_at,
        expires_at: period.end ?? existing.expires_at,
        payment_id: payment.id,
        plan_detail: planDetail,
      });
      notes.push(`entitlement_renewed=${productKey}`);
    } else if (binding.account_scope === "venue" && !tenantId) {
      notes.push("activation_blocked_no_tenant_mapping");
    } else {
      const inserted = await db.insertEntitlement({
        account_scope: binding.account_scope,
        account_id: binding.account_id,
        tenant_id: binding.account_scope === "venue" ? tenantId : null,
        kind: "subscription_tier",
        product_key: productKey,
        plan_detail: {
          stripe_subscription_id: subId,
          stripe_customer_id: str(inv.customer),
          duration_days: product?.duration_days ?? binding.term_days,
          source: "stripe_webhook",
        },
        features: product?.features ?? [],
        status: "active",
        effective_at: period.start ?? nowIso(),
        expires_at: period.end ?? expiresFrom(nowIso(), product?.duration_days ?? null),
        source: "verified_webhook",
        source_event_id: str(event.id),
        payment_id: payment.id,
        idempotency_key: `${str(event.id)}:${productKey}:${binding.account_id}`,
        metadata: { funnel_key: product?.funnel_key ?? binding.funnel_key },
      });
      notes.push(`entitlement_${inserted}=${productKey}`);
    }
  } else {
    notes.push("entitlement_skipped_missing_binding");
  }
  return { action: `invoice_paid payment=${payment.id} ${notes.join(" ")}` };
}

async function onInvoicePaymentFailed(
  db: PaymentsDb,
  stripe: StripeApi,
  event: Json,
): Promise<RouteOutcome> {
  const inv = obj(obj(event.data).object);
  const subId = invoiceSubscriptionId(inv);
  if (!subId) return { action: "invoice_payment_failed_no_subscription recorded" };
  const entitlement = await db.findEntitlementBySubscriptionId(subId);
  const existingInvoice = str(inv.id)
    ? await db.findInvoiceByStripeInvoiceId(String(inv.id))
    : null;
  if (existingInvoice && existingInvoice.status === "paid") {
    await db.updateInvoice(existingInvoice.id, { status: "payment_failed" });
  }
  if (!entitlement) {
    return { action: "invoice_payment_failed_no_entitlement recorded" };
  }
  if (entitlement.status !== "active") {
    return { action: `invoice_payment_failed_entitlement_${entitlement.status} grace_unchanged` };
  }
  // Grace (access spec §5): features stay ON; 7 days from the first failure
  // (DECIDED 2026-10-22). A later invoice.paid restores active.
  const failedAt = nowIso();
  await db.updateEntitlement(entitlement.id, {
    status: "grace",
    plan_detail: {
      ...entitlement.plan_detail,
      grace_started_at: failedAt,
      grace_ends_at: graceEndsAt(failedAt),
      grace_reason: "invoice_payment_failed",
    },
  });
  return {
    action: `grace_started entitlement=${entitlement.id} grace_ends_at=${graceEndsAt(failedAt)}`,
  };
}

async function onSubscriptionDeleted(
  db: PaymentsDb,
  event: Json,
): Promise<RouteOutcome> {
  const sub = obj(obj(event.data).object);
  const subId = str(sub.id);
  if (!subId) throw new Error("customer.subscription.deleted without a subscription id");
  const entitlement = await db.findEntitlementBySubscriptionId(subId);
  if (!entitlement) return { action: "subscription_deleted_no_entitlement recorded" };
  const endedAt = unixToIso(sub.ended_at);
  const periodEnd = unixToIso(sub.current_period_end);
  const now = nowIso();
  if (endedAt && endedAt <= now) {
    await db.updateEntitlement(entitlement.id, { status: "expired" });
    return { action: `entitlement_expired entitlement=${entitlement.id}` };
  }
  if (periodEnd && periodEnd > now) {
    // Cancel-at-period-end (decided): access runs to the recorded period end.
    await db.updateEntitlement(entitlement.id, { expires_at: periodEnd });
    return { action: `entitlement_expiry_scheduled entitlement=${entitlement.id} at=${periodEnd}` };
  }
  await db.updateEntitlement(entitlement.id, { status: "expired" });
  return { action: `entitlement_expired entitlement=${entitlement.id}` };
}

/** Apply a refund's access adjustment exactly once (guarded by the refunds
 *  row's entitlement_hook_emitted flag — access spec §5/§6). */
async function applyRefundAdjustment(
  db: PaymentsDb,
  payment: PaymentRow,
  refundRow: RefundRow,
  fullRefund: boolean,
  chargeId: string | null,
): Promise<string> {
  const action = refundEntitlementAction(payment.kind, fullRefund);
  let note = `adjustment=${action}`;
  if (action === "revoke") {
    const rows = await db.findEntitlementsByPaymentId(payment.id);
    let revoked = 0;
    for (const row of rows) {
      if (row.status === "active" || row.status === "grace") {
        await db.updateEntitlement(row.id, { status: "revoked" });
        revoked++;
      }
    }
    note += ` revoked=${revoked}`;
  }
  const patch: Partial<RefundRow> = { entitlement_hook_emitted: true };
  if (action === "hook_only") {
    // Ticket/QR invalidation hook: emitted here, executed by the redemption
    // system (access spec §5). The refunds row carries the emission record.
    note += " invalidation_hook=emitted";
    patch.metadata = {
      ...refundRow.metadata,
      invalidation_hook: {
        emitted_at: nowIso(),
        payment_id: payment.id,
        charge_id: chargeId,
      },
    };
  }
  await db.updateRefund(refundRow.id, patch);
  return note;
}

async function reconcileRefund(
  db: PaymentsDb,
  payment: PaymentRow,
  refund: Json,
  eventId: string | null,
): Promise<string> {
  const refundId = str(refund.id);
  if (!refundId) return "refund_missing_id";
  const status = mapRefundStatus(str(refund.status) ?? "");
  const amount = num(refund.amount) ?? 0;
  const chargeId = str(refund.charge) ?? payment.stripe_charge_id;
  const captured = payment.amount_gross_cents + payment.bownd_fee_cents;
  const fullRefund = captured > 0 && amount >= captured;

  const existing = await db.findRefundByStripeRefundId(refundId);
  if (existing) {
    if (existing.status !== status) {
      await db.updateRefund(existing.id, {
        status,
        processed_at: status === "succeeded" ? nowIso() : existing.processed_at,
      });
    }
    if (status === "succeeded" && !existing.entitlement_hook_emitted) {
      const note = await applyRefundAdjustment(db, payment, existing, fullRefund, chargeId);
      return `refund_reconciled id=${refundId} ${note}`;
    }
    return `refund_already_recorded id=${refundId}`;
  }

  const reason = mapRefundReason(payment.metadata?.refund_reason);
  const settlementAdjustment = settlementAdjustmentForRefund(
    payment.venue_net_cents,
    amount,
    captured,
  );
  const inserted = await db.insertRefund({
    payment_id: payment.id,
    tenant_id: payment.seller_tenant_id,
    stripe_refund_id: refundId,
    stripe_charge_id: chargeId,
    amount_cents: amount,
    currency: "USD",
    reason,
    refund_template: typeof payment.metadata?.refund_template === "string"
      ? (payment.metadata.refund_template as string)
      : null,
    status,
    bownd_fee_refunded: reason === "organizer_cancelled",
    settlement_adjustment_cents: settlementAdjustment,
    settlement_adjusted: status === "succeeded",
    settlement_adjusted_at: status === "succeeded" ? nowIso() : null,
    tickets_invalidated: false,
    entitlement_hook_emitted: false,
    source_event_id: eventId,
    idempotency_key: `refund:${refundId}`,
    processed_at: status === "succeeded" ? nowIso() : null,
    metadata: { stripe_reason: str(refund.reason) },
  });
  if (inserted === "duplicate") return `refund_already_recorded id=${refundId}`;

  const fresh = await db.findRefundByStripeRefundId(refundId);
  if (status === "succeeded" && fresh) {
    const note = await applyRefundAdjustment(db, payment, fresh, fullRefund, chargeId);
    return `refund_recorded id=${refundId} ${note}`;
  }
  return `refund_recorded id=${refundId} adjustment=waiting_for_succeeded`;
}

async function onChargeRefunded(
  db: PaymentsDb,
  event: Json,
): Promise<RouteOutcome> {
  const charge = obj(obj(event.data).object);
  const chargeId = str(charge.id);
  if (!chargeId) throw new Error("charge.refunded without a charge id");
  let payment = await db.findPaymentByChargeId(chargeId);
  if (!payment && charge.payment_intent) {
    payment = await db.findPaymentByIntentId(String(charge.payment_intent));
  }
  if (!payment) {
    // Recorded on the event row; never invent a payment to attach it to.
    return { action: `refund_payment_not_found charge=${chargeId}` };
  }
  const refundsData = obj(charge.refunds).data;
  const refundList = Array.isArray(refundsData) ? (refundsData as Json[]) : [];
  const notes: string[] = [];
  for (const refund of refundList) {
    notes.push(await reconcileRefund(db, payment, refund, str(event.id)));
  }
  const amountRefunded = num(charge.amount_refunded);
  if (amountRefunded !== null) {
    const captured = payment.amount_gross_cents + payment.bownd_fee_cents;
    await db.updatePayment(payment.id, {
      refunded_total_cents: amountRefunded,
      status: amountRefunded <= 0
        ? payment.status
        : captured > 0 && amountRefunded >= captured
        ? "refunded"
        : "partially_refunded",
    });
    notes.push(`payment_status_updated refunded_total=${amountRefunded}`);
  }
  return { action: notes.join(" ") || "refund_no_refunds_listed" };
}

async function onRefundUpdated(
  db: PaymentsDb,
  event: Json,
): Promise<RouteOutcome> {
  const refund = obj(obj(event.data).object);
  const chargeId = str(refund.charge);
  if (!chargeId) return { action: "refund_updated_no_charge recorded" };
  const payment = await db.findPaymentByChargeId(chargeId);
  if (!payment) return { action: `refund_payment_not_found charge=${chargeId}` };
  const note = await reconcileRefund(db, payment, refund, str(event.id));
  return { action: note };
}

async function onDispute(
  db: PaymentsDb,
  event: Json,
  closing: boolean,
): Promise<RouteOutcome> {
  const dispute = obj(obj(event.data).object);
  const chargeId = str(dispute.charge);
  if (!chargeId) return { action: "dispute_no_charge recorded" };
  const payment = await db.findPaymentByChargeId(chargeId);
  if (!payment) return { action: `dispute_payment_not_found charge=${chargeId}` };
  if (!closing) {
    // Freeze the disputed amount in settlement views (STRIPE-PLAN §1d):
    // the payment leaves verified-revenue state while disputed.
    await db.updatePayment(payment.id, {
      status: "disputed",
      metadata: {
        ...payment.metadata,
        dispute: {
          id: str(dispute.id),
          amount_cents: num(dispute.amount),
          reason: str(dispute.reason),
          opened_by_event: str(event.id),
        },
      },
    });
    return { action: `payment_disputed payment=${payment.id}` };
  }
  const outcome = str(dispute.status);
  if (outcome === "won" && payment.status === "disputed") {
    await db.updatePayment(payment.id, { status: "verified" });
    return { action: `dispute_won payment_restored payment=${payment.id}` };
  }
  // Lost (or other terminal): stays out of revenue; reconciliation owns the
  // settlement bookkeeping — never silently corrected here (pay-logic §7).
  return { action: `dispute_closed outcome=${outcome ?? "unknown"} payment=${payment.id} flagged_for_reconciliation` };
}

async function onAccountUpdated(
  db: PaymentsDb,
  event: Json,
): Promise<RouteOutcome> {
  const account = obj(obj(event.data).object);
  const accountId = str(account.id);
  if (!accountId) throw new Error("account.updated without an account id");
  const requirements = obj(account.requirements);
  const updated = await db.recordConnectAccountStatus(accountId, {
    stripe_charges_enabled: account.charges_enabled === true,
    stripe_payouts_enabled: account.payouts_enabled === true,
    stripe_details_submitted: account.details_submitted === true,
    stripe_requirements_due: Array.isArray(requirements.currently_due)
      ? requirements.currently_due
      : [],
  });
  return { action: `connect_status_mirrored account=${accountId} venues_updated=${updated}` };
}

// --------------------------------------------------------------- routing ---

async function routeEvent(
  db: PaymentsDb,
  stripe: StripeApi,
  event: Json,
): Promise<RouteOutcome> {
  const type = str(event.type) ?? "";
  switch (type) {
    case "payment_intent.succeeded":
      return onPaymentIntentSucceeded(db, stripe, event);
    case "checkout.session.completed":
      return onCheckoutSessionCompleted(db, event);
    case "payment_intent.payment_failed":
      return onPaymentIntentFailed(db, event);
    case "invoice.paid":
      return onInvoicePaid(db, stripe, event);
    case "invoice.payment_failed":
      return onInvoicePaymentFailed(db, stripe, event);
    case "customer.subscription.deleted":
      return onSubscriptionDeleted(db, event);
    case "customer.subscription.created":
    case "customer.subscription.updated":
      // Record-only: paid tiers activate on invoice.paid, never ahead of
      // the verified invoice (access spec §2).
      return { action: `subscription_state_recorded type=${type}` };
    case "charge.refunded":
      return onChargeRefunded(db, event);
    case "refund.updated":
      return onRefundUpdated(db, event);
    case "charge.dispute.created":
      return onDispute(db, event, false);
    case "charge.dispute.closed":
      return onDispute(db, event, true);
    case "account.updated":
      return onAccountUpdated(db, event);
    case "payout.paid":
    case "payout.failed":
      // Settlement signal: recorded on the event row for the operator
      // surface; payout failure follow-up lives in Livework+ (STRIPE-PLAN §1d).
      return { action: `payout_signal_recorded type=${type}` };
    default:
      return { action: `unhandled_type:${type}`, ignored: true };
  }
}

export interface ProcessOutcome {
  duplicate: boolean;
  action: string;
}

/**
 * Record-then-process with exactly-once semantics: the event row is the
 * dedupe store; a redelivery of a processed event no-ops, a redelivery of
 * a FAILED event reprocesses (every handler is idempotent).
 */
export async function processVerifiedEvent(
  db: PaymentsDb,
  stripe: StripeApi,
  event: Json,
): Promise<ProcessOutcome> {
  const eventId = str(event.id);
  const type = str(event.type);
  if (!eventId || !type) throw new Error("event missing id/type");

  const insert = await db.insertWebhookEvent({
    stripe_event_id: eventId,
    event_type: type,
    api_version: str(event.api_version),
    livemode: event.livemode === true,
    payload: event,
    signature_verified: true,
    processing_status: "received",
    processing_result: null,
    processing_attempts: 0,
    processed_at: null,
  });
  if (insert === "duplicate") {
    const existing = await db.getWebhookEvent(eventId);
    if (
      existing &&
      (existing.processing_status === "processed" ||
        existing.processing_status === "ignored")
    ) {
      return { duplicate: true, action: "duplicate_noop" };
    }
    // failed / received / processing (crashed) → reprocess below.
  }

  const prior = await db.getWebhookEvent(eventId);
  await db.updateWebhookEvent(eventId, {
    processing_status: "processing",
    processing_attempts: (prior?.processing_attempts ?? 0) + 1,
  });

  try {
    if (event.livemode === true) {
      await db.updateWebhookEvent(eventId, {
        processing_status: "ignored",
        processing_result: "ignored_livemode_test_build",
        processed_at: nowIso(),
      });
      return { duplicate: false, action: "ignored_livemode_test_build" };
    }
    const outcome = await routeEvent(db, stripe, event);
    await db.updateWebhookEvent(eventId, {
      processing_status: outcome.ignored ? "ignored" : "processed",
      processing_result: outcome.action,
      processed_at: nowIso(),
    });
    return { duplicate: false, action: outcome.action };
  } catch (err) {
    await db.updateWebhookEvent(eventId, {
      processing_status: "failed",
      processing_result: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// --------------------------------------------------------- HTTP handler ----

export interface WebhookDeps {
  /** STRIPE_WEBHOOK_SECRET from function secrets. Never logged. */
  secret: string;
  db: PaymentsDb;
  stripe: StripeApi;
}

/**
 * The receiver (STRIPE-PLAN §1d): verify the signature over the RAW body
 * before trusting anything; unverified deliveries are rejected (400) and
 * logged — never recorded, never processed. Verified deliveries are
 * acknowledged 200 once recorded+processed; a processing failure returns
 * 500 so Stripe redelivers, and the reprocess path converges safely.
 */
export async function handleStripeWebhookRequest(
  req: Request,
  deps: WebhookDeps,
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  const rawBody = await req.text();
  const check = await verifyStripeSignature(
    rawBody,
    req.headers.get("stripe-signature"),
    deps.secret,
  );
  if (!check.ok) {
    console.error(`stripe-webhook: signature rejected (${check.reason})`);
    return jsonResponse(
      { error: "signature_verification_failed", reason: check.reason },
      400,
    );
  }
  let event: Json;
  try {
    event = JSON.parse(rawBody) as Json;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  if (!str(event.id) || !str(event.type)) {
    return jsonResponse({ error: "invalid_event" }, 400);
  }
  try {
    const outcome = await processVerifiedEvent(deps.db, deps.stripe, event);
    return jsonResponse({ received: true, ...outcome }, 200);
  } catch (err) {
    console.error(
      `stripe-webhook: processing failed for ${String(event.id)}:`,
      err instanceof Error ? err.message : String(err),
    );
    return jsonResponse({ error: "processing_failed" }, 500);
  }
}
