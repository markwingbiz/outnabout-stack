// _shared/stripe-db.ts — The persistence interface the pay-side logic runs
// against. Two implementations exist:
//   - supabase-payments-db.ts (production, over the service-role client,
//     against the six payments tables created by the 2026-11-09 migration)
//   - tools/stripe-harness/fake-db.ts (in-memory, enforces the same UNIQUE
//     constraints so the idempotency proofs are real)
// Row shapes mirror ~/workspace/payments-migration-draft.sql exactly. All
// money fields are integer cents; currency is locked to 'USD' by the schema.

export interface WebhookEventRow {
  id?: string;
  stripe_event_id: string;
  event_type: string;
  api_version: string | null;
  livemode: boolean;
  payload: Record<string, unknown>;
  signature_verified: boolean;
  processing_status: "received" | "processing" | "processed" | "failed" | "ignored";
  processing_result: string | null;
  processing_attempts: number;
  processed_at: string | null;
}

export interface PaymentRow {
  id: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_charge_id: string | null;
  stripe_customer_id: string | null;
  stripe_connected_account_id: string | null;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  payer_scope: "customer" | "venue";
  payer_account_id: string | null;
  payer_tenant_id: string | null;
  seller_tenant_id: string | null;
  seller_venue_id: string | null;
  kind: string;
  product_key: string | null;
  order_id: string | null;
  funnel_id: string | null;
  amount_gross_cents: number;
  bownd_fee_cents: number;
  stripe_fee_cents: number | null;
  venue_net_cents: number | null;
  refunded_total_cents: number;
  currency: string;
  status: string;
  fee_included_in_package: boolean;
  fee_included_in_product_key: string | null;
  attributed_venue_id: string | null;
  attribution_source: string | null;
  source_event_id: string | null;
  idempotency_key: string | null;
  verified_at: string | null;
  settled_at: string | null;
  metadata: Record<string, unknown>;
}

export interface RefundRow {
  id: string;
  payment_id: string;
  tenant_id: string | null;
  stripe_refund_id: string | null;
  stripe_charge_id: string | null;
  amount_cents: number;
  currency: string;
  reason: string;
  refund_template: string | null;
  status: string;
  bownd_fee_refunded: boolean;
  settlement_adjustment_cents: number;
  settlement_adjusted: boolean;
  settlement_adjusted_at: string | null;
  tickets_invalidated: boolean;
  entitlement_hook_emitted: boolean;
  source_event_id: string | null;
  idempotency_key: string | null;
  processed_at: string | null;
  metadata: Record<string, unknown>;
}

export interface EntitlementRow {
  id: string;
  account_scope: "customer" | "venue";
  account_id: string;
  tenant_id: string | null;
  kind: string;
  product_key: string;
  plan_detail: Record<string, unknown>;
  features: unknown[];
  status: "active" | "grace" | "expired" | "revoked";
  effective_at: string;
  expires_at: string | null;
  source: "verified_webhook" | "signup" | "manual_override";
  source_event_id: string | null;
  payment_id: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown>;
}

export interface InvoiceRow {
  id: string;
  account_scope: "venue";
  account_id: string;
  tenant_id: string | null;
  kind: string;
  product_key: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  currency: string;
  lines: unknown[];
  inputs_snapshot: Record<string, unknown>;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  stripe_invoice_id: string | null;
  stripe_charge_id: string | null;
  stripe_subscription_id: string | null;
  payment_id: string | null;
  idempotency_key: string;
  source: "system" | "manual_override";
  issued_at: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown>;
}

export type InsertResult = "inserted" | "duplicate";

export interface PaymentsDb {
  // stripe_webhook_events — the dedupe store (UNIQUE stripe_event_id).
  insertWebhookEvent(row: Omit<WebhookEventRow, "id">): Promise<InsertResult>;
  getWebhookEvent(stripeEventId: string): Promise<WebhookEventRow | null>;
  updateWebhookEvent(
    stripeEventId: string,
    patch: Partial<WebhookEventRow>,
  ): Promise<void>;

  // payments — UNIQUE (partial) on PI / charge / session ids, UNIQUE
  // source_event_id, UNIQUE idempotency_key.
  findPaymentByIntentId(id: string): Promise<PaymentRow | null>;
  findPaymentByChargeId(id: string): Promise<PaymentRow | null>;
  findPaymentBySessionId(id: string): Promise<PaymentRow | null>;
  findPaymentByInvoiceId(id: string): Promise<PaymentRow | null>;
  insertPayment(row: Omit<PaymentRow, "id">): Promise<PaymentRow>;
  updatePayment(id: string, patch: Partial<PaymentRow>): Promise<void>;

  // entitlements — UNIQUE idempotency_key AND UNIQUE
  // (source_event_id, product_key, account_id): the AccessPrime rule.
  findEntitlementByIdempotencyKey(key: string): Promise<EntitlementRow | null>;
  findEntitlementBySubscriptionId(subscriptionId: string): Promise<EntitlementRow | null>;
  findEntitlementsByPaymentId(paymentId: string): Promise<EntitlementRow[]>;
  insertEntitlement(row: Omit<EntitlementRow, "id">): Promise<InsertResult>;
  updateEntitlement(id: string, patch: Partial<EntitlementRow>): Promise<void>;

  // refunds — UNIQUE (partial) stripe_refund_id, UNIQUE idempotency_key.
  findRefundByStripeRefundId(id: string): Promise<RefundRow | null>;
  insertRefund(row: Omit<RefundRow, "id">): Promise<InsertResult>;
  updateRefund(id: string, patch: Partial<RefundRow>): Promise<void>;

  // invoices — UNIQUE idempotency_key, UNIQUE (partial) stripe_invoice_id.
  findInvoiceByStripeInvoiceId(id: string): Promise<InvoiceRow | null>;
  insertInvoice(row: Omit<InvoiceRow, "id">): Promise<InsertResult>;
  updateInvoice(id: string, patch: Partial<InvoiceRow>): Promise<void>;

  // Lookups.
  /** money_funnels.id for a canonical key ('f1'...'f8'); null = never guess. */
  findFunnelIdByKey(key: string): Promise<string | null>;
  /** tenants.id that owns a venue (venues.tenant_id); null when unmapped. */
  findTenantIdForVenue(venueId: string): Promise<string | null>;
  /** account.updated: mirror Connect state onto venues whose
   *  metadata.stripe_account_id matches. Returns how many venues updated. */
  recordConnectAccountStatus(
    accountId: string,
    status: Record<string, unknown>,
  ): Promise<number>;
}
