// fixtures.ts — Simulated Stripe events for the harness, signed with a
// harness-only webhook secret (the same HMAC scheme Stripe uses, via the
// production core module). Test-mode shaped ids only; nothing here touches
// a real account.

import { computeSignatureHex } from "../../supabase/functions/_shared/stripe-core.ts";

export const HARNESS_SECRET = "whsec_harness_only_not_a_real_secret";

export const ACCOUNT_ID = "11111111-2222-3333-4444-555555555555";
export const TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
export const VENUE_ID = "99999999-8888-7777-6666-555555555555";

export interface SignedDelivery {
  body: string;
  signatureHeader: string;
}

/** Serialize + sign an event exactly as Stripe would deliver it. */
export async function signEvent(event: Record<string, unknown>): Promise<SignedDelivery> {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = await computeSignatureHex(HARNESS_SECRET, t, body);
  return { body, signatureHeader: `t=${t},v1=${v1}` };
}

function baseEvent(
  id: string,
  type: string,
  object: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id,
    object: "event",
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  };
}

export const EVENT_LAUNCH_METADATA: Record<string, string> = {
  product_key: "pkg_event_launch",
  funnel: "f1",
  account_id: ACCOUNT_ID,
  account_scope: "venue",
  tenant_id: TENANT_ID,
  venue_id: VENUE_ID,
};

/** $249 Event Launch PaymentIntent (one-time, destination charge shape). */
export function eventLaunchPi(id = "pi_test_event_launch_1"): Record<string, unknown> {
  return {
    id,
    object: "payment_intent",
    amount: 24900,
    amount_received: 24900,
    currency: "usd",
    status: "succeeded",
    customer: "cus_test_venue_1",
    latest_charge: "ch_test_event_launch_1",
    invoice: null,
    on_behalf_of: "acct_test_venue_1",
    transfer_data: { destination: "acct_test_venue_1" },
    metadata: { ...EVENT_LAUNCH_METADATA },
  };
}

export function piSucceededEvent(
  eventId: string,
  pi: Record<string, unknown>,
): Record<string, unknown> {
  return baseEvent(eventId, "payment_intent.succeeded", pi);
}

export function checkoutCompletedEvent(
  eventId: string,
  pi: Record<string, unknown>,
): Record<string, unknown> {
  return baseEvent(eventId, "checkout.session.completed", {
    id: "cs_test_event_launch_1",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 24900,
    currency: "usd",
    payment_intent: pi.id,
    customer: "cus_test_venue_1",
    metadata: { ...EVENT_LAUNCH_METADATA },
  });
}

export function chargeRefundedEvent(
  eventId: string,
  opts: { refundId?: string; amountRefunded?: number } = {},
): Record<string, unknown> {
  const refundId = opts.refundId ?? "re_test_1";
  const amountRefunded = opts.amountRefunded ?? 24900;
  return baseEvent(eventId, "charge.refunded", {
    id: "ch_test_event_launch_1",
    object: "charge",
    amount: 24900,
    amount_refunded: amountRefunded,
    currency: "usd",
    payment_intent: "pi_test_event_launch_1",
    customer: "cus_test_venue_1",
    refunds: {
      object: "list",
      data: [
        {
          id: refundId,
          object: "refund",
          amount: amountRefunded,
          charge: "ch_test_event_launch_1",
          payment_intent: "pi_test_event_launch_1",
          status: "succeeded",
          reason: "requested_by_customer",
          metadata: {},
        },
      ],
    },
  });
}

export const SPOTLIGHT_METADATA: Record<string, string> = {
  product_key: "placement_spotlight_event_campaign",
  funnel: "f1",
  account_id: ACCOUNT_ID,
  account_scope: "venue",
  tenant_id: TENANT_ID,
  venue_id: VENUE_ID,
};

/** $299/mo Spotlight subscription + its invoice (period: Nov 13 → Dec 13). */
export function spotlightSubscription(): Record<string, unknown> {
  return {
    id: "sub_test_spotlight_1",
    object: "subscription",
    status: "active",
    customer: "cus_test_venue_1",
    current_period_start: 1763000000,
    current_period_end: 1765600000,
    metadata: { ...SPOTLIGHT_METADATA },
    items: {
      object: "list",
      data: [{ id: "si_test_1", price: { id: "price_test_spotlight" } }],
    },
  };
}

export function spotlightInvoice(
  status: "paid" | "open",
  amount = 29900,
): Record<string, unknown> {
  return {
    id: "in_test_spotlight_1",
    object: "invoice",
    status,
    amount_due: amount,
    amount_paid: status === "paid" ? amount : 0,
    currency: "usd",
    customer: "cus_test_venue_1",
    subscription: "sub_test_spotlight_1",
    charge: "ch_test_spotlight_1",
    payment_intent: "pi_test_spotlight_1",
    period_start: 1763000000,
    period_end: 1765600000,
    lines: {
      object: "list",
      data: [
        {
          description: "Spotlight — Event/Campaign (NYE)",
          amount,
          quantity: 1,
          period: { start: 1763000000, end: 1765600000 },
        },
      ],
    },
  };
}

export function invoicePaidEvent(
  eventId: string,
  invoice: Record<string, unknown>,
): Record<string, unknown> {
  return baseEvent(eventId, "invoice.paid", invoice);
}

export function invoiceFailedEvent(
  eventId: string,
  invoice: Record<string, unknown>,
): Record<string, unknown> {
  return baseEvent(eventId, "invoice.payment_failed", invoice);
}

/** The PaymentIntent behind the Spotlight invoice (metadata empty — the
 *  binding must resolve PI → invoice → subscription). */
export function spotlightPi(): Record<string, unknown> {
  return {
    id: "pi_test_spotlight_1",
    object: "payment_intent",
    amount: 29900,
    amount_received: 29900,
    currency: "usd",
    status: "succeeded",
    customer: "cus_test_venue_1",
    latest_charge: "ch_test_spotlight_1",
    invoice: "in_test_spotlight_1",
    metadata: {},
  };
}
