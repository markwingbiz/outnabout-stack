# bownd-sync — Bownd ↔ Supabase bridge (Phase B)

Two directions, one function. Nothing here runs until Mark provides the
Firebase service account (see below).

## What it does

**`publish` (Supabase → Firestore)** — drains the
`bownd_publish_requests` outbox. For each `status = 'pending'` row it
validates the referenced Supabase venue/event row, writes it to the
Firestore `events` or `venues` collection (set-with-merge on the stored
doc ref, or create + store the new ref), marks the request `'done'`
(or `'failed'` with the error), and writes one `forge_audit_log` row.
Only publishes rows that exist in Supabase — it never invents
venue/event data.

**`mirror` (Firestore → Supabase)** — reads Firestore `events` /
`venues` / `redemptions` changed since the per-collection watermark in
`bownd_mirror_state`, upserts them into Supabase (`events`, `venues`,
`venue_redemptions`), advances the watermark, and writes one audit row
per collection per run. Dedupe: events/venues on
`source_ref = 'bownd:<firestore-doc-id>'`; redemptions on
`metadata.bownd_token = <firestore-doc-id>` (a redemption is never
mirrored twice). Never deletes Supabase rows. Docs missing expected
fields are skipped and recorded — the batch never crashes on one bad
doc.

## Prerequisite: the Firebase service account (Mark provides it)

This function **cannot run** until the service account is set. The value
is a JSON string. It goes in a **terminal prompt / `.env`**, never in
chat:

```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='PASTE_JSON_HERE'
```

(Paste the JSON with no brackets, no quotes around it, no spaces around
`=` — the same placeholder rule as everywhere else. The Supabase CLI
reads the value from the terminal, not from chat.)

Without it, every call returns HTTP 500 naming the missing secret
`FIREBASE_SERVICE_ACCOUNT_JSON` and does nothing.

## Deploy

```bash
supabase functions deploy bownd-sync
```

Deploy with the plain command — do **not** use `--no-verify-jwt`. The
function verifies the caller's Supabase Auth JWT itself and requires
the `forge_operator` role (admin counts), same as the Phase A
functions. `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` are auto-provided.

## Curl examples

```bash
# Publish pending outbox rows (default batch 25, max 100 via limit)
curl -X POST "$SUPABASE_URL/functions/v1/bownd-sync" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"direction":"publish","limit":25}'

# Mirror all three collections
curl -X POST "$SUPABASE_URL/functions/v1/bownd-sync" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"direction":"mirror"}'

# Mirror one collection
curl -X POST "$SUPABASE_URL/functions/v1/bownd-sync" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"direction":"mirror","collections":["redemptions"]}'
```

`$USER_JWT` is the caller's Supabase Auth JWT (from a signed-in
Livework+ / Forge UI session). Scheduling via `pg_cron` (e.g. mirror
every 5 min) is a separate Mark-approved step — nothing in this
function schedules itself.

## Tenant-mapping rule (hard, never guessed)

- **Publish:** the Supabase row's `tenant_id` is looked up in
  `bownd_tenant_map` (tenant_id → bownd_ref). The published Firestore
  doc carries `tenantRef` + `tenantId` so the mirror can map it back.
  If **no mapping row exists** for that tenant, the request FAILS with
  `no_bownd_tenant_mapping` and the audit log records it. The function
  never invents a mapping.
