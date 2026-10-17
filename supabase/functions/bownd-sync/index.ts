// bownd-sync — Bownd <-> Supabase bridge (Phase B).
//
// POST { direction: 'publish' | 'mirror', limit?, collections? }
//
// 'publish' (Supabase -> Firestore): processes pending rows in
//   bownd_publish_requests. Validates the referenced Supabase venue/event,
//   writes it to Firestore (events or venues), marks the request 'done'
//   (or 'failed' with the error), writes one forge_audit_log row per
//   request. Idempotent: only status='pending' rows are selected, and the
//   Firestore write is set-with-merge on the stored doc ref (re-publishing
//   the same request produces the same doc, never a duplicate).
//
// 'mirror' (Firestore -> Supabase): lists Firestore events / venues /
//   redemptions changed since the per-collection watermark in
//   bownd_mirror_state, upserts them into Supabase, advances the watermark,
//   writes one audit row per collection per run. Idempotent: events/venues
//   dedupe on source_ref = 'bownd:<firestore-doc-id>'; redemptions dedupe
//   on metadata.bownd_token = the Firestore doc id. Never deletes Supabase
//   rows. Docs missing expected fields are skipped and recorded.
//
// TENANT RULE (hard): the function NEVER guesses a tenant mapping. Publish
//   looks up the Supabase row's tenant_id in bownd_tenant_map; mirror looks
//   up the Firestore doc's tenantRef / event / venue refs in
//   bownd_tenant_map. If no mapping row exists, the request/row FAILS (or is
//   skipped) with 'no_bownd_tenant_mapping' and the audit log records it.
//   Forge escalates a missing mapping via a GitHub issue (forge-github) —
//   this function does NOT create GitHub issues. The real Bownd tenant
//   mapping is established at Bownd launch, never inferred from the
//   placeholder tenant rows.
//
// FIREBASE: uses the Firebase Admin SDK (npm:firebase-admin) with the
//   service account from env FIREBASE_SERVICE_ACCOUNT_JSON (a JSON string).
//   If the env var is missing or invalid, the function returns a 500 naming
//   the missing secret and does nothing. The Admin SDK bypasses Firestore
//   security rules (service identity) — this is why client writes to
//   events/venues are denied in firestore.rules while this function can
//   still write the catalog.
//
// DEVIATIONS FROM FORGE-DESIGN.md §7 (task spec wins):
//   - Publish request terminal status in the DB is 'published' — the
//     live CHECK constraint on bownd_publish_requests.status only allows
//     ('pending','processing','published','failed','cancelled'), so the
//     old task-spec value 'done' would fail the update and leave every
//     request stuck 'pending' (re-processed forever, duplicating
//     Firestore docs). The API response still reports status 'done'
//     for a completed publish; only the DB write uses 'published'.
//   - Failed requests are marked 'failed' immediately (task spec) — the design doc's retry-up-to-5 is NOT
//     implemented; a failed publish needs a new request (or a manual
//     status reset to 'pending' by an operator).
//
// SCHEMA ASSUMPTIONS (NOT verified against the live DB — this task forbids
//   DB access; confirm on first live run):
//   - bownd_publish_requests: id, status, venue_id (uuid), event_id (uuid),
//     bownd_venue_ref, bownd_event_ref, idempotency_key, metadata (from
//     design §7.3 + Phase A migration). This code only WRITES status +
//     bownd_*_ref (plus a best-effort metadata error note), and reads '*'
//     defensively, so extra/missing read columns cannot break it.
//   - Supabase events: title, description, start_ts, price_label,
//     event_type, status, source_ref, tenant_id. The first six come from
//     Livework's add-event insert; source_ref from the design; tenant_id
//     is assumed (tenant-scoped policies exist).
//   - Supabase venues: only id, name, source_ref, tenant_id are written.
//     Firestore lat/lng are written to the venues.lat / venues.lng columns
//     (verified to exist as double precision) and kept in metadata.
//   - venue_redemptions: redemption_type, customer_ref, metadata,
//     tenant_id (design §7.2 only).
//   - events.source_ref is NOT assumed unique — upserts use read-then-
//     write, never onConflict.
//   - Firestore docs carry server updateTime metadata (used for the
//     watermark); no doc-field timestamp is required.
//
// UNIT RULE: revenue_events.amount is DOLLARS; money_funnels *_cents are
//   CENTS. This function creates NO revenue_events rows (redemptions carry
//   no price — do not invent one, per design §7.2).
//
// No LLM calls. No external sends. No fake data. No secrets in code.

import admin from "npm:firebase-admin@12.7.0";

import {
  HttpError,
  handleRequest,
  jsonResponse,
  parseJsonBody,
  requireOperator,
  type SupabaseClient,
} from "../_shared/helpers.ts";

// ------------------------------------------------------------------ config --

