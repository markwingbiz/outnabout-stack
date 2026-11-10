// Livework demo mode — operator-only showcase data for showing Livework
// to someone. This is the ONLY place demo/sample data lives in
// Livework. Rules (standing):
// - Operator-only: the toggle renders only when the signed-in email is
//   the operator email (see isOperatorEmail in lib/data.ts).
// - Never mixed: demo mode REPLACES the whole dashboard view with this
//   bundled dataset. Real queries never run while demo is on, and demo
//   rows never enter real counts.
// - Never counted: demo revenue is $0 with an honest note. Projections,
//   Audience Insights, and Smart Suggestions keep their honest empty
//   states even in demo (no invented forecasts/demographics/tips).
// - Never actionable: demo rows have no Edit/Delete, can't be
//   published, and can't be exported. Demo event ids use the `demo-`
//   prefix so no demo id can ever collide with a real row id.
// - Session-only: the toggle is in-memory state on the dashboard
//   screen. Every fresh open starts on REAL data.
import type { CalendarDay, DashboardData, DashboardEvent, RangeKey } from "./data";

/** Operator email — the ONLY account that ever sees the demo toggle. */
export const OPERATOR_EMAIL = "mr.marshall3@yahoo.com";

export function isOperatorEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === OPERATOR_EMAIL;
}

export const DEMO_VENUE_COUNT = 3;
export const DEMO_REDEMPTION_COUNT = 14;

type SampleEvent = {
  id: string;
  title: string;
  /** Days from today. */
  dayOffset: number;
  hour: number;
  minute: number;
  eventType: string;
  priceLabel: string;
  status: string;
  description: string;
};

// Sample events spread across the next 30 days so every range chip
// (Next 7 days / Next 30 days / This month / All upcoming) shows a
// populated dashboard. Dates are computed from today at build time so
// the demo never goes stale.
const SAMPLE_EVENTS: SampleEvent[] = [
  { id: "demo-1", title: "Jazz + Cocktails", dayOffset: 0, hour: 20, minute: 0, eventType: "Live music", priceLabel: "$15", status: "published", description: "Sample event — demo data, not a real listing." },
  { id: "demo-2", title: "Indie Fridays", dayOffset: 1, hour: 19, minute: 30, eventType: "Live music", priceLabel: "$12", status: "published", description: "Sample event — demo data, not a real listing." },
  { id: "demo-3", title: "Rooftop Sunset Social", dayOffset: 2, hour: 18, minute: 0, eventType: "Social", priceLabel: "Free", status: "published", description: "Sample event — demo data, not a real listing." },
  { id: "demo-4", title: "KC Comedy Cabaret", dayOffset: 3, hour: 20, minute: 0, eventType: "Comedy", priceLabel: "$20", status: "published", description: "Sample event — demo data, not a real listing." },
  { id: "demo-5", title: "Vinyl Night", dayOffset: 4, hour: 21, minute: 0, eventType: "DJ", priceLabel: "$10", status: "draft", description: "Sample event — demo data, not a real listing." },
  { id: "demo-6", title: "Family Fun Saturday", dayOffset: 5, hour: 11, minute: 0, eventType: "Family", priceLabel: "Free", status: "published", description: "Sample event — demo data, not a real listing." },
  { id: "demo-7", title: "Songwriter Circle", dayOffset: 6, hour: 19, minute: 0, eventType: "Live music", priceLabel: "$8", status: "published", description: "Sample event — demo data, not a real listing." },
  { id: "demo-8", title: "Trivia Night", dayOffset: 8, hour: 19, minute: 30, eventType: "Games", priceLabel: "$5", status: "published", description: "Sample event — demo data, not a real listing." },
  { id: "demo-9", title: "First Friday Art Walk", dayOffset: 10, hour: 18, minute: 0, eventType: "Arts", priceLabel: "Free", status: "published", description: "Sample event — demo data, not a real listing." },
  { id: "demo-10", title: "Blues & BBQ", dayOffset: 13, hour: 17, minute: 0, eventType: "Food + Music", priceLabel: "$18", status: "draft", description: "Sample event — demo data, not a real listing." },
  { id: "demo-11", title: "Open Mic Night", dayOffset: 17, hour: 20, minute: 0, eventType: "Open mic", priceLabel: "Free", status: "published", description: "Sample event — demo data, not a real listing." },
  { id: "demo-12", title: "Fall Harvest Market", dayOffset: 24, hour: 10, minute: 0, eventType: "Market", priceLabel: "Free", status: "published", description: "Sample event — demo data, not a real listing." },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function windows(range: RangeKey, now: Date): { eventStart: Date; eventEnd: Date } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "7d") {
    const end = new Date(startOfToday);
    end.setDate(end.getDate() + 7);
    return { eventStart: startOfToday, eventEnd: end };
  }
  if (range === "30d") {
    const end = new Date(startOfToday);
    end.setDate(end.getDate() + 30);
    return { eventStart: startOfToday, eventEnd: end };
  }
  if (range === "month") {
    return {
      eventStart: new Date(now.getFullYear(), now.getMonth(), 1),
      eventEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return { eventStart: startOfToday, eventEnd: new Date(now.getFullYear() + 5, 0, 1) };
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Next 7 days",
  "30d": "Next 30 days",
  month: "This month",
  all: "All upcoming",
};

/**
 * Build a DashboardData from the bundled sample dataset for the given
 * range. Mirrors fetchDashboard's windowing/bucketing/calendar math so
 * the demo behaves like the real dashboard — but reads nothing from
 * Supabase and never touches real rows.
 */
export function buildDemoDashboard(range: RangeKey, userName: string): DashboardData {
  const now = new Date();
  const w = windows(range, now);

  const allEvents: DashboardEvent[] = SAMPLE_EVENTS.map((e) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + e.dayOffset, e.hour, e.minute);
    return {
      id: e.id,
      title: e.title,
      dateLabel: formatDateLabel(d),
      startTs: d.toISOString(),
      eventType: e.eventType,
      priceLabel: e.priceLabel,
      status: e.status,
      description: e.description,
    };
  }).sort((a, b) => (a.startTs ?? "").localeCompare(b.startTs ?? ""));

  const inWindow = allEvents.filter((e) => {
    if (!e.startTs) return range === "all";
    const d = new Date(e.startTs);
    if (Number.isNaN(d.getTime())) return range === "all";
    return d >= w.eventStart && d < w.eventEnd;
  });

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
    existing.events.push({ id: e.id, time: formatTime(d), title: e.title });
    calMap.set(key, existing);
  }
  const calendar = [...calMap.values()].sort((a, b) => a.sortKey - b.sortKey);

  const latestEvents = inWindow.slice(0, 5).map((e) => `${e.title} · ${e.dateLabel}${e.status ? ` · ${e.status}` : ""}`);

  return {
    venueName: "Demo Showcase",
    userName,
    rangeLabel: RANGE_LABELS[range],
    eventCount: inWindow.length,
    // Demo revenue is ALWAYS $0: demo data must never be presented as
    // earnings, even in showcase mode.
    verifiedRevenue: 0,
    activityPoints,
    activityDays: bucketRanges.map((b) => b.label),
    events: inWindow,
    calendar,
    latestEvents,
    needsSetup: false,
    hasVenue: true,
    revenueScopeNote: "Demo data — revenue always shows real verified revenue only.",
    error: null,
  };
}
