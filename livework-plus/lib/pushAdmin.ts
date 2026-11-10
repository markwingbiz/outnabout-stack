// Admin push composer — client contract for the push-send Edge Function
// (push-notifications-plan.md §1.7). The composer is a CLIENT of
// push-send: it enqueues like every other sender; there is no second
// sending path and the app never talks to the Expo Push API directly.
//
// CROSS-APP MODEL (§1.7): a draft's FIRST choice is the target app —
// Bownd, Livework, or Livework+. Segments resolve within that app, and
// deep-link options follow the TARGET app's routes (a Bownd push links
// to Bownd events / offers / venues / campaigns, never to Livework+
// screens).
//
// Access: the composer screen gates on the app's existing operator
// pattern (checkIsOperator in lib/forge.ts) — operator (Mark) only
// today; the admin model is deferred and no roles are invented here.
// Every composer action is audit-logged server-side by push-send
// (forge_audit_log is Edge-Function-written in this codebase).
import { callForge, newIdempotencyKey } from "./forge";
import { supabase } from "./supabase";
import { fetchFunnels } from "./data";

// ---------- Types ----------

export type PushTargetApp = "bownd" | "livework" | "livework_plus";

export const PUSH_TARGET_APPS: { key: PushTargetApp; label: string }[] = [
  { key: "bownd", label: "Bownd" },
  { key: "livework", label: "Livework" },
  { key: "livework_plus", label: "Livework+" },
];

export type PushSegment = "all" | "paid" | "free" | "venues" | "specific";

/** Segments offered per target app (§1.7 segment set, scoped to the app). */
export function segmentsForApp(app: PushTargetApp): { key: PushSegment; label: string }[] {
  switch (app) {
    case "bownd":
      return [
        { key: "all", label: "All members" },
        { key: "paid", label: "Paid members" },
        { key: "free", label: "Free members" },
        { key: "specific", label: "Specific accounts" },
      ];
    case "livework":
      return [
        { key: "all", label: "All venue accounts" },
        { key: "venues", label: "Venue tenants" },
        { key: "specific", label: "Specific accounts" },
      ];
    case "livework_plus":
      return [
        { key: "all", label: "All operator accounts" },
        { key: "specific", label: "Specific accounts" },
      ];
  }
}

export type PushAudience = {
  app: PushTargetApp;
  segment: PushSegment;
  /** Required when segment = 'specific': account ids in the TARGET app. */
  account_ids?: string[];
};

export type PushSendClass = "marketing" | "transactional";

/** Fixed list (§1.7) — there is no free-form "transactional" label. */
export const TRANSACTIONAL_REASONS = [
  { key: "event_change", label: "Event change" },
  { key: "cancellation", label: "Cancellation" },
  { key: "refund_notice", label: "Refund notice" },
  { key: "service_notice", label: "Service notice" },
  { key: "security_notice", label: "Security notice" },
] as const;

export type TransactionalReason = (typeof TRANSACTIONAL_REASONS)[number]["key"];

/** Category opt-in bucket per target app (the sender enforces §1.6). */
export function categoriesForApp(app: PushTargetApp): { key: string; label: string }[] {
  switch (app) {
    case "bownd":
      return [
        { key: "offers_campaigns", label: "Offers & campaigns" },
        { key: "events_for_you", label: "Events for you" },
        { key: "perks_drops", label: "Perks & drops" },
        { key: "points", label: "Points" },
      ];
    case "livework":
      return [
        { key: "venue_sales", label: "Sales & placements" },
        { key: "venue_reviews", label: "Reviews" },
        { key: "venue_suggestions", label: "Event suggestions" },
      ];
    case "livework_plus":
      return [{ key: "operator_duty", label: "Operator alerts" }];
  }
}

export type PushDraft = {
  title: string;
  body: string;
  audience: PushAudience;
  /** Category opt-in bucket in the TARGET app. */
  category: string;
  send_class: PushSendClass;
  /** Required when send_class = 'transactional'; stored on the log rows. */
  reason?: TransactionalReason;
  /** App-internal route in the TARGET app ("" = no link). */
  deep_link: string;
};

export type AdminPushState = { admin_push_enabled: boolean };

export type ScheduledPush = {
  id: string;
  title: string;
  app: PushTargetApp;
  segment: PushSegment;
  send_at: string;
  send_class: PushSendClass;
};

export type AdminPushHistoryRow = {
  id: string;
  title: string;
  app: PushTargetApp;
  segment: PushSegment | null;
  recipients: number | null;
  status: string;
  created_at: string;
};

// ---------- push-send actions (the function's admin contract) ----------

export async function fetchAdminPushState(): Promise<AdminPushState> {
  const res = await callForge<{ admin_push_enabled?: unknown }>("push-send", {
    action: "admin_state",
  });
  return { admin_push_enabled: res?.admin_push_enabled === true };
}

export async function fetchAudienceCount(
  audience: PushAudience,
  category: string,
): Promise<number> {
  const res = await callForge<{ recipients?: unknown }>("push-send", {
    action: "audience_count",
    audience,
    category,
  });
  return typeof res?.recipients === "number" ? res.recipients : 0;
}

/** Test send to the operator's own registered device for the target app. */
export async function sendAdminTestPush(draft: PushDraft): Promise<void> {
  await callForge("push-send", { action: "test_send", draft });
}

export async function sendAdminPushNow(
  draft: PushDraft,
): Promise<{ send_id: string | null; recipients: number | null }> {
  const res = await callForge<{ send_id?: unknown; recipients?: unknown }>("push-send", {
    action: "send",
    draft,
    idempotency_key: newIdempotencyKey(),
  });
  return {
    send_id: typeof res?.send_id === "string" ? res.send_id : null,
    recipients: typeof res?.recipients === "number" ? res.recipients : null,
  };
}

