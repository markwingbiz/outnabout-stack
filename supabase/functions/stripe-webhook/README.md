# stripe-webhook

The Stripe webhook receiver — the heart of the pay side (STRIPE-PLAN §1d).
All routing/activation logic lives in `../_shared/stripe-processing.ts`;
this folder is only the Deno shell.

What it does:

- Verifies the Stripe signature over the **raw body** before trusting
  anything. Unverified deliveries get HTTP 400 and are never recorded.
- Records every verified event in `stripe_webhook_events`, idempotently —
  a redelivery of an already-processed event is a 200 no-op.
- Routes events:
  - `payment_intent.succeeded` → verifies/creates the `payments` row and
    activates entitlements **exactly once** (AccessPrime: this event is the
    ONLY activation trigger; idempotency key
    `source_event_id + product_key + account_id`).
  - `checkout.session.completed` → records/links the payment as pending;
    activates nothing (cross-check only).
  - `payment_intent.payment_failed` → payment marked failed (never
    regresses a verified payment).
  - `invoice.paid` → payment verified + `invoices` mirror row + the
    subscription entitlement created/renewed (grace cleared).
  - `invoice.payment_failed` → entitlement enters the decided 7-day grace
    (features stay on).
  - `customer.subscription.deleted` → entitlement expires at period end
    (or immediately if already ended).
  - `charge.refunded` / `refund.updated` → `refunds` row + access adjusted
    per the refund templates, exactly once (settlement adjustment computed
    deterministically from stored figures; an organizer-cancelled full
    refund returns the Bownd fee, Stripe's processing fee is never
    returned by Stripe and lands in the settlement adjustment).
  - `charge.dispute.*` → payment frozen out of verified revenue + flagged.
  - `account.updated` → Connect status mirrored onto the venue's metadata.
  - Payout/subscription admin events → recorded as signals only.
- Amounts come only from event payloads + the locked catalog
  (`../_shared/stripe-core.ts`). Integer cents everywhere, no judgment.
- Test mode only (v1): livemode events are recorded and ignored; a live
  secret key is refused by the API layer.

## Secrets (function secrets — never in code)

- `STRIPE_WEBHOOK_SECRET` — endpoint signing secret, set after the
  endpoint is registered in the Stripe Dashboard.
- `STRIPE_SECRET_KEY` — test-mode secret key (`sk_test_...`), used only
  for read-back retrieves (invoice/subscription binding resolution).

Missing either → HTTP 500 naming the secret, nothing processed.

## Deploy

Stripe sends no Supabase JWT, so this one function deploys with
`--no-verify-jwt` — the Stripe signature IS the authentication here:

```sh
supabase functions deploy stripe-webhook --no-verify-jwt
```

Register the deployed URL as a webhook endpoint in the Stripe Dashboard
(test mode) for: `payment_intent.succeeded`, `payment_intent.payment_failed`,
`checkout.session.completed`, `charge.refunded`, `refund.updated`,
`charge.dispute.created`, `charge.dispute.closed`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`account.updated`, `payout.paid`, `payout.failed`.

Local proof: `tools/stripe-harness/` (in-memory DB + fake Stripe API +
HMAC-signed simulated events; `node run.ts`).
