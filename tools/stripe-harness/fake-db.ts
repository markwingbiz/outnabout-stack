// fake-db.ts — In-memory PaymentsDb with the migration's UNIQUE constraints
// enforced, so the harness actually proves idempotency instead of trusting
// it. Mirrors ~/workspace/payments-migration-draft.sql:
//   stripe_webhook_events UNIQUE(stripe_event_id)
//   payments UNIQUE(source_event_id), UNIQUE(idempotency_key),
//     partial-unique on stripe ids
//   refunds UNIQUE(stripe_refund_id) (partial in SQL; always set here)
//   entitlements UNIQUE(idempotency_key)
//   invoices UNIQUE(idempotency_key)

import type {
  EntitlementRow,
  InsertResult,
  InvoiceRow,
  PaymentRow,
  PaymentsDb,
  RefundRow,
  WebhookEventRow,
} from "../../supabase/functions/_shared/stripe-db.ts";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

function dupOn(
  rows: readonly object[],
  key: string,
  value: unknown,
): boolean {
  if (value === null || value === undefined) return false;
  return rows.some((r) => (r as Record<string, unknown>)[key] === value);
}

export class FakeDb implements PaymentsDb {
  webhookEvents: WebhookEventRow[] = [];
  payments: PaymentRow[] = [];
  refunds: RefundRow[] = [];
  entitlements: EntitlementRow[] = [];
  invoices: InvoiceRow[] = [];
  funnels = new Map<string, string>([
    ["f1", "funnel_f1"],
    ["f2", "funnel_f2"],
  ]);
  venueTenants = new Map<string, string>();

  // ------------------------------------------------------------ webhooks --
  insertWebhookEvent(row: Omit<WebhookEventRow, "id">): Promise<InsertResult> {
    if (dupOn(this.webhookEvents, "stripe_event_id", row.stripe_event_id)) {
      return Promise.resolve("duplicate");
    }
    this.webhookEvents.push({ ...row, id: nextId("evt") });
    return Promise.resolve("inserted");
  }

  getWebhookEvent(stripeEventId: string): Promise<WebhookEventRow | null> {
    return Promise.resolve(
      this.webhookEvents.find((r) => r.stripe_event_id === stripeEventId) ?? null,
    );
  }

  updateWebhookEvent(
    stripeEventId: string,
    patch: Partial<WebhookEventRow>,
  ): Promise<void> {
    const row = this.webhookEvents.find((r) => r.stripe_event_id === stripeEventId);
    if (row) Object.assign(row, patch);
    return Promise.resolve();
  }

  // ------------------------------------------------------------ payments --
  findPaymentByIntentId(id: string): Promise<PaymentRow | null> {
    return Promise.resolve(
      this.payments.find((r) => r.stripe_payment_intent_id === id) ?? null,
    );
  }

  findPaymentByChargeId(id: string): Promise<PaymentRow | null> {
    return Promise.resolve(this.payments.find((r) => r.stripe_charge_id === id) ?? null);
  }

  findPaymentBySessionId(id: string): Promise<PaymentRow | null> {
    return Promise.resolve(
      this.payments.find((r) => r.stripe_checkout_session_id === id) ?? null,
    );
  }

  findPaymentByInvoiceId(id: string): Promise<PaymentRow | null> {
    return Promise.resolve(
      this.payments.find((r) => r.stripe_invoice_id === id) ?? null,
    );
  }

  insertPayment(row: Omit<PaymentRow, "id">): Promise<PaymentRow> {
    if (
      dupOn(this.payments, "source_event_id", row.source_event_id) ||
      dupOn(this.payments, "idempotency_key", row.idempotency_key) ||
      dupOn(this.payments, "stripe_payment_intent_id", row.stripe_payment_intent_id) ||
      dupOn(this.payments, "stripe_charge_id", row.stripe_charge_id) ||
      dupOn(this.payments, "stripe_checkout_session_id", row.stripe_checkout_session_id)
    ) {
      throw new Error("payments unique violation (fake)");
    }
    const stored = { ...row, id: nextId("pay") } as PaymentRow;
    this.payments.push(stored);
    return Promise.resolve(stored);
  }

  updatePayment(id: string, patch: Partial<PaymentRow>): Promise<void> {
    const row = this.payments.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    return Promise.resolve();
  }

  // --------------------------------------------------------- entitlements --
  findEntitlementByIdempotencyKey(key: string): Promise<EntitlementRow | null> {
    return Promise.resolve(
      this.entitlements.find((r) => r.idempotency_key === key) ?? null,
    );
  }

  findEntitlementBySubscriptionId(
    subscriptionId: string,
  ): Promise<EntitlementRow | null> {
    const found = [...this.entitlements].reverse().find((r) => {
      const detail = r.plan_detail as Record<string, unknown> | null;
      return detail?.stripe_subscription_id === subscriptionId;
    });
    return Promise.resolve(found ?? null);
  }

  findEntitlementsByPaymentId(paymentId: string): Promise<EntitlementRow[]> {
    return Promise.resolve(this.entitlements.filter((r) => r.payment_id === paymentId));
  }

  insertEntitlement(row: Omit<EntitlementRow, "id">): Promise<InsertResult> {
    if (dupOn(this.entitlements, "idempotency_key", row.idempotency_key)) {
      return Promise.resolve("duplicate");
    }
    this.entitlements.push({ ...row, id: nextId("ent") });
    return Promise.resolve("inserted");
  }

  updateEntitlement(id: string, patch: Partial<EntitlementRow>): Promise<void> {
    const row = this.entitlements.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    return Promise.resolve();
  }

  // -------------------------------------------------------------- refunds --
  findRefundByStripeRefundId(id: string): Promise<RefundRow | null> {
    return Promise.resolve(this.refunds.find((r) => r.stripe_refund_id === id) ?? null);
  }

  insertRefund(row: Omit<RefundRow, "id">): Promise<InsertResult> {
    if (dupOn(this.refunds, "stripe_refund_id", row.stripe_refund_id)) {
      return Promise.resolve("duplicate");
    }
    this.refunds.push({ ...row, id: nextId("ref") });
    return Promise.resolve("inserted");
  }

  updateRefund(id: string, patch: Partial<RefundRow>): Promise<void> {
    const row = this.refunds.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    return Promise.resolve();
  }

  // -------------------------------------------------------------- invoices --
  findInvoiceByStripeInvoiceId(id: string): Promise<InvoiceRow | null> {
    return Promise.resolve(
      this.invoices.find((r) => r.stripe_invoice_id === id) ?? null,
    );
  }

  insertInvoice(row: Omit<InvoiceRow, "id">): Promise<InsertResult> {
    if (dupOn(this.invoices, "idempotency_key", row.idempotency_key)) {
      return Promise.resolve("duplicate");
    }
    this.invoices.push({ ...row, id: nextId("inv") });
    return Promise.resolve("inserted");
  }

  updateInvoice(id: string, patch: Partial<InvoiceRow>): Promise<void> {
    const row = this.invoices.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    return Promise.resolve();
  }

  // -------------------------------------------------------------- lookups --
  findFunnelIdByKey(key: string): Promise<string | null> {
    return Promise.resolve(this.funnels.get(key) ?? null);
  }

  findTenantIdForVenue(venueId: string): Promise<string | null> {
    return Promise.resolve(this.venueTenants.get(venueId) ?? null);
  }

  recordConnectAccountStatus(
    _accountId: string,
    _status: Record<string, unknown>,
  ): Promise<number> {
    return Promise.resolve(1);
  }
}
