// Bownd first-party browsing analytics — client emitter.
//
// Writes one row per signal into the Supabase `app_events` stream
// (event views, venue views, saves, searches, checkout starts). The
// stream feeds two things: Livework's venue suggestions (via the
// nightly `rollup_app_events_daily` rollup into `analytics_daily`)
// and, later, aggregated/anonymized insight products — so `meta`
// carries the dimensions worth keeping (category/vibe, neighborhood,
// search text + result count) from day one. Raw rows stay internal;
// only aggregates ever leave.
//
// House rules, same as lib/push.ts:
// - NO @supabase/supabase-js import. Bownd has no Supabase Auth session
//   (members sign in with Firebase), so this posts to PostgREST with
//   the publishable (anon) key, exactly like the push registry calls.
//   supabase-js would also drag realtime-js/ws/`stream` into the Metro
//   bundle and break it (2026-11-11). Plain fetch only.
// - Fire-and-forget: tracking never throws into the UI, never blocks a
//   tap, and no-ops silently when the env vars are absent.
// - Insert-only by design: RLS grants the anon key INSERT on
//   app_events and no SELECT — the app can write signals, never read
//   anyone's stream back.
//
// Identity: app_events.user_id is a uuid column; Firebase uids are
// not uuids, so the signed-in uid rides in meta.account_id (the same
// naming the push registry uses) and user_id is only set if an id is
// ever uuid-shaped. event_id / venue_id follow the same rule: real
// catalog ids in Bownd are a mix of Firestore doc ids and Supabase
// uuids, so non-uuid ids ride in meta.event_ref / meta.venue_ref and
// the uuid columns stay null rather than failing the insert.
import { auth } from "./firebase";
import { loadPersona, type PersonaProfile } from "./personaStore";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const analyticsConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export type AnalyticsEventName =
  | "event_view"
  | "venue_view"
  | "event_save"
  | "event_unsave"
  | "search"
  | "checkout_started";

export type TrackOptions = {
  eventId?: string | null;
  venueId?: string | null;
  meta?: Record<string, unknown>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(id: string | null | undefined): string | null {
  return id && UUID_RE.test(id) ? id : null;
}

// Persona is AsyncStorage-backed; load it once and reuse. loadPersona
// always resolves (defaults when unset), so every row carries the
// persona the app itself tracks — never an invented one.
let personaCache: PersonaProfile | null = null;
let personaLoading: Promise<PersonaProfile> | null = null;

function currentPersona(): Promise<PersonaProfile> {
  if (personaCache) return Promise.resolve(personaCache);
  if (!personaLoading) {
    personaLoading = loadPersona()
      .then((p) => {
        personaCache = p;
        return p;
      })
      .catch(() => loadPersona());
  }
  return personaLoading;
}

/**
 * Records one browsing signal. Safe to call from any event handler or
 * effect: it never throws and never returns a promise the caller must
 * await (the returned promise always resolves).
 */
export function track(
  eventName: AnalyticsEventName,
  opts: TrackOptions = {},
): Promise<void> {
  if (!analyticsConfigured || !supabaseUrl || !supabaseAnonKey) {
    return Promise.resolve();
  }
  return (async () => {
    try {
      const persona = await currentPersona();
      const accountId = auth?.currentUser?.uid ?? null;
      const meta: Record<string, unknown> = { ...(opts.meta ?? {}) };
      if (accountId) meta.account_id = accountId;
      if (opts.eventId && !asUuid(opts.eventId)) meta.event_ref = opts.eventId;
      if (opts.venueId && !asUuid(opts.venueId)) meta.venue_ref = opts.venueId;
      const row: Record<string, unknown> = {
        event_name: eventName,
        event_id: asUuid(opts.eventId),
        venue_id: asUuid(opts.venueId),
        persona,
        meta,
      };
      const userId = asUuid(accountId);
      if (userId) row.user_id = userId;
      await fetch(`${supabaseUrl}/rest/v1/app_events`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(row),
      });
    } catch {
      // Analytics is best-effort by design: a failed signal is dropped,
      // never surfaced to the member and never retried into a queue.
    }
  })();
}