export async function scheduleAdminPush(
  draft: PushDraft,
  sendAtISO: string,
): Promise<{ draft_id: string | null }> {
  const res = await callForge<{ draft_id?: unknown }>("push-send", {
    action: "schedule",
    draft,
    send_at: sendAtISO,
    idempotency_key: newIdempotencyKey(),
  });
  return { draft_id: typeof res?.draft_id === "string" ? res.draft_id : null };
}

export async function cancelScheduledAdminPush(draftId: string): Promise<void> {
  await callForge("push-send", { action: "cancel_schedule", draft_id: draftId });
}

export async function listScheduledAdminPushes(): Promise<ScheduledPush[]> {
  const res = await callForge<{ drafts?: unknown }>("push-send", {
    action: "list_scheduled",
  });
  const rows = Array.isArray(res?.drafts) ? (res.drafts as Record<string, unknown>[]) : [];
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    title: String(r.title ?? "Untitled"),
    app: (typeof r.app === "string" ? r.app : "bownd") as PushTargetApp,
    segment: (typeof r.segment === "string" ? r.segment : "all") as PushSegment,
    send_at: String(r.send_at ?? ""),
    send_class: (r.send_class === "transactional" ? "transactional" : "marketing") as PushSendClass,
  }));
}

export async function listAdminPushHistory(limit = 20): Promise<AdminPushHistoryRow[]> {
  const res = await callForge<{ sends?: unknown }>("push-send", {
    action: "list_history",
    limit,
  });
  const rows = Array.isArray(res?.sends) ? (res.sends as Record<string, unknown>[]) : [];
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    title: String(r.title ?? "Untitled"),
    app: (typeof r.app === "string" ? r.app : "bownd") as PushTargetApp,
    segment: (typeof r.segment === "string" ? r.segment : null) as PushSegment | null,
    recipients: typeof r.recipients === "number" ? r.recipients : null,
    status: String(r.status ?? ""),
    created_at: String(r.created_at ?? ""),
  }));
}

// ---------- Deep-link picker data (target app's real rows/routes) ----------

export type PushLinkTarget = { id: string; label: string; route: string };

export type PushLinkOptions = {
  events: PushLinkTarget[];
  venues: PushLinkTarget[];
  campaigns: PushLinkTarget[];
  /** Bundles have no table yet — always empty in v1 (honest empty state). */
  offers: PushLinkTarget[];
  screens: PushLinkTarget[];
  error: string | null;
};

function screensForApp(app: PushTargetApp): PushLinkTarget[] {
  switch (app) {
    case "bownd":
      return [
        { id: "home", label: "Home", route: "/(tabs)/home" },
        { id: "events", label: "Events", route: "/(tabs)/events" },
        { id: "personal", label: "Personal (tickets & rewards)", route: "/(tabs)/personal" },
        { id: "whats-close", label: "What's Close", route: "/whats-close" },
      ];
    case "livework":
      return [
        { id: "dashboard", label: "Dashboard", route: "/" },
        { id: "venues", label: "My Venues", route: "/venues" },
        { id: "redemptions", label: "Redemptions", route: "/redemptions" },
        { id: "publish", label: "Publish to Bownd", route: "/publish" },
      ];
    case "livework_plus":
      return [
        { id: "home", label: "Home", route: "/(tabs)" },
        { id: "approvals", label: "Approvals", route: "/(tabs)/approvals" },
        { id: "funnels", label: "Funnels", route: "/(tabs)/funnels" },
        { id: "jobs", label: "Jobs", route: "/(tabs)/jobs" },
        { id: "settings", label: "Settings", route: "/(tabs)/settings" },
      ];
  }
}

/**
 * Loads the picker's rows for the TARGET app. Event/venue/campaign
 * routes follow the target app's route table (§1.7). push-send
 * re-validates every deep link at enqueue time against the target app —
 * an unresolvable route blocks the send there too.
 */
export async function fetchPushLinkOptions(app: PushTargetApp): Promise<PushLinkOptions> {
  const out: PushLinkOptions = {
    events: [],
    venues: [],
    campaigns: [],
    offers: [],
    screens: screensForApp(app),
    error: null,
  };
  if (!supabase) {
    out.error = "Supabase is not configured.";
    return out;
  }
  try {
    if (app === "bownd" || app === "livework") {
      const [ev, ve] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, start_ts, status")
          .order("start_ts", { ascending: false })
          .limit(50),
        supabase
          .from("venues")
          .select("id, name")
          .order("name", { ascending: true })
          .limit(50),
      ]);
      if (ev.error) throw new Error(ev.error.message);
      if (ve.error) throw new Error(ve.error.message);
      out.events = ((ev.data ?? []) as Record<string, unknown>[]).map((e) => {
        const id = String(e.id ?? "");
        return {
          id,
          label: String(e.title ?? "Untitled event"),
          route:
            app === "bownd"
              ? `/detail?id=${encodeURIComponent(id)}&kind=event`
              : "/",
        };
      });
      out.venues = ((ve.data ?? []) as Record<string, unknown>[]).map((v) => {
        const id = String(v.id ?? "");
        return {
          id,
          label: String(v.name ?? "Unnamed venue"),
          route:
            app === "bownd"
              ? `/detail?id=${encodeURIComponent(id)}&kind=venue`
              : "/venues",
        };
      });
    }
    if (app === "bownd") {
      const { funnels, error } = await fetchFunnels();
      if (error) throw new Error(error);
      out.campaigns = funnels.map((f) => ({
        id: f.id,
        label: f.name,
        route: "/(tabs)/events",
      }));
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : "Could not load link options.";
  }
  return out;
}
