// stripe-payment-links — Payment Links v1 for the NYE packages
// (STRIPE-PLAN §1a Path B: "a link works before the full app checkout does").
//
// POST (operator only — forge_operator, same guard as bownd-sync):
//   { product_key, account_id, tenant_id?, venue_id?, event_id? }
// → { url, payment_link_id, product_key, amount_cents, mode }
//
// Creates (or reuses) the Stripe Product + Price for the catalog key from
// ../_shared/stripe-core.ts PRODUCT_CATALOG, then a Payment Link carrying
// the binding metadata in THREE places: the link itself, and — the one the
// webhook actually keys on — payment_intent_data (one-time) or
// subscription_data (recurring). When the buyer pays, stripe-webhook
// verifies the payment and AccessPrime activates the entitlement exactly
// once. The price ALWAYS comes from the locked catalog, never from the
// request.
//
// Catalog (locked Master Offer Template / product-funnel map):
//   placement_spotlight_event_campaign — $299/mo — funnel f1
//   pkg_event_launch                   — $249    — funnel f1
//   pkg_major_event_partner            — $599    — funnel f1
//
// SECRET: STRIPE_SECRET_KEY — test mode (sk_test_...) for v1; the API
// layer refuses live keys outright. Missing → 500 naming it, nothing done.

import {
  handleRequest,
  HttpError,
  jsonResponse,
  parseJsonBody,
  requireOperator,
} from "../_shared/helpers.ts";
import { FetchStripeApi } from "../_shared/stripe-api.ts";
import { PRODUCT_CATALOG } from "../_shared/stripe-core.ts";

Deno.serve((req: Request) =>
  handleRequest(req, async () => {
    const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!secretKey) throw new HttpError(500, "Missing secret STRIPE_SECRET_KEY");
    await requireOperator(req);
    const body = await parseJsonBody(req);

    const productKey = typeof body.product_key === "string" ? body.product_key : "";
    const entry = PRODUCT_CATALOG[productKey];
    if (!entry) {
      throw new HttpError(
        400,
        `unknown product_key '${productKey}' (catalog: ${Object.keys(PRODUCT_CATALOG).join(", ")})`,
      );
    }
    const accountId = typeof body.account_id === "string" ? body.account_id : "";
    if (!accountId) throw new HttpError(400, "account_id is required (the buyer account the entitlement grants to)");

    const stripe = new FetchStripeApi(secretKey);

    // Product: find by catalog metadata or create once.
    let product = (await stripe.listProducts({ active: "true", limit: "100" }))
      .find((p) => {
        const meta = (p.metadata as Record<string, unknown> | undefined) ?? {};
        return meta.product_key === productKey;
      }) ?? null;
    if (!product) {
      product = await stripe.createProduct({
        name: entry.name,
        metadata: { product_key: productKey, funnel: entry.funnel_key },
      });
    }

    // Price: find the exact catalog amount/interval or create once.
    const prices = await stripe.listPrices({
      product: product.id,
      active: "true",
      limit: "100",
      ...(entry.mode === "subscription" ? { type: "recurring" } : { type: "one_time" }),
    });
    let price = prices.find((p) => {
      if (p.unit_amount !== entry.amount_cents) return false;
      if (entry.mode === "subscription") {
        const recurring = p.recurring as { interval?: string } | undefined;
        return recurring?.interval === entry.interval;
      }
      return true;
    }) ?? null;
    if (!price) {
      price = await stripe.createPrice({
        product: product.id,
        unit_amount: entry.amount_cents,
        currency: "usd",
        ...(entry.mode === "subscription"
          ? { recurring: { interval: entry.interval ?? "month" } }
          : {}),
        metadata: { product_key: productKey },
      });
    }

    const binding: Record<string, string> = {
      product_key: productKey,
      funnel: entry.funnel_key,
      account_id: accountId,
      account_scope: "venue",
    };
    if (typeof body.tenant_id === "string" && body.tenant_id) binding.tenant_id = body.tenant_id;
    if (typeof body.venue_id === "string" && body.venue_id) binding.venue_id = body.venue_id;
    if (typeof body.event_id === "string" && body.event_id) binding.event_id = body.event_id;

    const link = await stripe.createPaymentLink({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: binding,
      ...(entry.mode === "subscription"
        ? { subscription_data: { metadata: binding } }
        : { payment_intent_data: { metadata: binding } }),
    });

    return jsonResponse({
      url: typeof link.url === "string" ? link.url : null,
      payment_link_id: link.id,
      product_key: productKey,
      amount_cents: entry.amount_cents,
      mode: entry.mode,
      interval: entry.interval ?? null,
      funnel: entry.funnel_key,
    });
  })
);
