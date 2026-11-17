// _shared/supabase-payments-db.ts — PaymentsDb over the service-role client.
//
// The six tables already exist (payments migration, run + verified
// 2026-11-09/10 — never re-run it). Every write here goes through the
// service role from _shared/helpers.ts getClients(); RLS policies on these
// tables are operator/admin-only, so no tenant or anon path can reach them.
// UNIQUE violations (Postgres 23505) are translated into the interface's
// 'duplicate' result — they are the idempotency mechanism, not errors.

import type { SupabaseClient } from "./helpers.ts";
import type {
  EntitlementRow,
  InsertResult,
  InvoiceRow,
  PaymentRow,
  PaymentsDb,
  RefundRow,
  WebhookEventRow,
} from "./stripe-db.ts";

type Row = Record<string, unknown>;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

export class SupabasePaymentsDb implements PaymentsDb {
  private service: SupabaseClient;

  constructor(service: SupabaseClient) {
    this.service = service;
  }

  private async insertRow(
    table: string,
    row: Row,
  ): Promise<{ result: InsertResult; data: Row | null }> {
    const { data, error } = await this.service
      .from(table)
      .insert(row)
      .select("*")
      .single();
    if (error) {
      if (isUniqueViolation(error)) return { result: "duplicate", data: null };
      throw new Error(`${table} insert failed: ${error.message}`);
    }
    return { result: "inserted", data: data as Row };
  }

  private async updateRow(table: string, id: string, patch: Row): Promise<void> {
    const { error } = await this.service.from(table).update(patch).eq("id", id);
    if (error) throw new Error(`${table} update failed: ${error.message}`);
  }

  private async findOne(
    table: string,
    column: string,
    value: string,
  ): Promise<Row | null> {
    const { data, error } = await this.service
      .from(table)
      .select("*")
      .eq(column, value)
      .maybeSingle();
    if (error) throw new Error(`${table} lookup failed: ${error.message}`);
    return (data as Row | null) ?? null;
  }

  // ------------------------------------------------------ webhook events --

  async insertWebhookEvent(row: Omit<WebhookEventRow, "id">): Promise<InsertResult> {
    const { result } = await this.insertRow("stripe_webhook_events", { ...row });
    return result;
  }

  async getWebhookEvent(stripeEventId: string): Promise<WebhookEventRow | null> {
    return (await this.findOne(
      "stripe_webhook_events",
      "stripe_event_id",
      stripeEventId,
    )) as WebhookEventRow | null;
  }

  async updateWebhookEvent(
    stripeEventId: string,
    patch: Partial<WebhookEventRow>,
  ): Promise<void> {
    const { error } = await this.service
      .from("stripe_webhook_events")
      .update({ ...patch })
      .eq("stripe_event_id", stripeEventId);
    if (error) throw new Error(`stripe_webhook_events update failed: ${error.message}`);
  }

  // -------------------------------------------------------------- payments --

  findPaymentByIntentId(id: string): Promise<PaymentRow | null> {
    return this.findOne("payments", "stripe_payment_intent_id", id) as Promise<PaymentRow | null>;
  }

  findPaymentByChargeId(id: string): Promise<PaymentRow | null> {
    return this.findOne("payments", "stripe_charge_id", id) as Promise<PaymentRow | null>;
  }

  findPaymentBySessionId(id: string): Promise<PaymentRow | null> {
    return this.findOne(
      "payments",
      "stripe_checkout_session_id",
      id,
    ) as Promise<PaymentRow | null>;
  }

  findPaymentByInvoiceId(id: string): Promise<PaymentRow | null> {
    return this.findOne("payments", "stripe_invoice_id", id) as Promise<PaymentRow | null>;
  }

  async insertPayment(row: Omit<PaymentRow, "id">): Promise<PaymentRow> {
    const { result, data } = await this.insertRow("payments", { ...row });
    if (result === "duplicate" || !data) {
      // A concurrent delivery won the insert race; return the winning row.
      const winner = row.stripe_payment_intent_id
        ? await this.findPaymentByIntentId(row.stripe_payment_intent_id)
        : row.stripe_checkout_session_id
        ? await this.findPaymentBySessionId(row.stripe_checkout_session_id)
        : null;
      if (winner) return winner;
      throw new Error("payments insert hit a unique conflict but no winning row found");
    }
    return data as unknown as PaymentRow;
  }

