// Livework+ Insights — Monfun lives here (Phase 5).
// Funnels are real `funnels` rows (name + backend status), each pressable
// to the phase-a-ui Funnels tab. Revenue is verified-only
// (revenue_events amount > 0) with a real 7/30/90-day picker. The fake
// The fake demo revenue figure, demo funnels, and fake 8.5 relationship score are deleted.
// The Relationship card is an honest empty state (no scoring model yet).
// Requires phase-a-ui Auth (<AuthProvider> in app/_layout.tsx) and the
// phase-a-ui Funnels tab at /(tabs)/funnels.
// Phase 8 Slice 1: Insights is operator-gated via <ForgeGate> (same
// check as the Forge tabs) — a signed-in non-operator sees
// "Forge is for operators", never funnel names or verified revenue.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Sparkline from "../../components/Sparkline";
import ForgeGate from "../../components/ForgeGate";
import { THEME, FUNNEL_ACCENTS } from "../../lib/theme";
import {
  fetchFunnels,
  fetchMoneyFunnels,
  fetchRevenue,
  formatMoney,
  resolveCanonicalFunnels,
  type FunnelSummary,
  type MoneyFunnelSummary,
  type RevenueSummary,
} from "../../lib/data";

const RANGE_OPTIONS = [7, 30, 90];

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const color =
    s === "ACTIVE"
      ? THEME.green
      : s === "VALIDATED" || s === "READY"
        ? THEME.blue
        : s === "PAUSED" || s === "APPROVAL_REQUIRED"
          ? THEME.orange
          : THEME.textMuted;
  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <Text style={[styles.statusText, { color }]}>{s}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  return (
    <ForgeGate>
      <InsightsContent />
    </ForgeGate>
  );
}

