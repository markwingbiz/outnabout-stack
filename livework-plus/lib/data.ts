// Livework+ data layer (Insights: funnels + verified revenue) — Phase 5.
// Live Supabase queries ONLY. No demo funnel / revenue / relationship
// fallbacks. Revenue is verified-only: revenue_events rows with
// amount > 0 (amount-0 rows are tracking, never revenue).
import { supabase } from "./supabase";

export type FunnelSummary = {
  id: string;
  name: string;
  status: string;
};

export type RevenueSummary = {
  /** Sum of revenue_events.amount in the window. Treated as dollars (see note). */
  total: number;
  /** Change vs the prior equal-length window, or null when not computable. */
  changeLabel: string | null;
  /** Per-day verified revenue (dollars) across the window, oldest → newest. */
  spark: number[];
};

export async function fetchFunnels(): Promise<{ funnels: FunnelSummary[]; error: string | null }> {
  if (!supabase) {
    return { funnels: [], error: "Supabase is not configured." };
  }
  try {
    const { data, error } = await supabase
      .from("funnels")
      .select("id, name, status")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const funnels = ((data ?? []) as Record<string, unknown>[]).map((f) => ({
      id: String(f.id ?? ""),
      name: String(f.name ?? "Unnamed funnel"),
      status: String(f.status ?? "draft"),
    }));
    return { funnels, error: null };
  } catch (e) {
    return { funnels: [], error: e instanceof Error ? e.message : "Could not load funnels." };
  }
}

// revenue_events.amount is treated as dollars, matching the prior display
// code. If the table stores cents, divide by 100 here.
export async function fetchRevenue(rangeDays: number): Promise<{ revenue: RevenueSummary; error: string | null }> {
  const empty: RevenueSummary = { total: 0, changeLabel: null, spark: [] };
  if (!supabase) {
    return { revenue: empty, error: "Supabase is not configured." };
  }
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const priorStart = new Date(windowStart.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const [cur, prev] = await Promise.all([
      supabase
        .from("revenue_events")
        .select("amount, occurred_at")
        .gt("amount", 0)
        .gte("occurred_at", windowStart.toISOString())
        .lte("occurred_at", now.toISOString()),
      supabase
        .from("revenue_events")
        .select("amount")
        .gt("amount", 0)
        .gte("occurred_at", priorStart.toISOString())
        .lt("occurred_at", windowStart.toISOString()),
    ]);
    if (cur.error) throw new Error(cur.error.message);
    if (prev.error) throw new Error(prev.error.message);

    const rows = ((cur.data ?? []) as { amount?: unknown; occurred_at?: unknown }[]).map((r) => ({
      amount: typeof r.amount === "number" ? r.amount : 0,
      at: typeof r.occurred_at === "string" ? new Date(r.occurred_at) : null,
    }));
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    const prevTotal = ((prev.data ?? []) as { amount?: unknown }[]).reduce(
      (sum, r) => sum + (typeof r.amount === "number" ? r.amount : 0),
      0,
    );
    const changeLabel =
      prevTotal > 0
        ? `${total >= prevTotal ? "+" : ""}${Math.round(((total - prevTotal) / prevTotal) * 100)}% vs prior ${rangeDays} days`
        : total > 0
          ? "New — no prior-period revenue"
          : null;

    // Per-day buckets, oldest → newest.
    const spark = Array.from({ length: rangeDays }, () => 0);
    for (const r of rows) {
      if (!r.at || Number.isNaN(r.at.getTime())) continue;
      const idx = Math.floor((r.at.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000));
      if (idx >= 0 && idx < rangeDays) spark[idx] += r.amount;
    }
    return { revenue: { total, changeLabel, spark }, error: null };
  } catch (e) {
    return { revenue: empty, error: e instanceof Error ? e.message : "Could not load revenue." };
  }
}

export function formatMoney(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
