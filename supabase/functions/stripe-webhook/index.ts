// stripe-webhook — the Stripe webhook receiver (STRIPE-PLAN §1d, the heart
// of the pay side). Routing/activation logic lives in
// ../_shared/stripe-processing.ts; this file is only the Deno shell.
//
// AUTH MODEL: Stripe calls this endpoint directly — there is no Supabase
// JWT. Deploy with --no-verify-jwt; the Stripe signature (verified over the
// RAW body against STRIPE_WEBHOOK_SECRET before anything is trusted) is the
// authentication. Unverified deliveries get a 400, are logged, and are
// never recorded or processed.
//
// SECRETS (function secrets only — never in code, never in chat):
//   STRIPE_WEBHOOK_SECRET — the endpoint signing secret (whsec_...), set
//     after Mark registers the endpoint in the Stripe Dashboard.
//   STRIPE_SECRET_KEY — test-mode secret key (sk_test_...), used only for
//     read-back retrieves (invoice/subscription binding resolution).
// If either is missing the function returns a 500 naming the missing secret
// and does nothing (bownd-sync convention).
//
// Test mode only (v1): a live key is refused by FetchStripeApi, and
// livemode events are recorded + ignored by the processor.

import { getClients } from "../_shared/helpers.ts";
import { FetchStripeApi } from "../_shared/stripe-api.ts";
import { SupabasePaymentsDb } from "../_shared/supabase-payments-db.ts";
import { handleStripeWebhookRequest } from "../_shared/stripe-processing.ts";

function missingSecret(name: string): Response {
  console.error(`stripe-webhook: missing required secret ${name}`);
  return new Response(
    JSON.stringify({ error: `missing_secret`, secret: name }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req: Request): Promise<Response> => {
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) return missingSecret("STRIPE_WEBHOOK_SECRET");
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) return missingSecret("STRIPE_SECRET_KEY");
  try {
    const { service } = getClients();
    const db = new SupabasePaymentsDb(service);
    const stripe = new FetchStripeApi(secretKey);
    return await handleStripeWebhookRequest(req, {
      secret: webhookSecret,
      db,
      stripe,
    });
  } catch (err) {
    console.error("stripe-webhook: setup failed:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