const FIRESTORE_PROJECT_ID_FALLBACK = "outnabout1-c30ef";
const MIRROR_COLLECTIONS = ["events", "venues", "redemptions"] as const;
type MirrorCollection = (typeof MIRROR_COLLECTIONS)[number];
const MAX_PUBLISH_BATCH = 25;
const MAX_PUBLISH_LIMIT = 100;
const MAX_COLUMN_RETRIES = 6;
const MAX_PENDING_DOCS = 100;

// ------------------------------------------------------- Firebase Admin ----

// Minimal structural types for the Admin SDK surface we use. The `any`
// casts live only at this Firebase boundary; everything above it is typed.
type FirestoreDb = ReturnType<typeof admin.firestore>;

interface FirestoreDoc {
  id: string;
  updateTimeMillis: number;
  data: Record<string, unknown>;
}

/** Firestore Timestamp / Date / number / ISO string -> epoch millis. */
function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value != null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.toMillis === "function") return Number((obj.toMillis as () => number).call(obj));
    if (typeof obj.seconds === "number") {
      return obj.seconds * 1000 + Math.floor(Number(obj.nanoseconds ?? 0) / 1_000_000);
    }
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Test-flag read: a Supabase row is a test row when its `is_test` column
 * is true (if the column exists — see the optional migration) OR when
 * `metadata.is_test` is true. The flag rides in `metadata` today, so no
 * migration is required for the flag to flow. Mirrored rows carry the
 * flag the same way.
 */
function rowIsTest(row: Record<string, unknown>): boolean {
  if (row.is_test === true) return true;
  return asRecord(row.metadata).is_test === true;
}

/**
 * Firebase Admin SDK client. Throws HttpError(500) naming the missing
 * secret when FIREBASE_SERVICE_ACCOUNT_JSON is absent or invalid — the
 * function does nothing without it.
 */
function getFirestore(): FirestoreDb {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    throw new HttpError(
      500,
      "Missing secret FIREBASE_SERVICE_ACCOUNT_JSON: the Firebase service-account JSON has not been set for this function. Set it with: supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON=... (value from a terminal prompt / .env, never in chat).",
    );
  }
  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new HttpError(500, "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      projectId: String(serviceAccount.project_id ?? FIRESTORE_PROJECT_ID_FALLBACK),
    });
  }
  return admin.firestore();
}

// ------------------------------------------------------------------ Audit ---

// forge_audit_log.entity_id is uuid NOT NULL and entity_type is free text.
// We write audit rows directly (not via helpers.writeAudit, whose
// entity_type union does not cover sync entities). Audit failures are
// logged, never fatal — the sync result is the source of truth; a failed
// audit write must not roll back a completed sync step.
async function safeAudit(
  service: SupabaseClient,
  entry: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await service.from("forge_audit_log").insert({
      actor_user_id: entry.actorUserId,
      actor_type: "forge",
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      before: entry.before ?? {},
      after: entry.after ?? {},
      metadata: entry.metadata ?? {},
    });
    if (error) console.error("bownd-sync audit insert failed:", error);
  } catch (err) {
    console.error("bownd-sync audit insert threw:", err);
  }
}

// ----------------------------------------------------------------- Tenant ---

/** bownd_ref -> Supabase tenant_id, from bownd_tenant_map. Null = no mapping. */
async function lookupTenantForBowndRef(
  service: SupabaseClient,
  bowndRef: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("bownd_tenant_map")
    .select("tenant_id")
    .eq("bownd_ref", bowndRef)
    .maybeSingle();
  if (error) throw new Error(`bownd_tenant_map lookup failed: ${error.message}`);
  return data ? String((data as Record<string, unknown>).tenant_id) : null;
}

