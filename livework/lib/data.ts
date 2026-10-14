// Livework dashboard data layer.
// Reads from the Supabase `outnabout-stack` schema when configured
// (venues, events, venue_redemptions). Falls back to demo values matching
// the supplied dashboard mockup (venue "The Brickhouse") while the
// tables are empty.
import { supabase } from "./supabase";

export type Kpi = { label: string; value: string; delta: string };

export type TopEvent = {
  title: string;
  date: string;
  revenue: string;
  tickets: string;
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
  kpis: Kpi[];
  activity: { views: number[]; tickets: number[]; revenue: number[] };
  activityDays: string[];
  projections: { label: string; value: string; delta: string }[];
  topEvents: TopEvent[];
  ageRanges: { label: string; pct: number; color: string }[];
  topLocations: { name: string; pct: number }[];
  topInterests: string[];
  calendar: CalendarDay[];
  suggestions: string[];
  recentActivity: string[];
};

export const DEMO: DashboardData = {
  venueName: "The Brickhouse",
  userName: "Alex",
  rangeLabel: "May 12 – May 18, 2024",
  kpis: [
    { label: "Tickets Sold", value: "1,243", delta: "↑ 12% from last 7 days" },
    { label: "Total Revenue", value: "$23,892", delta: "↑ 18% from last 7 days" },
    { label: "Avg. Ticket Price", value: "$34.50", delta: "↑ 23% from last 7 days" },
    { label: "Attendance Rate", value: "89%", delta: "↑ 7% from last 7 days" },
  ],
  activity: {
    views: [42, 55, 48, 66, 72, 78, 90],
    tickets: [30, 38, 34, 52, 58, 64, 74],
    revenue: [22, 28, 26, 40, 46, 52, 62],
  },
  activityDays: ["May 12", "May 13", "May 14", "May 15", "May 16", "May 17", "May 18"],
  projections: [
    { label: "Projected Revenue", value: "$28,400", delta: "↑ 12% vs last week" },
    { label: "Projected Tickets", value: "1,580", delta: "↑ 15% vs last week" },
    { label: "Projected Attendance", value: "1,420", delta: "↑ 10% vs last week" },
  ],
  topEvents: [
    { title: "Indie Fridays", date: "May 10, 2024", revenue: "$4,560", tickets: "298 tickets" },
    { title: "Neon Nights", date: "May 17, 2024", revenue: "$3,972", tickets: "213 tickets" },
    { title: "The Local Showcase", date: "May 5, 2024", revenue: "$2,945", tickets: "165 tickets" },
    { title: "Hip Hop Essentials", date: "May 8, 2024", revenue: "$2,310", tickets: "142 tickets" },
    { title: "Acoustic Sundays", date: "May 5, 2024", revenue: "$1,890", tickets: "118 tickets" },
  ],
  ageRanges: [
    { label: "18-24", pct: 28, color: "#8B5CF6" },
    { label: "25-34", pct: 42, color: "#38BDF8" },
    { label: "35-44", pct: 22, color: "#34D399" },
    { label: "45+", pct: 13, color: "#F59E0B" },
  ],
  topLocations: [
    { name: "Brooklyn, NY", pct: 42 },
    { name: "Manhattan, NY", pct: 28 },
    { name: "Queens, NY", pct: 22 },
    { name: "Other", pct: 18 },
  ],
  topInterests: ["Live Music", "Hip Hop", "Indie", "Electronic", "Local Events"],
  calendar: [
    { day: "Sun", date: 12, events: [{ time: "2:00 PM", title: "Acoustic Sundays" }] },
    { day: "Mon", date: 13, events: [{ time: "7:00 PM", title: "Open Mic Night" }] },
    { day: "Tue", date: 14, events: [{ time: "8:00 PM", title: "Jazz Tuesday" }] },
    { day: "Wed", date: 15, events: [{ time: "7:00 PM", title: "Live Band Karaoke" }] },
    { day: "Thu", date: 16, events: [{ time: "8:00 PM", title: "Indie Spotlight" }] },
    { day: "Fri", date: 17, events: [{ time: "9:00 PM", title: "Neon Nights" }] },
    { day: "Sat", date: 18, events: [{ time: "9:00 PM", title: "Hip Hop Essentials" }] },
  ],
  suggestions: [
    "Try indie acts on Fridays — they draw your largest crowds.",
    "Weekend shows are 40% more profitable than weekday shows.",
    "Add merch to boost per-attendee revenue.",
    "Venues like you add a second show on Saturdays.",
  ],
  recentActivity: [
    "Neon Nights updated — capacity raised to 300.",
    "New ticket sale — 4 tickets for Indie Fridays.",
    "Indie Fridays published to Bownd.",
    "Payout completed — $2,140 to The Brickhouse.",
  ],
};

export async function fetchDashboard(): Promise<DashboardData> {
  if (!supabase) return DEMO;
  try {
    const { data, error } = await supabase
      .from("venues")
      .select("id, name")
      .limit(1)
      .maybeSingle();
    if (error || !data) return DEMO;
    // A real venue exists — use its name, keep the demo metrics until
    // the events/redemptions tables are populated.
    return { ...DEMO, venueName: data.name };
  } catch {
    return DEMO;
  }
}
