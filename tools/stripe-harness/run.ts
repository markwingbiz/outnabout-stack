// run.ts — Drives the REAL receiver (handleStripeWebhookRequest, the exact
// code stripe-webhook/index.ts serves) with simulated Stripe deliveries and
// asserts the required proofs:
//   (a) bad signature → 400, nothing recorded
//   (b) same event twice → entitlement activates exactly once
//   (c) payment_intent.succeeded → exactly one payments row (verified,
//       amount from payload) + entitlements incl. the package inclusion
//   (d) charge.refunded → refunds row + access adjusted per the templates,
//       exactly once even on redelivery
//   (e) checkout.session.completed alone activates NOTHING (AccessPrime:
//       only payment_intent.succeeded activates)
//   (f) subscription: invoice.paid activates + mirrors the invoice;
//       invoice.payment_failed → 7-day grace, features stay on;
//       next invoice.paid clears the grace.
// Run: node run.ts   (exit 0 = all pass)

declare const process: { exit(code: number): never };

import { handleStripeWebhookRequest } from "../../supabase/functions/_shared/stripe-processing.ts";
import { FakeDb } from "./fake-db.ts";
import { FakeStripe } from "./fake-stripe.ts";
import {
  ACCOUNT_ID,
  chargeRefundedEvent,
  checkoutCompletedEvent,
  eventLaunchPi,
  HARNESS_SECRET,
  invoiceFailedEvent,
  invoicePaidEvent,
  piSucceededEvent,
  signEvent,
  spotlightInvoice,
  spotlightPi,
  spotlightSubscription,
  TENANT_ID,
  VENUE_ID,
} from "./fixtures.ts";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

interface Deps {
  db: FakeDb;
  stripe: FakeStripe;
}

async function deliver(
  deps: Deps,
  signed: { body: string; signatureHeader: string },
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const req = new Request("https://example.test/functions/v1/stripe-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signed.signatureHeader,
    },
    body: signed.body,
  });
  const res = await handleStripeWebhookRequest(req, {
    secret: HARNESS_SECRET,
    db: deps.db,
    stripe: deps.stripe,
  });
  const payload = (await res.json()) as Record<string, unknown>;
  return { status: res.status, payload };
}

function freshDeps(): Deps {
  const db = new FakeDb();
  db.venueTenants.set(VENUE_ID, TENANT_ID);
  return { db, stripe: new FakeStripe() };
}

async function scenarioBadSignature(): Promise<void> {
  console.log("\n(a) bad signature is rejected before anything is recorded");
  const deps = freshDeps();
  const signed = await signEvent(piSucceededEvent("evt_bad_sig", eventLaunchPi()));
  const tampered = {
    body: signed.body,
    signatureHeader: signed.signatureHeader.replace(/v1=.{8}/, "v1=deadbeef"),
  };
  const originalError = console.error;
  console.error = () => {};
  const res = await deliver(deps, tampered);
  console.error = originalError;
  check("HTTP 400", res.status === 400, `got ${res.status}`);
  check("zero webhook rows recorded", deps.db.webhookEvents.length === 0);
  check("zero payments", deps.db.payments.length === 0);
  check("zero entitlements", deps.db.entitlements.length === 0);
}

