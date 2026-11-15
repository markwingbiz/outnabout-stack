// fake-stripe.ts — In-memory StripeApi for the harness. Serves canned
// PaymentIntents / invoices / subscriptions and records every call, so
// tests can prove exactly which read-backs the processor performed.
// Write methods (products/prices/links/accounts) throw — the webhook path
// must never call them.

import type {
  StripeApi,
  StripeObject,
} from "../../supabase/functions/_shared/stripe-api.ts";

export class FakeStripe implements StripeApi {
  paymentIntents = new Map<string, StripeObject>();
  invoices = new Map<string, StripeObject>();
  subscriptions = new Map<string, StripeObject>();
  accounts = new Map<string, StripeObject>();
  calls: string[] = [];

  retrievePaymentIntent(id: string): Promise<StripeObject | null> {
    this.calls.push(`retrievePaymentIntent:${id}`);
    return Promise.resolve(this.paymentIntents.get(id) ?? null);
  }

  retrieveInvoice(id: string): Promise<StripeObject | null> {
    this.calls.push(`retrieveInvoice:${id}`);
    return Promise.resolve(this.invoices.get(id) ?? null);
  }

  retrieveSubscription(id: string): Promise<StripeObject | null> {
    this.calls.push(`retrieveSubscription:${id}`);
    return Promise.resolve(this.subscriptions.get(id) ?? null);
  }

  retrieveAccount(id: string): Promise<StripeObject | null> {
    this.calls.push(`retrieveAccount:${id}`);
    return Promise.resolve(this.accounts.get(id) ?? null);
  }

  createAccount(): Promise<StripeObject> {
    throw new Error("createAccount must not be called by the webhook path");
  }

  createAccountLink(): Promise<StripeObject> {
    throw new Error("createAccountLink must not be called by the webhook path");
  }

  listProducts(): Promise<StripeObject[]> {
    throw new Error("listProducts must not be called by the webhook path");
  }

  createProduct(): Promise<StripeObject> {
    throw new Error("createProduct must not be called by the webhook path");
  }

  listPrices(): Promise<StripeObject[]> {
    throw new Error("listPrices must not be called by the webhook path");
  }

  createPrice(): Promise<StripeObject> {
    throw new Error("createPrice must not be called by the webhook path");
  }

  createPaymentLink(): Promise<StripeObject> {
    throw new Error("createPaymentLink must not be called by the webhook path");
  }
}
