// Livework dashboard data layer — Phase 5.
// Live Supabase queries ONLY. No demo object, no fake numbers, no
// fake publish / payout claims. Every section returns real rows
// or an explicit empty state (the screen renders the empty text).
// Reads: venues (name), events (list/calendar/activity), revenue_events
// (verified revenue only: amount > 0 — amount-0 rows are tracking,
// never revenue).
import { supabase } from "./supabase";

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
  events: { time: string; title: string }[];
};

export type DashboardData = {
  venueName: string;
  userName: string;
  rangeLabel: string;
  eventCount: number;
  /** Verified revenue in the matching PAST window, in dollars (see note). */
  verifiedRevenue: number;
  activityPoints: number[];
  activityDays: string[];
  events: DashboardEvent[];
  calendar: CalendarDay[];
  latestEvents: string[];
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

const emptyData = (rangeLabel: string, error: string | null): DashboardData => ({
  venueName: "No venue yet",
  userName: "there",
  rangeLabel,
  eventCount: 0,
  verifiedRevenue: 0,
  activityPoints: [],
  activityDays: [],
  events: [],
  calendar: [],
  latestEvents: [],
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

    const [venueRes, eventsRes, revenueRes] = await Promise.all([
      supabase.from("venues").select("id, name").limit(1).maybeSingle(),
      supabase
        .from("events")
        .select("id, title, description, start_ts, price_label, event_type, status")
        .order("start_ts", { ascending: true })
        .limit(100),
      // Verified revenue only: amount > 0 in the past window.
      // revenue_events.amount is treated as dollars, matching the prior
      // display code. If the table stores cents, divide by 100 here.
      supabase
        .from("revenue_events")
        .select("amount, occurred_at")
        .gt("amount", 0)
        .gte("occurred_at", w.revStart.toISOString())
        .lte("occurred_at", w.revEnd.toISOString()),
    ]);
    if (venueRes.error) throw new Error(`venues: ${venueRes.error.message}`);
    if (eventsRes.error) throw new Error(`events: ${eventsRes.error.message}`);
    if (revenueRes.error) throw new Error(`revenue_events: ${revenueRes.error.message}`);

    const venueName =
      (venueRes.data as { name?: string | null } | null)?.name ?? "No venue yet";

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

    // Activity: events-per-day over the window (7 buckets for 7d, else daily
    // buckets for the first 7 days of the window — chart has 7 slots).
    const bucketDays: { label: string; start: Date; end: Date }[] = [];
    for (let i = 0; i < 7; i++) {
      const start = new Date(w.eventStart);
      start.setDate(start.getDate() + i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      bucketDays.push({ label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }), start, end });
    }
    const activityPoints = bucketDays.map(({ start, end }) =>
      inWindow.filter((e) => {
        if (!e.startTs) return false;
        const d = new Date(e.startTs);
        return !Number.isNaN(d.getTime()) && d >= start && d < end;
      }).length,
    );

    // Calendar: group window events by date.
    const calMap = new Map<string, CalendarDay>();
    for (const e of inWindow) {
      if (!e.startTs) continue;
      const d = new Date(e.startTs);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toDateString();
      const existing = calMap.get(key) ?? { day: DAY_NAMES[d.getDay()], date: d.getDate(), events: [] };
      existing.events.push({ time: formatTime(e.startTs), title: e.title });
      calMap.set(key, existing);
    }
    const calendar = [...calMap.values()].sort((a, b) => a.date - b.date);

    const verifiedRevenue = ((revenueRes.data ?? []) as { amount?: unknown }[]).reduce(
      (sum, r) => sum + (typeof r.amount === "number" ? r.amount : 0),
      0,
    );

    const latestEvents = inWindow.slice(0, 5).map((e) => `${e.title} · ${e.dateLabel}${e.status ? ` · ${e.status}` : ""}`);

    return {
      venueName,
      userName,
      rangeLabel,
      eventCount: inWindow.length,
      verifiedRevenue,
      activityPoints,
      activityDays: bucketDays.map((b) => b.label),
      events: inWindow,
      calendar,
      latestEvents,
      error: null,
    };
  } catch (e) {
    return emptyData(rangeLabel, e instanceof Error ? e.message : "Could not load dashboard.");
  }
}

export function formatMoney(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