async function scenarioOneTimePurchaseAndRefund(): Promise<void> {
  console.log("\n(e)+(c)+(b)+(d) Event Launch: session → PI success → duplicate → refund");
  const deps = freshDeps();
  const pi = eventLaunchPi();
  deps.stripe.paymentIntents.set(String(pi.id), pi as never);

  // (e) checkout.session.completed FIRST: records, activates nothing.
  const sessionDelivery = await signEvent(checkoutCompletedEvent("evt_cs_1", pi));
  const r1 = await deliver(deps, sessionDelivery);
  check("session delivery HTTP 200", r1.status === 200, `got ${r1.status}`);
  check("one payments row after session", deps.db.payments.length === 1);
  check(
    "session row is 'pending' (not verified)",
    deps.db.payments[0]?.status === "pending",
    `got ${deps.db.payments[0]?.status}`,
  );
  check(
    "session activates ZERO entitlements",
    deps.db.entitlements.length === 0,
    `got ${deps.db.entitlements.length}`,
  );

  // (c) payment_intent.succeeded: verifies + activates exactly once.
  const piDelivery = await signEvent(piSucceededEvent("evt_pi_1", pi));
  const r2 = await deliver(deps, piDelivery);
  check("PI delivery HTTP 200", r2.status === 200, `got ${r2.status}`);
  check("still exactly one payments row", deps.db.payments.length === 1);
  const payment = deps.db.payments[0];
  check("payment status verified", payment?.status === "verified", `got ${payment?.status}`);
  check(
    "amount_gross_cents = 24900 from payload",
    payment?.amount_gross_cents === 24900,
    `got ${payment?.amount_gross_cents}`,
  );
  check(
    "source_event_id is the PI event id",
    payment?.source_event_id === "evt_pi_1",
    `got ${payment?.source_event_id}`,
  );
  check(
    "payer account + tenant + seller venue stamped",
    payment?.payer_account_id === ACCOUNT_ID &&
      payment?.payer_tenant_id === TENANT_ID &&
      payment?.seller_venue_id === VENUE_ID,
  );
  check(
    "funnel stamped f1",
    payment?.funnel_id === "funnel_f1",
    `got ${payment?.funnel_id}`,
  );
  check(
    "connected account recorded",
    payment?.stripe_connected_account_id === "acct_test_venue_1",
    `got ${payment?.stripe_connected_account_id}`,
  );
  const launch = deps.db.entitlements.find((e) => e.product_key === "pkg_event_launch");
  const inclusion = deps.db.entitlements.find(
    (e) => e.product_key === "placement_spotlight_event",
  );
  check("entitlement pkg_event_launch granted", launch?.status === "active");
  check(
    "idempotency key = source_event_id:product_key:account_id",
    launch?.idempotency_key ===
      `evt_pi_1:pkg_event_launch:${ACCOUNT_ID}`,
    `got ${launch?.idempotency_key}`,
  );
  check(
    "package inclusion granted (1-wk Spotlight, kind=package_inclusion)",
    inclusion?.status === "active" && inclusion?.kind === "package_inclusion",
  );
  check(
    "inclusion expires ~7 days out",
    inclusion?.expires_at !== null &&
      Math.abs(Date.parse(inclusion?.expires_at ?? "") - (Date.now() + 7 * 86400_000)) <
        60_000,
    `got ${inclusion?.expires_at}`,
  );
  check("exactly two entitlement rows", deps.db.entitlements.length === 2);

  // (b) the SAME event delivered again: acknowledged, changes nothing.
  const r3 = await deliver(deps, piDelivery);
  check("redelivery HTTP 200", r3.status === 200, `got ${r3.status}`);
  check(
    "redelivery marked duplicate",
    r3.payload.duplicate === true,
    JSON.stringify(r3.payload),
  );
  check("still one payments row", deps.db.payments.length === 1);
  check("still two entitlements (no double grant)", deps.db.entitlements.length === 2);

  // (d) full refund: refunds row + entitlements revoked, exactly once.
  const refundDelivery = await signEvent(chargeRefundedEvent("evt_refund_1", {}));
  const r4 = await deliver(deps, refundDelivery);
  check("refund delivery HTTP 200", r4.status === 200, `got ${r4.status}`);
  check("exactly one refunds row", deps.db.refunds.length === 1);
  const refund = deps.db.refunds[0];
  check("refund amount 24900", refund?.amount_cents === 24900, `got ${refund?.amount_cents}`);
  check("refund status succeeded", refund?.status === "succeeded");
  check(
    "entitlement hook emitted flag set",
    refund?.entitlement_hook_emitted === true,
  );
  check(
    "payment now refunded, refunded_total 24900",
    deps.db.payments[0]?.status === "refunded" &&
      deps.db.payments[0]?.refunded_total_cents === 24900,
    `got ${deps.db.payments[0]?.status}/${deps.db.payments[0]?.refunded_total_cents}`,
  );
  check(
    "package entitlement revoked per refund templates",
    deps.db.entitlements.find((e) => e.product_key === "pkg_event_launch")?.status ===
      "revoked",
  );
  check(
    "inclusion revoked too",
    deps.db.entitlements.find((e) => e.product_key === "placement_spotlight_event")
      ?.status === "revoked",
  );
  const r5 = await deliver(deps, refundDelivery);
  check("refund redelivery HTTP 200", r5.status === 200, `got ${r5.status}`);
  check("still exactly one refunds row", deps.db.refunds.length === 1);
}