/** Supabase tenant_id -> first bownd_ref in bownd_tenant_map. Null = no mapping. */
async function lookupBowndRefForTenant(
  service: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("bownd_tenant_map")
    .select("bownd_ref")
    .eq("tenant_id", tenantId)
    .order("bownd_ref", { ascending: true })
    .limit(1);
  if (error) throw new Error(`bownd_tenant_map reverse lookup failed: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.length > 0 ? String(rows[0].bownd_ref) : null;
}

/**
 * Resolve a tenant for a Firestore doc. Candidates are tried in order;
 * the first mapping that exists wins. Returns null when NOTHING maps —
 * the caller must then skip/fail with 'no_bownd_tenant_mapping'. Never
 * invents a mapping.
 */
async function resolveTenantForDoc(
  service: SupabaseClient,
  candidates: string[],
): Promise<{ tenantId: string | null; matchedRef: string | null }> {
  for (const ref of candidates) {
    const tenantId = await lookupTenantForBowndRef(service, ref);
    if (tenantId) return { tenantId, matchedRef: ref };
  }
  return { tenantId: null, matchedRef: null };
}

// ------------------------------------------------------- Tolerant writes ---

// PostgREST error when a column does not exist in the schema cache:
// "Could not find the 'foo' column of 'events' in the schema cache".
const MISSING_COLUMN_RE = /Could not find the '([^']+)' column/;

/**
 * Attempt a write; if PostgREST rejects it for a missing column, drop
 * that column from the payload and retry (up to MAX_COLUMN_RETRIES).
 * Makes the sync resilient to unverified column assumptions: a column
 * that does not exist is omitted, not fatal. Throws on any other error.
 */
async function tolerantWrite<T>(
  attempt: (row: Record<string, unknown>) => Promise<{ data: T | null; error: { message: string } | null }>,
  row: Record<string, unknown>,
): Promise<T | null> {
  const working = { ...row };
  for (let i = 0; i < MAX_COLUMN_RETRIES; i++) {
    const { data, error } = await attempt(working);
    if (!error) return data;
    const match = MISSING_COLUMN_RE.exec(error.message);
    if (!match) throw new Error(`Supabase write failed: ${error.message}`);
    console.error(`bownd-sync: dropping unknown column '${match[1]}' from payload and retrying`);
    delete working[match[1]];
  }
  throw new Error(`Supabase write failed after ${MAX_COLUMN_RETRIES} column fallbacks`);
}

async function insertRow(
  service: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  return await tolerantWrite((r) =>
    service.from(table).insert(r).select("id").single().then((res) => ({
      data: res.data as Record<string, unknown> | null,
      error: res.error,
    })), row);
}

async function updateRowById(
  service: SupabaseClient,
  table: string,
  id: string,
  row: Record<string, unknown>,
): Promise<void> {
  await tolerantWrite((r) =>
    service.from(table).update(r).eq("id", id).then((res) => ({
      data: null,
      error: res.error,
    })), row);
}

/** Read-then-write upsert on source_ref. Never relies on a unique index. */
async function upsertBySourceRef(
  service: SupabaseClient,
  table: string,
  sourceRef: string,
  row: Record<string, unknown>,
): Promise<{ id: string; created: boolean }> {
  const { data: existing, error: lookupError } = await service
    .from(table)
    .select("id")
    .eq("source_ref", sourceRef)
    .maybeSingle();
  if (lookupError) throw new Error(`Upsert lookup failed on ${table}: ${lookupError.message}`);
  if (existing) {
    const id = String((existing as Record<string, unknown>).id);
    await updateRowById(service, table, id, row);
    return { id, created: false };
  }
  const inserted = await insertRow(service, table, { ...row, source_ref: sourceRef });
  const id = inserted ? String(inserted.id) : "";
  if (!id) throw new Error(`Insert into ${table} returned no id`);
  return { id, created: true };
}

// ---------------------------------------------------------------- Publish ---

interface PublishResult {
  request_id: string;
  kind: string;
  status: "done" | "failed" | "skipped";
  bownd_ref: string | null;
  error: string | null;
}

async function fetchPendingRequests(
  service: SupabaseClient,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const ordered = await service
    .from("bownd_publish_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!ordered.error) return (ordered.data ?? []) as Array<Record<string, unknown>>;
  // created_at may not exist on this table — retry without ordering.
  if (/created_at/.test(ordered.error.message)) {
    const unordered = await service
      .from("bownd_publish_requests")
      .select("*")
      .eq("status", "pending")
      .limit(limit);
    if (unordered.error) {
      throw new Error(`Publish queue read failed: ${unordered.error.message}`);
    }
    return (unordered.data ?? []) as Array<Record<string, unknown>>;
  }
  throw new Error(`Publish queue read failed: ${ordered.error.message}`);
}

async function markRequest(
  service: SupabaseClient,
  requestId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await service
    .from("bownd_publish_requests")
    .update(patch)
    .eq("id", requestId);
  if (error) throw new Error(`Publish request update failed: ${error.message}`);
}

/** Best-effort: stash the failure reason in the request's metadata. */
async function noteRequestError(
  service: SupabaseClient,
  request: Record<string, unknown>,
  code: string,
  detail: string,
): Promise<void> {
  try {
    const metadata = asRecord(request.metadata);
    await service
      .from("bownd_publish_requests")
      .update({ metadata: { ...metadata, last_error: code, last_error_detail: detail, failed_at: new Date().toISOString() } })
      .eq("id", String(request.id));
  } catch (err) {
    console.error("bownd-sync: could not note request error in metadata:", err);
  }
}

/** Resolve the Firestore venue doc id for a Supabase venue id. */
async function resolveFirestoreVenueRef(
  service: SupabaseClient,
  supabaseVenueId: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("bownd_publish_requests")
    .select("bownd_venue_ref")
    .eq("venue_id", supabaseVenueId)
    .eq("status", "published")
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ref = rows.length > 0 ? asNonEmptyString(rows[0].bownd_venue_ref) : null;
  return ref;
}

function supabaseEventToFirestore(
  row: Record<string, unknown>,
  venueFirestoreRef: string | null,
  tenantRef: string,
  tenantId: string,
): Record<string, unknown> {
  const startISO = asNonEmptyString(row.start_ts) ?? asNonEmptyString(row.startISO) ?? new Date().toISOString();
  return {
    title: asNonEmptyString(row.title) ?? "Untitled event",
    venueId: venueFirestoreRef ?? (typeof row.venue_id === "string" ? row.venue_id : ""),
    startISO,
    category:
      row.category === "spotlight" || row.category === "featured" ? row.category : "standard",
    vibeTags: asStringArray(row.vibe_tags ?? row.vibeTags),
    audienceTags: asStringArray(row.audience_tags ?? row.audienceTags),
    priceLabel: asNonEmptyString(row.price_label ?? row.priceLabel) ?? "",
    description: asNonEmptyString(row.description) ?? "",
    tenantRef,
    tenantId,
    isTest: rowIsTest(row),
    sourceRef: `supabase:${String(row.id)}`,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function supabaseVenueToFirestore(
  row: Record<string, unknown>,
  tenantRef: string,
  tenantId: string,
): Record<string, unknown> {
  return {
    name: asNonEmptyString(row.name) ?? String(row.id),
    lat: typeof row.lat === "number" ? row.lat : 0,
    lng: typeof row.lng === "number" ? row.lng : 0,
    tenantRef,
    tenantId,
    isTest: rowIsTest(row),
    sourceRef: `supabase:${String(row.id)}`,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function publishOne(
  service: SupabaseClient,
  db: FirestoreDb,
  userId: string,
  request: Record<string, unknown>,
): Promise<PublishResult> {
  const requestId = String(request.id);
  const base: PublishResult = { request_id: requestId, kind: "unknown", status: "failed", bownd_ref: null, error: null };

  const fail = async (code: string, detail: string): Promise<PublishResult> => {
    await noteRequestError(service, request, code, detail);
    try {
      await markRequest(service, requestId, { status: "failed" });
    } catch (err) {
      console.error("bownd-sync: could not mark request failed:", err);
    }
    await safeAudit(service, {
      actorUserId: userId,
      action: "bownd.publish.failed",
      entityType: "bownd_publish_request",
      entityId: requestId,
      before: { status: "pending" },
      after: { status: "failed" },
      metadata: { error: code, detail, request_id: requestId },
    });
    return { ...base, error: `${code}: ${detail}` };
  };

  // Kind: event wins when event_id is present, else venue.
  const eventId = asNonEmptyString(request.event_id);
  const venueId = asNonEmptyString(request.venue_id);
  const kind = eventId ? "event" : venueId ? "venue" : null;
  if (!kind) return await fail("missing_reference", "Request has neither event_id nor venue_id.");
  base.kind = kind;

  // Validate the referenced Supabase row — never invent data.
  const supabaseId = kind === "event" ? eventId : venueId;
  const table = kind === "event" ? "events" : "venues";
  const { data: row, error: rowError } = await service
    .from(table)
    .select("*")
    .eq("id", supabaseId)
    .maybeSingle();
  if (rowError) return await fail("supabase_read_failed", rowError.message);
  if (!row) {
    return await fail("supabase_row_not_found", `No ${table} row with id ${supabaseId}.`);
  }
  const supabaseRow = row as Record<string, unknown>;

  // Tenant mapping — NEVER guessed. No mapping row => fail the request.
  const tenantId = asNonEmptyString(supabaseRow.tenant_id);
  if (!tenantId) {
    return await fail("no_bownd_tenant_mapping", `Supabase ${table} row ${supabaseId} has no tenant_id; cannot map to a Bownd tenant. Establish the mapping in bownd_tenant_map at Bownd launch.`);
  }
  const tenantRef = await lookupBowndRefForTenant(service, tenantId);
  if (!tenantRef) {
    return await fail(
      "no_bownd_tenant_mapping",
      `No bownd_tenant_map row for tenant_id ${tenantId}. Establish the mapping at Bownd launch — Forge escalates this via a GitHub issue; this function does not guess one.`,
    );
  }

  // Build the Firestore doc.
  let firestoreDoc: Record<string, unknown>;
  let collection: string;
  let existingRef: string | null;
  if (kind === "event") {
    const venueFirestoreRef = typeof supabaseRow.venue_id === "string"
      ? await resolveFirestoreVenueRef(service, supabaseRow.venue_id)
      : null;
    firestoreDoc = supabaseEventToFirestore(supabaseRow, venueFirestoreRef, tenantRef, tenantId);
    collection = "events";
    existingRef = asNonEmptyString(request.bownd_event_ref);
  } else {
    firestoreDoc = supabaseVenueToFirestore(supabaseRow, tenantRef, tenantId);
    collection = "venues";
    existingRef = asNonEmptyString(request.bownd_venue_ref);
  }

  // Write: set-with-merge on the stored ref, or create + store the new ref.
  let docId: string;
  try {
    if (existingRef) {
      await db.collection(collection).doc(existingRef).set(firestoreDoc, { merge: true });
      docId = existingRef;
    } else {
      const ref = await db.collection(collection).add(firestoreDoc);
      docId = ref.id;
    }
  } catch (err) {
    return await fail("firestore_write_failed", err instanceof Error ? err.message : String(err));
  }

  // Mark published + store the Firestore doc ref.
  const refPatch = kind === "event" ? { bownd_event_ref: docId } : { bownd_venue_ref: docId };
  try {
    await markRequest(service, requestId, { status: "published", ...refPatch });
  } catch (err) {
    // The Firestore write already succeeded; the request row update failing
    // must not report the publish as failed (re-running would merge-write
    // the same doc — idempotent). Record it and report done-with-warning.
    console.error("bownd-sync: Firestore write succeeded but request update failed:", err);
    await safeAudit(service, {
      actorUserId: userId,
      action: "bownd.publish.request_update_failed",
      entityType: "bownd_publish_request",
      entityId: requestId,
      after: { status: "published", [kind === "event" ? "bownd_event_ref" : "bownd_venue_ref"]: docId },
      metadata: { warning: "Firestore write succeeded; request row update failed", error: err instanceof Error ? err.message : String(err) },
    });
    return { ...base, status: "done", bownd_ref: docId, error: "warning: request row update failed after Firestore write succeeded" };
  }

  await safeAudit(service, {
    actorUserId: userId,
    action: "bownd.publish.done",
    entityType: "bownd_publish_request",
    entityId: requestId,
    before: { status: "pending" },
    after: { status: "published", [kind === "event" ? "bownd_event_ref" : "bownd_venue_ref"]: docId },
    metadata: { kind, supabase_id: supabaseId, tenant_ref: tenantRef },
  });
  return { ...base, status: "done", bownd_ref: docId };
}

async function runPublish(
  service: SupabaseClient,
  db: FirestoreDb,
  userId: string,
  limit: number,
): Promise<Record<string, unknown>> {
  const requests = await fetchPendingRequests(service, limit);
  const results: PublishResult[] = [];
  for (const request of requests) {
    // A request already marked published is never re-processed (we only
    // selected pending rows, but re-check defensively).
    if (String(request.status) !== "pending") {
      results.push({ request_id: String(request.id), kind: "unknown", status: "skipped", bownd_ref: null, error: "not pending" });
      continue;
    }
    results.push(await publishOne(service, db, userId, request));
  }
  return {
    direction: "publish",
    processed: results.length,
    done: results.filter((r) => r.status === "done").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}

// ----------------------------------------------------------------- Mirror ---

interface MirrorCollectionSummary {
  mirrored: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  skipped_reasons: Record<string, number>;
  failed_docs: Array<{ doc_id: string; error: string }>;
  watermark_before: string | null;
  watermark_after: string | null;
}

interface Watermark {
  last_seen_update_at: string | null;
  last_doc_id: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

function parsePendingFromLastError(lastError: string | null): string[] {
  if (!lastError) return [];
  try {
    const parsed = JSON.parse(lastError) as { unresolved?: unknown };
    return Array.isArray(parsed.unresolved)
      ? parsed.unresolved.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return []; // legacy plain-text last_error — no pending list
  }
}

async function readWatermark(service: SupabaseClient, collection: string): Promise<Watermark> {
  const { data, error } = await service
    .from("bownd_mirror_state")
    .select("last_seen_update_at, last_doc_id, last_sync_at, last_error")
    .eq("collection", collection)
    .maybeSingle();
  if (error) throw new Error(`Watermark read failed for ${collection}: ${error.message}`);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    last_seen_update_at: typeof row.last_seen_update_at === "string" ? row.last_seen_update_at : null,
    last_doc_id: typeof row.last_doc_id === "string" ? row.last_doc_id : null,
    last_sync_at: typeof row.last_sync_at === "string" ? row.last_sync_at : null,
    last_error: typeof row.last_error === "string" ? row.last_error : null,
  };
}

async function writeWatermark(
  service: SupabaseClient,
  collection: string,
  watermark: Watermark,
): Promise<void> {
  const { error } = await service
    .from("bownd_mirror_state")
    .upsert(
      {
        collection,
        last_seen_update_at: watermark.last_seen_update_at,
        last_doc_id: watermark.last_doc_id,
        last_sync_at: watermark.last_sync_at,
        last_error: watermark.last_error,
      },
      { onConflict: "collection" },
    );
  if (error) throw new Error(`Watermark write failed for ${collection}: ${error.message}`);
}

async function listFirestoreDocs(db: FirestoreDb, collection: string): Promise<FirestoreDoc[]> {
  const snap = await db.collection(collection).get();
  return (snap.docs as Array<Record<string, unknown>>).map((d) => ({
    id: String(d.id),
    updateTimeMillis: toMillis((d as { updateTime?: unknown }).updateTime),
    data: asRecord((d as { data?: () => unknown }).data?.call(d)),
  }));
}

async function fetchFirestoreDoc(
  db: FirestoreDb,
  collection: string,
  docId: string,
): Promise<FirestoreDoc | null> {
  const snap = await db.collection(collection).doc(docId).get();
  if (!snap.exists) return null;
  const rec = snap as unknown as Record<string, unknown>;
  return {
    id: docId,
    updateTimeMillis: toMillis(rec.updateTime),
    data: asRecord((rec.data as (() => unknown) | undefined)?.call(rec)),
  };
}

// --- Field mappers (Firestore -> Supabase). Only verified columns are
// written; Bownd-only fields ride in metadata so nothing is lost. ---

function mapFirestoreEvent(
  doc: FirestoreDoc,
  tenantId: string,
  tenantRef: string,
  venueSupabaseId: string | null,
): Record<string, unknown> {
  const d = doc.data;
  const startISO = asNonEmptyString(d.startISO) ?? asNonEmptyString(d.start_ts) ?? null;
  return {
    title: asNonEmptyString(d.title) ?? "Untitled event",
    description: asNonEmptyString(d.description),
    start_ts: startISO,
    price_label: asNonEmptyString(d.priceLabel ?? d.price_label),
    event_type: asNonEmptyString(d.event_type),
    status: asNonEmptyString(d.status) ?? "active",
    tenant_id: tenantId,
    venue_id: venueSupabaseId,
    // Test flag: top-level `is_test` is dropped by the tolerant writer
    // when the column does not exist yet (metadata.is_test is the
    // durable carrier); once the optional migration adds the column,
    // the same payload starts persisting it.
    is_test: d.isTest === true,
    metadata: {
      bownd_doc_id: doc.id,
      bownd_tenant_ref: tenantRef,
      is_test: d.isTest === true,
      vibe_tags: asStringArray(d.vibeTags ?? d.vibe_tags),
      audience_tags: asStringArray(d.audienceTags ?? d.audience_tags),
      category: asNonEmptyString(d.category),
      venue_ref: asNonEmptyString(d.venueId ?? d.venue_id),
    },
  };
}

function mapFirestoreVenue(
  doc: FirestoreDoc,
  tenantId: string,
  tenantRef: string,
): Record<string, unknown> {
  const d = doc.data;
  return {
    name: asNonEmptyString(d.name) ?? doc.id,
    tenant_id: tenantId,
    lat: typeof d.lat === "number" ? d.lat : null,
    lng: typeof d.lng === "number" ? d.lng : null,
    is_test: d.isTest === true,
    metadata: {
      bownd_doc_id: doc.id,
      bownd_tenant_ref: tenantRef,
      is_test: d.isTest === true,
    },
  };
}

function mapFirestoreRedemption(
  doc: FirestoreDoc,
  tenantId: string,
  tenantRef: string,
): Record<string, unknown> {
  const d = doc.data;
  return {
    redemption_type: "bownd_qr",
    customer_ref: asNonEmptyString(d.redeemedByDevice) ?? "unknown",
    tenant_id: tenantId,
    metadata: {
      bownd_token: doc.id,
      bownd_tenant_ref: tenantRef,
      experience_id: asNonEmptyString(d.experienceId),
      redeemed_at: typeof d.redeemedAt === "number" ? d.redeemedAt : null,
      redeemed_by_device: asNonEmptyString(d.redeemedByDevice),
      status: "REDEEMED",
    },
  };
}

async function resolveSupabaseVenueId(
  service: SupabaseClient,
  firestoreVenueId: string | null,
): Promise<string | null> {
  if (!firestoreVenueId) return null;
  const { data, error } = await service
    .from("venues")
    .select("id")
    .eq("source_ref", `bownd:${firestoreVenueId}`)
    .maybeSingle();
  if (error || !data) return null;
  return String((data as Record<string, unknown>).id);
}

async function mirrorCollection(
  service: SupabaseClient,
  db: FirestoreDb,
  userId: string,
  collection: MirrorCollection,
): Promise<MirrorCollectionSummary> {
  const watermarkBefore = await readWatermark(service, collection);
  const watermarkBeforeMs = watermarkBefore.last_seen_update_at
    ? Date.parse(watermarkBefore.last_seen_update_at)
    : 0;
  const pendingIds = parsePendingFromLastError(watermarkBefore.last_error);

  const summary: MirrorCollectionSummary = {
    mirrored: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    skipped_reasons: {},
    failed_docs: [],
    watermark_before: watermarkBefore.last_seen_update_at,
    watermark_after: watermarkBefore.last_seen_update_at,
  };
  const bumpSkipped = (reason: string) => {
    summary.skipped += 1;
    summary.skipped_reasons[reason] = (summary.skipped_reasons[reason] ?? 0) + 1;
  };
  const unresolved: string[] = [];

  // Candidate docs: everything newer than the watermark + pending retries
  // from the previous run's last_error.
  const allDocs = await listFirestoreDocs(db, collection);
  const byId = new Map(allDocs.map((d) => [d.id, d]));
  const candidates: FirestoreDoc[] = allDocs.filter((d) => d.updateTimeMillis > watermarkBeforeMs);
  for (const pendingId of pendingIds) {
    if (byId.has(pendingId)) continue; // already in the changed set
    const pending = await fetchFirestoreDoc(db, collection, pendingId);
    if (pending) candidates.push(pending);
    // If the doc no longer exists in Firestore, it drops out of pending.
  }
  candidates.sort((a, b) => a.updateTimeMillis - b.updateTimeMillis);

  let maxSeenMillis = watermarkBeforeMs;
  let maxSeenDocId: string | null = watermarkBefore.last_doc_id;

  for (const doc of candidates) {
    const docId = doc.id;
    if (doc.updateTimeMillis > maxSeenMillis) {
      maxSeenMillis = doc.updateTimeMillis;
      maxSeenDocId = docId;
    }
    // Docs this function published carry sourceRef 'supabase:<id>' — they
    // are canonical in Supabase already. Mirroring one back would create
    // a DUPLICATE Supabase row (the upsert key 'bownd:<docId>' never
    // matches the original row), so skip them. The watermark still
    // advances past the doc (above).
    if (typeof doc.data.sourceRef === "string" && doc.data.sourceRef.startsWith("supabase:")) {
      bumpSkipped("supabase_origin");
      continue;
    }
    try {
      if (collection === "events") {
        const title = asNonEmptyString(doc.data.title);
        if (!title) {
          bumpSkipped("missing_title");
          unresolved.push(docId);
          continue;
        }
        const tenantRefField = asNonEmptyString(doc.data.tenantRef);
        const venueIdField = asNonEmptyString(doc.data.venueId ?? doc.data.venue_id);
        const { tenantId, matchedRef } = await resolveTenantForDoc(
          service,
          [...(tenantRefField ? [tenantRefField] : []), `event:${docId}`, ...(venueIdField ? [`venue:${venueIdField}`] : [])],
        );
        if (!tenantId || !matchedRef) {
          bumpSkipped("no_bownd_tenant_mapping");
          unresolved.push(docId);
          continue;
        }
        const venueSupabaseId = await resolveSupabaseVenueId(service, venueIdField);
        const row = mapFirestoreEvent(doc, tenantId, matchedRef, venueSupabaseId);
        const { created } = await upsertBySourceRef(service, "events", `bownd:${docId}`, row);
        summary.mirrored += 1;
        if (created) summary.created += 1; else summary.updated += 1;
      } else if (collection === "venues") {
        const name = asNonEmptyString(doc.data.name);
        if (!name) {
          bumpSkipped("missing_name");
          unresolved.push(docId);
          continue;
        }
        const tenantRefField = asNonEmptyString(doc.data.tenantRef);
        const { tenantId, matchedRef } = await resolveTenantForDoc(
          service,
          [...(tenantRefField ? [tenantRefField] : []), `venue:${docId}`],
        );
        if (!tenantId || !matchedRef) {
          bumpSkipped("no_bownd_tenant_mapping");
          unresolved.push(docId);
          continue;
        }
        const row = mapFirestoreVenue(doc, tenantId, matchedRef);
        const { created } = await upsertBySourceRef(service, "venues", `bownd:${docId}`, row);
        summary.mirrored += 1;
        if (created) summary.created += 1; else summary.updated += 1;
      } else {
        // redemptions: only REDEEMED tokens mirror. NEW/EXPIRED are not
        // failures — they are not ready — and are not audit-logged per
        // doc (they would spam the log every run).
        if (doc.data.status !== "REDEEMED") {
          bumpSkipped("not_redeemed");
          continue;
        }
        const experienceId = asNonEmptyString(doc.data.experienceId);
        if (!experienceId) {
          bumpSkipped("missing_experience_id");
          unresolved.push(docId);
          continue;
        }
        const tenantRefField = asNonEmptyString(doc.data.tenantRef);
        const { tenantId, matchedRef } = await resolveTenantForDoc(
          service,
          [...(tenantRefField ? [tenantRefField] : []), `redemption:${docId}`, `event:${experienceId}`],
        );
        if (!tenantId || !matchedRef) {
          bumpSkipped("no_bownd_tenant_mapping");
          unresolved.push(docId);
          continue;
        }
        // Dedupe: a redemption is never mirrored twice. Check the
        // stored bownd_token before inserting.
        const { data: existingRedemption, error: dedupeError } = await service
          .from("venue_redemptions")
          .select("id")
          .filter("metadata->>bownd_token", "eq", docId)
          .maybeSingle();
        if (dedupeError) throw new Error(`Redemption dedupe lookup failed: ${dedupeError.message}`);
        if (existingRedemption) {
          bumpSkipped("already_mirrored");
          continue;
        }
        const row = mapFirestoreRedemption(doc, tenantId, matchedRef);
        await insertRow(service, "venue_redemptions", row);
        summary.mirrored += 1;
        summary.created += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.failed += 1;
      summary.failed_docs.push({ doc_id: docId, error: message });
      unresolved.push(docId);
    }
  }

  // Advance the watermark past everything processed this run. Unresolved
  // docs are NOT lost: their ids go back into last_error's pending list
  // and are retried on the next run.
  const dedupedUnresolved = [...new Set(unresolved)].slice(0, MAX_PENDING_DOCS);
  const lastError = dedupedUnresolved.length > 0 || summary.failed_docs.length > 0
    ? JSON.stringify({
      error: summary.failed_docs.length > 0 ? summary.failed_docs[0].error : "unresolved docs pending retry",
      unresolved: dedupedUnresolved,
    })
    : null;
  const watermarkAfter: Watermark = {
    last_seen_update_at: maxSeenMillis > 0 ? new Date(maxSeenMillis).toISOString() : watermarkBefore.last_seen_update_at,
    last_doc_id: maxSeenDocId,
    last_sync_at: new Date().toISOString(),
    last_error: lastError,
  };
  await writeWatermark(service, collection, watermarkAfter);
  summary.watermark_after = watermarkAfter.last_seen_update_at;

  await safeAudit(service, {
    actorUserId: userId,
    action: "bownd.mirror.run",
    entityType: "bownd_sync",
    entityId: userId,
    before: { watermark: watermarkBefore.last_seen_update_at },
    after: { watermark: watermarkAfter.last_seen_update_at },
    metadata: {
      collection,
      mirrored: summary.mirrored,
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
      skipped_reasons: summary.skipped_reasons,
      failed: summary.failed,
      failed_docs: summary.failed_docs.slice(0, 20),
      unresolved: dedupedUnresolved,
    },
  });
  return summary;
}

async function runMirror(
  service: SupabaseClient,
  db: FirestoreDb,
  userId: string,
  requested: string[] | undefined,
): Promise<Record<string, unknown>> {
  const collections = requested && requested.length > 0
    ? requested.filter((c): c is MirrorCollection =>
      (MIRROR_COLLECTIONS as readonly string[]).includes(c))
    : [...MIRROR_COLLECTIONS];
  if (collections.length === 0) {
    throw new HttpError(400, `collections must be a subset of: ${MIRROR_COLLECTIONS.join(", ")}`);
  }
  const perCollection: Record<string, MirrorCollectionSummary> = {};
  for (const collection of collections) {
    perCollection[collection] = await mirrorCollection(service, db, userId, collection);
  }
  const totals = Object.values(perCollection).reduce(
    (acc, s) => ({
      mirrored: acc.mirrored + s.mirrored,
      skipped: acc.skipped + s.skipped,
      failed: acc.failed + s.failed,
    }),
    { mirrored: 0, skipped: 0, failed: 0 },
  );
  return { direction: "mirror", ...totals, collections: perCollection };
}

// ------------------------------------------------------------------ Serve ---

Deno.serve((req) =>
  handleRequest(req, async (innerReq) => {
    const { user, service } = await requireOperator(innerReq);
    const body = await parseJsonBody(innerReq);
    const direction = typeof body.direction === "string" ? body.direction.toLowerCase() : "";

    if (direction === "publish") {
      // Firebase is required for publish (Firestore writes).
      const db = getFirestore();
      const rawLimit = typeof body.limit === "number" ? body.limit : MAX_PUBLISH_BATCH;
      const limit = Math.max(1, Math.min(MAX_PUBLISH_LIMIT, Math.floor(rawLimit)));
      return jsonResponse(await runPublish(service, db, user.id, limit));
    }

    if (direction === "mirror") {
      // Firebase is required for mirror (Firestore reads).
      const db = getFirestore();
      const collections = Array.isArray(body.collections)
        ? body.collections.filter((c): c is string => typeof c === "string")
        : undefined;
      return jsonResponse(await runMirror(service, db, user.id, collections));
    }

    throw new HttpError(400, "direction must be 'publish' or 'mirror'");
  })
);
