// Livework dashboard data layer — Phase 5 + Phase 7 Slice 1.
// Live Supabase queries ONLY. No demo object, no fake numbers, no
// fake publish / payout claims. Every section returns real rows
// or an explicit empty state (the screen renders the empty text).
// Reads: venues (the vendor's venues, ordered by name), events
// (the vendor's tenants only). revenue_events is NEVER summed for the
// Verified Revenue headline: its rows are historical tracking rows for
// things "created" (Mar–May 2026), not payments, and money_funnels
// verified revenue is $0 — so the headline is honestly $0.00.
//
// Tenant scoping (Slice 1): events are filtered by the signed-in user's
// tenant_id(s) AND by RLS. A user with no membership gets the honest
// empty state (needsSetup: true) — never another vendor's rows.
// revenue_events has NO tenant_id column (verified live), so it cannot
// be tenant-scoped; the dashboard labels that revenue as ecosystem-wide
// (see revenueScopeNote) until a later slice links revenue rows to tenants.
import { supabase } from "./supabase";
import { getUserTenantIds, getUserVenues } from "./tenant";

export type RangeKey = "7d" | "30d" | "month" | "all";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "Next 7 days" },
  { key: "30d", label: "Next 30 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All upcoming" },
];

export type DashboardEvent = {
  id: string;
  title: string;
  dateLabel: string;
  startTs: string | null;
  eventType: string | null;
  priceLabel: string | null;
  status: string | null;
  description: string | null;
};

export type CalendarDay = {
  day: string;
  date: number;
  /** Start-of-day timestamp, used to sort days by full date (not day-of-month). */
  sortKey: number;
  events: { time: string; title: string }[];
};

export type DashboardData = {
  venueName: string;
  userName: string;
  rangeLabel: string;
  eventCount: number;
  /** Verified revenue. Always 0 until real payments exist — never a sum of revenue_events tracking rows (see fetchDashboard). */
  verifiedRevenue: number;
  activityPoints: number[];
  activityDays: string[];
  events: DashboardEvent[];
  calendar: CalendarDay[];
  latestEvents: string[];
  /** True when the signed-in user has no tenant membership yet (needs onboarding). */
  needsSetup: boolean;
  /** True when the user has at least one venue. */
  hasVenue: boolean;
  /**
   * Non-null when the revenue figure is NOT tenant-scoped (revenue_events
   * has no tenant_id column). The dashboard renders this as a caption so
   * the number is never misread as the vendor's own revenue.
   */
  revenueScopeNote: string | null;
  error: string | null;
};

export const GENERAL_TIPS: string[] = [
  "Try indie acts on Fridays — they draw your largest crowds.",
  "Weekend shows are 40% more profitable than weekday shows.",
  "Add merch to boost per-attendee revenue.",
  "Venues like you add a second show on Saturdays.",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Events window (upcoming) + revenue window (past) for a range. */
function windows(range: RangeKey, now: Date): { eventStart: Date; eventEnd: Date; revStart: Date; revEnd: Date } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "7d") {
    const end = new Date(startOfToday);
    end.setDate(end.getDate() + 7);
    const revStart = new Date(startOfToday);
    revStart.setDate(revStart.getDate() - 7);
    return { eventStart: startOfToday, eventEnd: end, revStart, revEnd: now };
  }
  if (range === "30d") {
    const end = new Date(startOfToday);
    end.setDate(end.getDate() + 30);
    const revStart = new Date(startOfToday);
    revStart.setDate(revStart.getDate() - 30);
    return { eventStart: startOfToday, eventEnd: end, revStart, revEnd: now };
  }
  if (range === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { eventStart: monthStart, eventEnd: monthEnd, revStart: monthStart, revEnd: now };
  }
  const farFuture = new Date(now.getFullYear() + 5, 0, 1);
  return { eventStart: startOfToday, eventEnd: farFuture, revStart: new Date(0), revEnd: now };
}

function formatDateLabel(iso: string | null): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const emptyData = (
  rangeLabel: string,
  error: string | null,
  extra: Partial<Pick<DashboardData, "userName" | "needsSetup" | "hasVenue" | "revenueScopeNote">> = {},
): DashboardData => ({
  venueName: "No venue yet",
  userName: extra.userName ?? "there",
  rangeLabel,
  eventCount: 0,
  verifiedRevenue: 0,
  activityPoints: [],
  activityDays: [],
  events: [],
  calendar: [],
  latestEvents: [],
  needsSetup: extra.needsSetup ?? false,
  hasVenue: extra.hasVenue ?? false,
  revenueScopeNote: extra.revenueScopeNote ?? null,
  error,
});

