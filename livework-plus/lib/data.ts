// Livework+ data layer (Insights: funnels + verified revenue) — Phase 5.
// Live Supabase queries ONLY. No demo funnel / revenue / relationship
// fallbacks. Revenue is verified-only: revenue_events rows with
// amount > 0 (amount-0 rows are tracking, never revenue).
import { supabase } from "./supabase";

export type FunnelSummary = {
  id: string;
  name: string;
  status: string;
  /** Parent funnel id for sub-rows (config.parent_funnel), else null. */
  parentFunnelId: string | null;
  /**
   * True for legacy rows (metadata.registry_note set by the 2026-10-21
   * Monfun remap): kept in the database for history, NOT a funnel —
   * never list it as one and never count its money rows.
   */
  isLegacy: boolean;
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
      .select("id, name, status, config, metadata")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const funnels = ((data ?? []) as Record<string, unknown>[]).map((f) => {
      const cfg = (f.config ?? null) as Record<string, unknown> | null;
      const meta = (f.metadata ?? null) as Record<string, unknown> | null;
      return {
        id: String(f.id ?? ""),
        name: String(f.name ?? "Unnamed funnel"),
        status: String(f.status ?? "draft"),
        parentFunnelId:
          cfg && typeof cfg.parent_funnel === "string" ? cfg.parent_funnel : null,
        isLegacy: Boolean(
          meta && typeof meta.registry_note === "string" && meta.registry_note.length > 0,
        ),
      };
    });
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
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** money_funnels rows for the per-funnel revenue breakdown (Insights). */
export type MoneyFunnelSummary = {
  id: string;
  key: string | null;
  name: string | null;
  funnel_id: string | null;
  revenue_model: string | null;
  verified_revenue_cents: number | null;
  metadata: Record<string, unknown> | null;
};

export async function fetchMoneyFunnels(): Promise<{
  rows: MoneyFunnelSummary[];
  error: string | null;
}> {
  if (!supabase) {
    return { rows: [], error: "Supabase is not configured." };
  }
  try {
    const { data, error } = await supabase
      .from("money_funnels")
      .select("id, key, name, funnel_id, revenue_model, verified_revenue_cents, metadata")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id ?? ""),
      key: typeof r.key === "string" ? r.key : null,
      name: typeof r.name === "string" ? r.name : null,
      funnel_id: typeof r.funnel_id === "string" ? r.funnel_id : null,
      revenue_model: typeof r.revenue_model === "string" ? r.revenue_model : null,
      verified_revenue_cents: typeof r.verified_revenue_cents === "number" ? r.verified_revenue_cents : null,
      metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    }));
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Could not load money funnels." };
  }
}

// ---------- Canonical funnel structure (2026-10-21 Monfun remap) ----------
// The database holds 12 funnels rows but only 8 canonical funnels:
// sub-rows hang off a canonical funnel via config.parent_funnel, and one
// legacy row (KC Content Money Funnel) carries metadata.registry_note and
// is not a funnel at all. Money is 1:1 per funnel family: a canonical
// funnel's money family is every money_funnels row whose funnel_id is the
// funnel itself or one of its sub-rows, and the canonical money row is
// the one carrying the monthly target (metadata.revenue_target_cents) —
// e.g. Social Content + SEO's target lives on its SEO sub-row's backfill
// mirror, not on the short_form_content alternate. Only the canonical
// rows feed totals, so a dollar is never counted twice and the legacy
// row never counts at all.

/** Monthly target (cents) from a money row's metadata, or null. */
export function moneySummaryTargetCents(row: MoneyFunnelSummary): number | null {
  const v = row.metadata?.revenue_target_cents;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export type CanonicalFunnelView = {
  funnel: FunnelSummary;
  subFunnels: FunnelSummary[];
  /** Every money row in the family (canonical funnel + its sub-rows). */
  moneyRows: MoneyFunnelSummary[];
  /** The family's canonical money row (the target-carrying row wins). */
  money: MoneyFunnelSummary | null;
  targetCents: number | null;
  /** Verified revenue (cents) from the canonical money row only. */
  verifiedCents: number;
};

export function resolveCanonicalFunnels(
  funnels: FunnelSummary[],
  moneyRows: MoneyFunnelSummary[],
): CanonicalFunnelView[] {
  const live = funnels.filter((f) => !f.isLegacy);
  const liveIds = new Set(live.map((f) => f.id));
  const subsByParent = new Map<string, FunnelSummary[]>();
  const canonical: FunnelSummary[] = [];
  for (const f of live) {
    if (f.parentFunnelId && f.parentFunnelId !== f.id && liveIds.has(f.parentFunnelId)) {
      const list = subsByParent.get(f.parentFunnelId) ?? [];
      list.push(f);
      subsByParent.set(f.parentFunnelId, list);
    } else {
      canonical.push(f);
    }
  }
  return canonical.map((funnel) => {
    const subFunnels = subsByParent.get(funnel.id) ?? [];
    const familyIds = new Set([funnel.id, ...subFunnels.map((s) => s.id)]);
    const family = moneyRows.filter(
      (r) => r.funnel_id !== null && familyIds.has(r.funnel_id),
    );
    const money =
      family.find((r) => moneySummaryTargetCents(r) !== null) ??
      family.find((r) => (r.key ?? "").startsWith("backfill_")) ??
      family[0] ??
      null;
    return {
      funnel,
      subFunnels,
      moneyRows: family,
      money,
      targetCents: money ? moneySummaryTargetCents(money) : null,
      verifiedCents: money?.verified_revenue_cents ?? 0,
    };
  });
}

/** The canonical money rows only — one per canonical funnel — for totals. */
export function canonicalMoneySummaries(
  funnels: FunnelSummary[],
  moneyRows: MoneyFunnelSummary[],
): MoneyFunnelSummary[] {
  return resolveCanonicalFunnels(funnels, moneyRows)
    .map((v) => v.money)
    .filter((m): m is MoneyFunnelSummary => m !== null);
}