function InsightsContent() {
  const router = useRouter();
  const [funnels, setFunnels] = useState<FunnelSummary[]>([]);
  const [revenue, setRevenue] = useState<RevenueSummary>({ total: 0, changeLabel: null, spark: [] });
  const [moneyFunnels, setMoneyFunnels] = useState<MoneyFunnelSummary[]>([]);
  const [rangeDays, setRangeDays] = useState(30);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [f, r, m] = await Promise.all([
      fetchFunnels(),
      fetchRevenue(rangeDays),
      fetchMoneyFunnels(),
    ]);
    if (f.error) setError(f.error);
    if (r.error) setError((prev) => prev ?? r.error);
    if (m.error) setError((prev) => prev ?? m.error);
    setFunnels(f.funnels);
    setRevenue(r.revenue);
    setMoneyFunnels(m.rows);
    setLoading(false);
  }, [rangeDays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Canonical structure (2026-10-21 remap): 8 funnels — sub-rows nested
  // under their parent, the legacy KC Content row excluded entirely.
  const views = useMemo(
    () => resolveCanonicalFunnels(funnels, moneyFunnels),
    [funnels, moneyFunnels],
  );

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Funnel Overview — real funnels */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Funnel Overview</Text>
              <Text style={styles.cardSub}>Track all your funnels in one place.</Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/funnels")}>
              <Text style={styles.viewAll}>View All Funnels ›</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={THEME.purpleBright} />
          ) : views.length === 0 ? (
            <Text style={styles.empty}>No funnels yet.</Text>
          ) : (
            <View style={styles.funnelGrid}>
              {views.map((view, i) => {
                const f = view.funnel;
                const accents = Object.values(FUNNEL_ACCENTS)[i % Object.values(FUNNEL_ACCENTS).length];
                return (
                  <Pressable
                    key={f.id}
                    style={styles.funnelTile}
                    onPress={() => router.push("/(tabs)/funnels")}
                  >
                    <View style={[styles.funnelIcon, { backgroundColor: `${accents.color}26` }]}>
                      <Ionicons name={accents.icon as never} size={22} color={accents.color} />
                    </View>
                    <Text style={styles.funnelTitle} numberOfLines={2}>{f.name}</Text>
                    <StatusBadge status={f.status} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Revenue Overview — verified revenue only */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Revenue Overview</Text>
              <Text style={styles.cardSub}>Verified revenue across your funnels.</Text>
            </View>
            <Pressable style={styles.rangeBtn} onPress={() => setRangePickerOpen((v) => !v)}>
              <Text style={styles.rangeText}>Last {rangeDays} Days ⌄</Text>
            </Pressable>
          </View>

          {rangePickerOpen && (
            <View style={styles.picker}>
              {RANGE_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  style={styles.pickerRow}
                  onPress={() => {
                    setRangeDays(d);
                    setRangePickerOpen(false);
                  }}
                >
                  <Text style={[styles.pickerText, rangeDays === d && styles.pickerTextActive]}>
                    Last {d} Days
                  </Text>
                  {rangeDays === d && <Text style={styles.pickerCheck}>✓</Text>}
                </Pressable>
              ))}
            </View>
          )}

          {loading ? (
            <ActivityIndicator color={THEME.purpleBright} />
          ) : (
            <>
              <View style={styles.revenueRow}>
                <View>
                  <Text style={styles.revenueLabel}>Total Revenue</Text>
                  <Text style={styles.revenueTotal}>{formatMoney(revenue.total)}</Text>
                  {!!revenue.changeLabel && (
                    <Text style={styles.revenueDelta}>{revenue.changeLabel}</Text>
                  )}
                  {revenue.total === 0 && (
                    <Text style={styles.revenueDeltaSub}>No verified revenue in this window.</Text>
                  )}
                </View>
                {revenue.spark.some((p) => p > 0) ? (
                  <Sparkline points={revenue.spark} width={170} height={60} />
                ) : null}
              </View>
              <Text style={styles.revenueNote}>
                Verified revenue only — amount-0 rows are tracking, never revenue.
              </Text>
            </>
          )}
        </View>

        {/* Revenue reconciliation — per-funnel verified totals (money_funnels)
            against the ecosystem event-log total (revenue_events).
            revenue_events has NO funnel_id, so per-funnel attribution from
            the event log is impossible: the per-funnel rows below come from
            money_funnels only. The two ledgers may differ. */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Revenue Reconciliation</Text>
          <Text style={styles.cardSub}>
            Per-funnel verified totals vs the ecosystem event-log total.
          </Text>
          {loading ? (
            <ActivityIndicator color={THEME.purpleBright} />
          ) : views.length === 0 ? (
            <Text style={styles.empty}>No funnels yet.</Text>
          ) : (
            <>
              {(() => {
                let verifiedSum = 0;
                let targetSum = 0;
                for (const view of views) {
                  verifiedSum += view.verifiedCents / 100;
                  targetSum += (view.targetCents ?? 0) / 100;
                }
                return (
                  <>
                    {views.map((view) => {
                      const verified = view.verifiedCents / 100;
                      const target =
                        view.targetCents !== null ? view.targetCents / 100 : null;
                      const pct =
                        target && target > 0 ? Math.min(100, (verified / target) * 100) : null;
                      return (
                        <View key={view.funnel.id} style={styles.reconRow}>
                          <View style={styles.reconNameWrap}>
                            <Text style={styles.reconName} numberOfLines={2}>
                              {view.funnel.name}
                            </Text>
                            {view.subFunnels.length > 0 && (
                              <Text style={styles.reconIncludes} numberOfLines={2}>
                                Includes{" "}
                                {view.subFunnels.map((s) => s.name).join(", ")}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.reconNumbers}>
                            {formatMoney(verified)} of{" "}
                            {target !== null ? formatMoney(target) : "no target"}
                            {pct !== null ? ` · ${pct.toFixed(1)}%` : ""}
                          </Text>
                        </View>
                      );
                    })}
                    <View style={[styles.reconRow, styles.reconTotalRow]}>
                      <Text style={styles.reconName}>All funnels</Text>
                      <Text style={styles.reconNumbers}>
                        {formatMoney(verifiedSum)} of{" "}
                        {targetSum > 0 ? formatMoney(targetSum) : "no targets"}
                        {targetSum > 0
                          ? ` · ${Math.min(100, (verifiedSum / targetSum) * 100).toFixed(1)}%`
                          : ""}
                      </Text>
                    </View>
                  </>
                );
              })()}
              <Text style={styles.reconEcosystem}>
                Ecosystem event-log total (last {rangeDays} days):{" "}
                {formatMoney(revenue.total)}
              </Text>
              <Text style={styles.revenueNote}>
                The two ledgers may differ: money_funnels verified totals are the funnel
                ledger; revenue_events is the raw event log (windowed above). Verified
                revenue only — nothing projected or estimated is shown as earned.
              </Text>
            </>
          )}
        </View>

        {/* Relationship Score — no scoring model exists yet */}
        <View style={styles.card}>
          <Text style={styles.relTitle}>Relationship Score</Text>
          <Text style={styles.relSub}>
            Not calculated yet. Scoring needs the connections data model (not yet built).
          </Text>
        </View>

        {!!error && (
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void refresh()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 12 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 16 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  cardSub: { color: THEME.textMuted, fontSize: 12, marginTop: 3 },
  viewAll: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
  funnelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  funnelTile: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  funnelIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  funnelTitle: { color: "#fff", fontSize: 12, fontWeight: "800", textAlign: "center" },
  statusBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "900" },
  rangeBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rangeText: { color: THEME.textMuted, fontSize: 11, fontWeight: "800" },
  picker: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerText: { color: THEME.textMuted, fontSize: 13, fontWeight: "700" },
  pickerTextActive: { color: "#fff" },
  pickerCheck: { color: THEME.green, fontSize: 13, fontWeight: "900" },
  revenueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  revenueLabel: { color: THEME.textMuted, fontSize: 12 },
  revenueTotal: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 2 },
  revenueDelta: { color: THEME.green, fontSize: 13, fontWeight: "800", marginTop: 4 },
  revenueDeltaSub: { color: THEME.textFaint, fontSize: 11, marginTop: 4 },
  revenueNote: { color: THEME.textFaint, fontSize: 11, marginTop: 10, lineHeight: 15 },
  reconRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  reconTotalRow: { borderBottomWidth: 0, marginTop: 4 },
  reconNameWrap: { flex: 1 },
  reconName: { color: "#fff", fontSize: 13, fontWeight: "700" },
  reconIncludes: { color: THEME.textFaint, fontSize: 11, marginTop: 2 },
  reconNumbers: { color: THEME.textMuted, fontSize: 12, textAlign: "right" },
  reconEcosystem: { color: THEME.textMuted, fontSize: 12, marginTop: 10, fontWeight: "700" },
  relTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  relSub: { color: THEME.textMuted, fontSize: 12, marginTop: 6, lineHeight: 17 },
  empty: { color: THEME.textMuted, fontSize: 13 },
  errorCard: { borderColor: "rgba(236,72,153,0.5)" },
  errorText: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  retryText: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
});
