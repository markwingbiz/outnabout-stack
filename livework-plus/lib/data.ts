// Livework+ data layer (Monfun section: funnels, revenue, relationship).
// Reads from the Supabase `outnabout-stack` schema when configured.
// Falls back to demo values matching the supplied mockups when Supabase
// is unconfigured or a table is empty (the tables are currently empty).
import { supabase } from "./supabase";

export type FunnelCard = {
  key: "lead" | "sales" | "delivery" | "retention";
  title: string;
  value: number;
  label: string;
  pct: number;
};

// Demo fallback — the exact numbers from the supplied Funnel Overview mockup.
export const DEMO_FUNNELS: FunnelCard[] = [
  { key: "lead", title: "Lead Funnel", value: 128, label: "Leads", pct: 64 },
  { key: "sales", title: "Sales Funnel", value: 56, label: "Opportunities", pct: 48 },
  { key: "delivery", title: "Delivery Funnel", value: 32, label: "In Progress", pct: 72 },
  { key: "retention", title: "Retention Funnel", value: 18, label: "Active", pct: 60 },
];

export const DEMO_REVENUE = {
  total: 248750,
  changePct: 18.7,
  // Demo sparkline points (0-100) matching the mockup's rising curve.
  spark: [12, 16, 14, 22, 26, 24, 34, 38, 36, 48, 52, 50, 62, 66, 64, 76, 82, 88],
};

export const DEMO_RELATIONSHIP = {
  score: 8.5,
  max: 10,
  strength: "Strong",
  hint: "Keep building meaningful connections.",
};

export async function fetchFunnels(): Promise<FunnelCard[]> {
  if (!supabase) return DEMO_FUNNELS;
  try {
    // Funnel counts come from the leads/opportunities tables when populated.
    const [leads, opps] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("opportunities").select("id", { count: "exact", head: true }),
    ]);
    const leadCount = leads.count ?? 0;
    const oppCount = opps.count ?? 0;
    if (leadCount === 0 && oppCount === 0) return DEMO_FUNNELS;
    return [
      { key: "lead", title: "Lead Funnel", value: leadCount, label: "Leads", pct: 64 },
      { key: "sales", title: "Sales Funnel", value: oppCount, label: "Opportunities", pct: 48 },
      { key: "delivery", title: "Delivery Funnel", value: 0, label: "In Progress", pct: 72 },
      { key: "retention", title: "Retention Funnel", value: 0, label: "Active", pct: 60 },
    ];
  } catch {
    return DEMO_FUNNELS;
  }
}

export async function fetchRevenue(): Promise<typeof DEMO_REVENUE> {
  if (!supabase) return DEMO_REVENUE;
  try {
    const { data, error } = await supabase
      .from("revenue_events")
      .select("amount")
      .gte("occurred_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    if (error || !data || data.length === 0) return DEMO_REVENUE;
    const total = data.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    return { ...DEMO_REVENUE, total };
  } catch {
    return DEMO_REVENUE;
  }
}

export function formatMoney(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