async function scenarioSubscriptionGrace(): Promise<void> {
  console.log("\n(f) Spotlight subscription: paid → failed (7-day grace) → paid");
  const deps = freshDeps();
  const sub = spotlightSubscription();
  const invPaid = spotlightInvoice("paid");
  const pi = spotlightPi();
  deps.stripe.subscriptions.set(String(sub.id), sub as never);
  deps.stripe.invoices.set(String(invPaid.id), invPaid as never);
  deps.stripe.paymentIntents.set(String(pi.id), pi as never);

  const r1 = await deliver(
    deps,
    await signEvent(invoicePaidEvent("evt_inv_1", invPaid)),
  );
  check("invoice.paid HTTP 200", r1.status === 200, `got ${r1.status}`);
  check("one payments row", deps.db.payments.length === 1);
  const payment = deps.db.payments[0];
  check(
    "payment verified at 29900 via invoice",
    payment?.status === "verified" && payment?.amount_gross_cents === 29900,
    `got ${payment?.status}/${payment?.amount_gross_cents}`,
  );
  check("one invoices mirror row", deps.db.invoices.length === 1);
  check(
    "invoice total 29900, status paid",
    deps.db.invoices[0]?.total_cents === 29900 && deps.db.invoices[0]?.status === "paid",
  );
  const ent = deps.db.entitlements.find(
    (e) => e.product_key === "placement_spotlight_event_campaign",
  );
  check("subscription entitlement active", ent?.status === "active");
  check(
    "entitlement expires at period end",
    ent?.expires_at === new Date(1765600000 * 1000).toISOString(),
    `got ${ent?.expires_at}`,
  );
  check(
    "binding resolved PI → invoice → subscription (read-backs happened)",
    deps.stripe.calls.some((c) => c.startsWith("retrieveSubscription")),
    deps.stripe.calls.join(", "),
  );

  // Failed renewal: grace, features stay on (status 'grace', not revoked).
  const invOpen = spotlightInvoice("open", 29900);
  deps.stripe.invoices.set(String(invOpen.id), invOpen as never);
  const r2 = await deliver(
    deps,
    await signEvent(invoiceFailedEvent("evt_inv_2", invOpen)),
  );
  check("invoice.payment_failed HTTP 200", r2.status === 200, `got ${r2.status}`);
  const graced = deps.db.entitlements.find(
    (e) => e.product_key === "placement_spotlight_event_campaign",
  );
  check("entitlement in grace (not revoked/expired)", graced?.status === "grace");
  const detail = (graced?.plan_detail ?? {}) as Record<string, unknown>;
  check(
    "grace_ends_at ≈ +7 days (DECIDED 2026-10-22)",
    typeof detail.grace_ends_at === "string" &&
      Math.abs(Date.parse(detail.grace_ends_at) - (Date.now() + 7 * 86400_000)) < 60_000,
    `got ${String(detail.grace_ends_at)}`,
  );

  // Next successful invoice clears the grace.
  const r3 = await deliver(
    deps,
    await signEvent(invoicePaidEvent("evt_inv_3", invPaid)),
  );
  check("second invoice.paid HTTP 200", r3.status === 200, `got ${r3.status}`);
  const restored = deps.db.entitlements.find(
    (e) => e.product_key === "placement_spotlight_event_campaign",
  );
  check("entitlement active again", restored?.status === "active");
  check("still one invoices row (mirror updated)", deps.db.invoices.length === 1);
  check("still one entitlement row", deps.db.entitlements.length === 1);
}

await scenarioBadSignature();
await scenarioOneTimePurchaseAndRefund();
await scenarioSubscriptionGrace();

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