  async updatePayment(id: string, patch: Partial<PaymentRow>): Promise<void> {
    await this.updateRow("payments", id, { ...patch });
  }

  // ---------------------------------------------------------- entitlements --

  findEntitlementByIdempotencyKey(key: string): Promise<EntitlementRow | null> {
    return this.findOne(
      "entitlements",
      "idempotency_key",
      key,
    ) as Promise<EntitlementRow | null>;
  }

  async findEntitlementBySubscriptionId(
    subscriptionId: string,
  ): Promise<EntitlementRow | null> {
    const { data, error } = await this.service
      .from("entitlements")
      .select("*")
      .contains("plan_detail", { stripe_subscription_id: subscriptionId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`entitlements subscription lookup failed: ${error.message}`);
    return (data as EntitlementRow | null) ?? null;
  }

  async findEntitlementsByPaymentId(paymentId: string): Promise<EntitlementRow[]> {
    const { data, error } = await this.service
      .from("entitlements")
      .select("*")
      .eq("payment_id", paymentId);
    if (error) throw new Error(`entitlements by payment failed: ${error.message}`);
    return (data as EntitlementRow[] | null) ?? [];
  }

  async insertEntitlement(row: Omit<EntitlementRow, "id">): Promise<InsertResult> {
    const { result } = await this.insertRow("entitlements", { ...row });
    return result;
  }

  async updateEntitlement(id: string, patch: Partial<EntitlementRow>): Promise<void> {
    await this.updateRow("entitlements", id, { ...patch });
  }

  // --------------------------------------------------------------- refunds --

  findRefundByStripeRefundId(id: string): Promise<RefundRow | null> {
    return this.findOne("refunds", "stripe_refund_id", id) as Promise<RefundRow | null>;
  }

  async insertRefund(row: Omit<RefundRow, "id">): Promise<InsertResult> {
    const { result } = await this.insertRow("refunds", { ...row });
    return result;
  }

  async updateRefund(id: string, patch: Partial<RefundRow>): Promise<void> {
    await this.updateRow("refunds", id, { ...patch });
  }

  // -------------------------------------------------------------- invoices --

  findInvoiceByStripeInvoiceId(id: string): Promise<InvoiceRow | null> {
    return this.findOne("invoices", "stripe_invoice_id", id) as Promise<InvoiceRow | null>;
  }

  async insertInvoice(row: Omit<InvoiceRow, "id">): Promise<InsertResult> {
    const { result } = await this.insertRow("invoices", { ...row });
    return result;
  }

  async updateInvoice(id: string, patch: Partial<InvoiceRow>): Promise<void> {
    await this.updateRow("invoices", id, { ...patch });
  }

  // --------------------------------------------------------------- lookups --

  async findFunnelIdByKey(key: string): Promise<string | null> {
    const row = await this.findOne("money_funnels", "key", key);
    return typeof row?.id === "string" ? row.id : null;
  }

  async findTenantIdForVenue(venueId: string): Promise<string | null> {
    const row = await this.findOne("venues", "id", venueId);
    return typeof row?.tenant_id === "string" ? row.tenant_id : null;
  }

  async recordConnectAccountStatus(
    accountId: string,
    status: Record<string, unknown>,
  ): Promise<number> {
    // venues.metadata carries stripe_account_id (written by stripe-connect).
    // v1 scale is small: scan venue metadata and merge the status in place.
    const { data, error } = await this.service
      .from("venues")
      .select("id, metadata")
      .limit(500);
    if (error) throw new Error(`venues scan for connect status failed: ${error.message}`);
    let updated = 0;
    for (const venue of (data as Row[] | null) ?? []) {
      const metadata = (venue.metadata as Row | null) ?? {};
      if (metadata.stripe_account_id !== accountId) continue;
      const { error: updateError } = await this.service
        .from("venues")
        .update({ metadata: { ...metadata, ...status } })
        .eq("id", String(venue.id));
      if (updateError) {
        throw new Error(`venue connect status update failed: ${updateError.message}`);
      }
      updated++;
    }
    return updated;
  }
}