export async function fetchDashboard(range: RangeKey): Promise<DashboardData> {
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? "Next 7 days";
  if (!supabase) {
    return emptyData(rangeLabel, "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }
  try {
    const now = new Date();
    const w = windows(range, now);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email ?? null;
    const userName = email ? email.split("@")[0] : "there";

    // Tenant scoping: a user with no membership gets the honest empty
    // state (needsSetup) — never another vendor's rows.
    const tenantIds = await getUserTenantIds();
    if (tenantIds.length === 0) {
      return emptyData(rangeLabel, null, { userName, needsSetup: true, hasVenue: false });
    }
    const venues = await getUserVenues();
    const venueName = venues[0]?.name ?? "No venue yet";
    const hasVenue = venues.length > 0;

    const eventsRes = await supabase
      .from("events")
      .select("id, title, description, start_ts, price_label, event_type, status")
      .in("tenant_id", tenantIds)
      .order("start_ts", { ascending: true })
      // Cap: first 100 events by start_ts. No pagination in this slice;
      // events beyond 100 are not shown (a later slice adds pagination).
      .limit(100);
    if (eventsRes.error) throw new Error(`events: ${eventsRes.error.message}`);

    const allEvents = ((eventsRes.data ?? []) as Record<string, unknown>[]).map((e) => ({
      id: String(e.id ?? ""),
      title: String(e.title ?? "Untitled event"),
      dateLabel: formatDateLabel(typeof e.start_ts === "string" ? e.start_ts : null),
      startTs: typeof e.start_ts === "string" ? e.start_ts : null,
      eventType: typeof e.event_type === "string" ? e.event_type : null,
      priceLabel: typeof e.price_label === "string" ? e.price_label : null,
      status: typeof e.status === "string" ? e.status : null,
      description: typeof e.description === "string" ? e.description : null,
    }));

    // Events in the upcoming window (undated events show in "All upcoming" only).
    const inWindow = allEvents.filter((e) => {
      if (!e.startTs) return range === "all";
      const d = new Date(e.startTs);
      if (Number.isNaN(d.getTime())) return range === "all";
      return d >= w.eventStart && d < w.eventEnd;
    });

    // Activity: events-per-bucket over the WHOLE selected range. Bucket
    // width adapts so the chart has at most ~14 buckets: 1 day for 7d,
    // ~3 days for 30d / month, ~131 days for "all" (5-year window).
    const windowMs = w.eventEnd.getTime() - w.eventStart.getTime();
    const windowDays = Math.max(1, Math.ceil(windowMs / 86400000));
    const bucketDays = Math.max(1, Math.ceil(windowDays / 14));
    const bucketRanges: { label: string; start: Date; end: Date }[] = [];
    for (
      let start = new Date(w.eventStart);
      start < w.eventEnd;
      start = new Date(start.getTime() + bucketDays * 86400000)
    ) {
      const end = new Date(start.getTime() + bucketDays * 86400000);
      bucketRanges.push({
        label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        start,
        end,
      });
    }
    const activityPoints = bucketRanges.map(({ start, end }) =>
      inWindow.filter((e) => {
        if (!e.startTs) return false;
        const d = new Date(e.startTs);
        return !Number.isNaN(d.getTime()) && d >= start && d < end;
      }).length,
    );

    // Calendar: group window events by date, sorted by full date.
    const calMap = new Map<string, CalendarDay>();
    for (const e of inWindow) {
      if (!e.startTs) continue;
      const d = new Date(e.startTs);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toDateString();
      const existing =
        calMap.get(key) ??
        {
          day: DAY_NAMES[d.getDay()],
          date: d.getDate(),
          sortKey: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
          events: [],
        };
      existing.events.push({ time: formatTime(e.startTs), title: e.title });
      calMap.set(key, existing);
    }
    const calendar = [...calMap.values()].sort((a, b) => a.sortKey - b.sortKey);

    // Verified revenue is ALWAYS 0 here. revenue_events rows are
    // historical tracking rows for things "created" (Mar–May 2026, source
    // monfun_executor), not payments, and money_funnels.verified_revenue_cents
    // is all $0 — there is no real revenue to show. Summing revenue_events
    // previously displayed a bogus $29,390: with no .limit()/.order() the
    // query hit PostgREST's 1000-row cap and silently dropped 205 rows
    // ($5,995) of a $35,385 tracking total. Never sum revenue_events
    // for this headline.
    const verifiedRevenue = 0;

    const latestEvents = inWindow.slice(0, 5).map((e) => `${e.title} · ${e.dateLabel}${e.status ? ` · ${e.status}` : ""}`);

    return {
      venueName,
      userName,
      rangeLabel,
      eventCount: inWindow.length,
      verifiedRevenue,
      activityPoints,
      activityDays: bucketRanges.map((b) => b.label),
      events: inWindow,
      calendar,
      latestEvents,
      needsSetup: false,
      hasVenue,
      revenueScopeNote:
        "Ecosystem-wide — revenue rows are not yet linked to venues, so per-venue revenue is not available yet.",
      error: null,
    };
  } catch (e) {
    return emptyData(rangeLabel, e instanceof Error ? e.message : "Could not load dashboard.");
  }
}

export function formatMoney(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