- **Mirror:** the Firestore doc's `tenantRef` (if present), then
  `event:<id>` / `venue:<venueId>` (events), `venue:<id>` (venues),
  `redemption:<token>` / `event:<experienceId>` (redemptions) are
  looked up in `bownd_tenant_map`. No mapping → the doc is skipped
  with reason `no_bownd_tenant_mapping` and retried on the next run
  (its id is kept in the watermark's pending list).
- **Missing mapping escalation:** Forge escalates a missing mapping
  via a GitHub issue (forge-github → Muse → Mark). This function does
  NOT create GitHub issues. The real Bownd tenant mapping is
  established at Bownd launch — never inferred from the placeholder
  tenant rows.

## Idempotency / dedupe guarantees

- Publish: only `status = 'pending'` rows are selected. The Firestore
  write is set-with-merge on the stored `bownd_event_ref` /
  `bownd_venue_ref`, so re-processing the same request produces the
  same doc, never a duplicate. A request already marked `'done'` is
  never re-processed.
- Mirror: events/venues upsert via read-then-write on `source_ref`
  (no unique-index assumption). Redemptions check
  `metadata->>bownd_token` before inserting. The watermark
  (`bownd_mirror_state.last_seen_update_at`) advances past everything
  processed each run; docs that failed/skipped-for-mapping are kept in
  `last_error`'s `unresolved` list (JSON: `{error, unresolved: [...]}`)
  and retried next run. Re-running a mirror never duplicates rows.
- Redemptions: only `status = 'REDEEMED'` tokens mirror. `NEW` /
  `EXPIRED` tokens are counted as skipped (`not_redeemed`), not errors.
  No `revenue_events` rows are created — redemptions carry no price,
  and this function never invents one.

## Deviations from FORGE-DESIGN.md §7

- Publish terminal status is `'done'` (task spec), not `'published'`
  (design doc). Failed requests are marked `'failed'` immediately —
  the design doc's retry-up-to-5 is NOT implemented; a failed publish
  needs a new request (or an operator resetting the row to `'pending'`).
- Mirror writes **one audit row per collection per run** (summary
  counts + failed docs), not one row per mirrored doc — per-doc audit
  rows would flood the log on a 5-minute cron. Publish still writes
  one audit row per request (low volume).
- Watermark `last_error` is JSON (`{error, unresolved: [...]}`), not a
  plain string, so pending retries survive across runs.

## Schema assumptions (NOT verified against the live DB)

This task forbids DB access, so these were taken from the design doc +
Livework's add-event insert + the Phase A migration, and the code is
written to survive them being wrong:

- `bownd_publish_requests`: `id, status, venue_id, event_id,
  bownd_venue_ref, bownd_event_ref, idempotency_key, metadata`. The
  code only **writes** `status` + `bownd_*_ref` (+ a best-effort
  `metadata` error note), so a missing column there cannot break the
  publish path.
- Supabase `events`: `title, description, start_ts, price_label,
  event_type, status, source_ref, tenant_id` (+ `venue_id`). Writes
  go through a tolerant writer: if PostgREST rejects a column as
  unknown, that column is dropped from the payload and the write is
  retried (up to 6 fallbacks).
- Supabase `venues`: only `id, name, source_ref, tenant_id` are
  written. Firestore `lat`/`lng` are preserved in `metadata`, not
  written to columns (lat/lng columns unverified).
- `venue_redemptions`: `redemption_type, customer_ref, metadata,
  tenant_id` (design §7.2 only).
- `events.source_ref` is NOT assumed unique — upserts use
  read-then-write, never `onConflict`.
- Firestore docs are listed via the Admin SDK and filtered on server
  `updateTime` metadata — no doc-field timestamp is required.

## Caveats

- **Not type-checked, not live-tested.** No Deno here; run
  `deno check` / deploy to a dev project and watch the first live
  publish + mirror before trusting it on real data.
- **firebase-admin via `npm:firebase-admin@12.7.0`.** The Supabase
  Edge Functions runtime supports `npm:` imports. If the deploy
  fails on the npm import, the fallback is the Firestore REST API +
  manual OAuth (not implemented here) — report the deploy error
  rather than working around it silently.
- **Cold start:** firebase-admin is heavy; the first invocation
  after deploy will be slow. That is expected, not an error.
- **Unit rule:** this function creates no `revenue_events` rows.
  `revenue_events.amount` is DOLLARS; `money_funnels *_cents` are
  CENTS — nothing here converts between them.
