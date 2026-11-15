# stripe-connect

Venue Stripe Connect **Express** onboarding (STRIPE-PLAN §1b).

`POST { action: 'onboard' | 'link' | 'status', venue_id, tenant_id?,
refresh_url?, return_url? }`

- **Auth:** signed-in user who is a `forge_operator` OR a member of the
  venue's tenant (`tenant_users`) — same JWT verification as the other
  functions. A venue never gets an account for a tenant it isn't in.
- **Verification gate:** venue users can only onboard after the venue is
  `verified` (manual review v1). Operators bypass the gate for test venues
  during setup.
- `onboard` creates the Express account if the venue has none (or reuses
  `venues.metadata.stripe_account_id`), persists the account id on the
  venue's metadata, and returns a fresh hosted onboarding URL. Stripe
  collects KYC + payout bank details — Bownd never sees them.
- `link` returns a fresh onboarding/account link for the existing account.
- `status` reads the account back and mirrors `charges_enabled`,
  `payouts_enabled`, `details_submitted`, and outstanding requirements
  onto the venue's metadata; `account.updated` webhooks keep it current.

Charges run as destination charges on the venue's account; platform
processing is absorbed in venue settlement (pay-logic spec).

## Secrets

- `STRIPE_SECRET_KEY` — test mode (`sk_test_...`) for v1. Missing → 500
  naming it, nothing done.

## Deploy

```sh
supabase functions deploy stripe-connect
```
