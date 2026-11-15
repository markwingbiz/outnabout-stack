# stripe-payment-links

Payment Links v1 for the NYE packages (STRIPE-PLAN §1a Path B — a link
works before the full in-app checkout does).

`POST { product_key, account_id, tenant_id?, venue_id?, event_id? }`
(**operator only** — `forge_operator`, same guard as bownd-sync)

- Finds-or-creates the Stripe Product + Price for the catalog key, then
  mints a Payment Link. The price ALWAYS comes from the locked catalog in
  `../_shared/stripe-core.ts` — never from the request.
- The binding metadata `{product_key, funnel, account_id, account_scope,
  tenant_id, venue_id}` is stamped in three places: the link,
  `payment_intent_data` (one-time) or `subscription_data` (recurring).
  When the buyer pays, `stripe-webhook` verifies the payment and activates
  the entitlement exactly once.
- Catalog (locked Master Offer Template / product-funnel map):

  | product_key | price | funnel |
  | --- | --- | --- |
  | `placement_spotlight_event_campaign` | $299/mo | f1 |
  | `pkg_event_launch` | $249 | f1 |
  | `pkg_major_event_partner` | $599 | f1 |
  | `venue_featured` | $25/mo | f2 |
  | `venue_pro` | $99/mo | f2 |

Returns `{ url, payment_link_id, product_key, amount_cents, mode, funnel }`.

## Secrets

- `STRIPE_SECRET_KEY` — test mode (`sk_test_...`) for v1; the API layer
  refuses live keys outright. Missing → 500 naming it, nothing done.

## Deploy

```sh
supabase functions deploy stripe-payment-links
```
