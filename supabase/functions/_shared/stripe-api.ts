// _shared/stripe-api.ts — Minimal Stripe REST client (plain fetch).
//
// Same philosophy as bownd-sync's Firebase access: no vendor SDK, plain
// HTTPS form-encoded calls, so the code runs identically on the Deno Edge
// runtime and under the local harness (which substitutes a fake implementing
// the same interface). The secret key is passed IN by the caller from
// function secrets (STRIPE_SECRET_KEY) — never read from env here, never
// logged, never committed. Test mode only for v1: callers must pass a
// sk_test_ key; `assertTestKey` enforces it before any call is made.

export interface StripeObject {
  id: string;
  object?: string;
  livemode?: boolean;
  metadata?: Record<string, string>;
  [key: string]: unknown;
}

export interface StripeApi {
  retrievePaymentIntent(id: string): Promise<StripeObject | null>;
  retrieveInvoice(id: string): Promise<StripeObject | null>;
  retrieveSubscription(id: string): Promise<StripeObject | null>;
  retrieveAccount(id: string): Promise<StripeObject | null>;
  createAccount(params: Record<string, unknown>): Promise<StripeObject>;
  createAccountLink(params: Record<string, unknown>): Promise<StripeObject>;
  listProducts(params: Record<string, string>): Promise<StripeObject[]>;
  createProduct(params: Record<string, unknown>): Promise<StripeObject>;
  listPrices(params: Record<string, string>): Promise<StripeObject[]>;
  createPrice(params: Record<string, unknown>): Promise<StripeObject>;
  createPaymentLink(params: Record<string, unknown>): Promise<StripeObject>;
}

/** v1 is test-mode only (Mark's order): refuse a live key loudly. */
export function assertTestKey(secretKey: string): void {
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_SECRET_KEY is not a test-mode key (sk_test_...). The pay-side v1 build is test-mode only; live keys are refused.",
    );
  }
}

// ------------------------------------------------------- form encoding -----

/** Stripe-style bracket form encoding: {a:{b:1}, c:[{d:2}]} → a[b]=1, c[0][d]=2. */
export function formEncode(params: Record<string, unknown>): URLSearchParams {
  const out = new URLSearchParams();
  const walk = (prefix: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(`${prefix}[${i}]`, item));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(`${prefix}[${k}]`, v);
      }
      return;
    }
    out.append(prefix, String(value));
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out;
}

// ------------------------------------------------------------- fetch impl --

export class FetchStripeApi implements StripeApi {
  private baseUrl: string;
  private secretKey: string;

  constructor(secretKey: string, baseUrl = "https://api.stripe.com/v1") {
    assertTestKey(secretKey);
    this.secretKey = secretKey;
    this.baseUrl = baseUrl;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    params?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<StripeObject> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
    };
    let url = `${this.baseUrl}${path}`;
    let body: string | undefined;
    if (method === "GET") {
      if (params) {
        const qs = formEncode(params).toString();
        if (qs) url += `?${qs}`;
      }
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = params ? formEncode(params).toString() : "";
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new Error(`Stripe ${method} ${path} returned non-JSON (HTTP ${res.status})`);
    }
    if (!res.ok) {
      const err = (parsed.error as Record<string, unknown> | undefined) ?? {};
      throw new Error(
        `Stripe ${method} ${path} failed (HTTP ${res.status}): ${String(err.message ?? "unknown error")}`,
      );
    }
    return parsed as StripeObject;
  }

  private async getOrNull(path: string): Promise<StripeObject | null> {
    try {
      return await this.request("GET", path);
    } catch (err) {
      if (err instanceof Error && err.message.includes("HTTP 404")) return null;
      throw err;
    }
  }

  retrievePaymentIntent(id: string): Promise<StripeObject | null> {
    return this.getOrNull(`/payment_intents/${encodeURIComponent(id)}`);
  }

  retrieveInvoice(id: string): Promise<StripeObject | null> {
    return this.getOrNull(`/invoices/${encodeURIComponent(id)}`);
  }

  retrieveSubscription(id: string): Promise<StripeObject | null> {
    return this.getOrNull(`/subscriptions/${encodeURIComponent(id)}`);
  }

  retrieveAccount(id: string): Promise<StripeObject | null> {
    return this.getOrNull(`/accounts/${encodeURIComponent(id)}`);
  }

  createAccount(params: Record<string, unknown>): Promise<StripeObject> {
    const tenant = String((params.metadata as Record<string, unknown> | undefined)?.tenant_id ?? "");
    return this.request("POST", "/accounts", params, tenant ? `connect-account:${tenant}` : undefined);
  }

  createAccountLink(params: Record<string, unknown>): Promise<StripeObject> {
    return this.request("POST", "/account_links", params);
  }

  async listProducts(params: Record<string, string>): Promise<StripeObject[]> {
    const page = await this.request("GET", "/products", { ...params });
    return (page.data as StripeObject[] | undefined) ?? [];
  }

  createProduct(params: Record<string, unknown>): Promise<StripeObject> {
    const key = String((params.metadata as Record<string, unknown> | undefined)?.product_key ?? "");
    return this.request("POST", "/products", params, key ? `product:${key}` : undefined);
  }

  async listPrices(params: Record<string, string>): Promise<StripeObject[]> {
    const page = await this.request("GET", "/prices", { ...params });
    return (page.data as StripeObject[] | undefined) ?? [];
  }

  createPrice(params: Record<string, unknown>): Promise<StripeObject> {
    const product = String(params.product ?? "");
    const amount = String(params.unit_amount ?? "");
    const interval = String(
      (params.recurring as Record<string, unknown> | undefined)?.interval ?? "once",
    );
    return this.request(
      "POST",
      "/prices",
      params,
      product ? `price:${product}:${amount}:${interval}` : undefined,
    );
  }

  createPaymentLink(params: Record<string, unknown>): Promise<StripeObject> {
    const meta = (params.metadata as Record<string, string> | undefined) ?? {};
    const key = meta.product_key && meta.account_id
      ? `payment-link:${meta.product_key}:${meta.account_id}`
      : undefined;
    return this.request("POST", "/payment_links", params, key);
  }
}
