// Livework+ Home — Forge command center, rebuilt to the reference layout
// (Funnel Overview / Revenue Overview / Relationship Score / Talk to Forge /
// Forge sections hub).
//
// All figures come from real queries; nothing is invented:
// - Funnel cards: real `funnels` rows (name + backend status), first 4,
//   "View All Funnels" opens the full list.
// - Revenue: headline is the canonical money-funnel verified total
//   (money_funnels, one row per funnel — never double-counted). The chart
//   is the real revenue_events daily series for the last 30 days; when
//   every bucket is zero there is no chart, just an honest empty state.
//   No trend line or % change is invented (the change label comes from
//   fetchRevenue's real prior-window comparison, only when computable).
// - Relationship Score: the average rating of the recent real check-ins
//   (same up-to-8 window Connections uses), labelled as exactly that.
//   With no rated check-ins the card says so — never a fake score.
// - Talk to Forge links to the Forge screen, where the composer lives.
// - Forge sections hub links every screen the 5-tab bar no longer shows.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import TopTabs from "../../components/TopTabs";
import ForgeGate from "../../components/ForgeGate";
import Ring from "../../components/Ring";
import Sparkline from "../../components/Sparkline";
import { THEME, FUNNEL_ACCENTS } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import {
  canonicalMoneyRows,
  formatCents,
  isMissingTableError,
  normalizeStatus,
  type MoneyFunnelRow,
} from "../../lib/forge";
import {
  fetchFunnels,
  fetchRevenue,
  type FunnelSummary,
  type RevenueSummary,
} from "../../lib/data";

const CHECKIN_WINDOW = 8;
const GOAL_RATING = 8;

type HomeStats = {
  funnels: FunnelSummary[];
  jobsRunning: number;
  jobsFailed: number;
  pendingApprovals: number;
  workersActive: number;
  verifiedRevenueCents: number;
  revenue: RevenueSummary;
  relationshipAvg: number | null;
  relationshipCount: number;
  checkinsError: string | null;
};

const HUB: { label: string; icon: string; route: string; detail: (s: HomeStats) => string }[] = [
  {
    label: "Forge",
    icon: "flash",
    route: "/(tabs)/forge",
    detail: () => "Conversations + command composer",
  },
  {
    label: "Funnels",
    icon: "filter",
    route: "/(tabs)/funnels",
    detail: (s) => `${s.funnels.length} funnel${s.funnels.length === 1 ? "" : "s"}`,
  },
  {
    label: "Workers",
    icon: "construct",
    route: "/(tabs)/workers",
    detail: (s) => `${s.workersActive} active`,
  },
  {
    label: "Jobs",
    icon: "list",
    route: "/(tabs)/jobs",
    detail: (s) => `${s.jobsRunning} running / queued · ${s.jobsFailed} failed`,
  },
  {
    label: "Approvals",
    icon: "checkmark-circle",
    route: "/(tabs)/approvals",
    detail: (s) => `${s.pendingApprovals} pending`,
  },
  {
    label: "Deliverables",
    icon: "document-text",
    route: "/(tabs)/deliverables",
    detail: () => "Deliverables produced by Forge",
  },
  {
    label: "Audit Log",
    icon: "shield-check",
    route: "/(tabs)/audit-log",
    detail: () => "Every Forge action, audited",
  },
  {
    label: "Bownd",
    icon: "storefront",
    route: "/(tabs)/bownd",
    detail: () => "Bownd read-only view",
  },
  {
    label: "Suggestions",
    icon: "bulb",
    route: "/(tabs)/suggestions",
    detail: () => "Forge suggestions",
  },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <HomeContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function HomeContent() {
  const router = useRouter();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const [f, m, j, a, w, r] = await Promise.all([
        fetchFunnels(),
        supabase
          .from("money_funnels")
          .select("funnel_id,key,verified_revenue_cents")
          .limit(1000),
        supabase.from("forge_jobs").select("status").limit(1000),
        supabase
          .from("approvals")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase.from("workers").select("id,status").limit(1000),
        fetchRevenue(30),
      ]);
      if (f.error) throw new Error(f.error);
      if (m.error) throw new Error(m.error.message);
      if (j.error) throw new Error(j.error.message);
      if (a.error) throw new Error(a.error.message);
      if (w.error) throw new Error(w.error.message);
      if (r.error) throw new Error(r.error);

      const jobRows = (j.data ?? []) as { status: string }[];
      const jobsRunning = jobRows.filter(
        (row) =>
          normalizeStatus(row.status) === "RUNNING" || normalizeStatus(row.status) === "QUEUED",
      ).length;
      const jobsFailed = jobRows.filter((row) => normalizeStatus(row.status) === "FAILED").length;
      const workersActive = ((w.data ?? []) as { status: string | null }[]).filter(
        (row) => normalizeStatus(row.status) === "ACTIVE",
      ).length;
      // Verified revenue: sum the canonical money row per funnel (prefer the
      // backfill_* mirror) so funnels with several money rows are not
      // double-counted. Cents → dollars via formatCents.
      const canonical = canonicalMoneyRows((m.data ?? []) as MoneyFunnelRow[]);
      const verifiedRevenueCents = canonical.reduce(
        (sum, row) => sum + (row.verified_revenue_cents ?? 0),
        0,
      );

      // Relationship Score: average rating of the recent real check-ins.
      // A missing relationship table (migration not run) is an honest
      // empty state, not a Home failure; any other error is shown on the
      // card itself.
      let relationshipAvg: number | null = null;
      let relationshipCount = 0;
      let checkinsError: string | null = null;
      try {
        const { data, error: cError } = await supabase
          .from("relationship_checkins")
          .select("rating,checkin_date")
          .order("checkin_date", { ascending: false })
          .limit(100);
        if (cError) throw cError;
        const rated = ((data ?? []) as { rating: unknown }[])
          .map((row) => (typeof row.rating === "number" ? row.rating : null))
          .filter((v): v is number => v !== null)
          .slice(0, CHECKIN_WINDOW);
        relationshipCount = rated.length;
        if (rated.length > 0) {
          relationshipAvg = rated.reduce((sum, v) => sum + v, 0) / rated.length;
        }
      } catch (e) {
        if (!isMissingTableError(e)) {
          checkinsError = e instanceof Error ? e.message : "Could not load check-ins.";
        }
      }

      setStats({
        funnels: f.funnels,
        jobsRunning,
        jobsFailed,
        pendingApprovals: a.count ?? 0,
        workersActive,
        verifiedRevenueCents,
        revenue: r.revenue,
        relationshipAvg,
        relationshipCount,
        checkinsError,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load command center.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accents = Object.values(FUNNEL_ACCENTS);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>
          Livework<Text style={styles.logoPlus}>+</Text>
        </Text>
        <Pressable
          style={styles.avatar}
          onPress={() => router.push("/(tabs)/settings")}
          accessibilityLabel="Open Settings"
        >
          <Ionicons name="person" size={22} color="rgba(255,255,255,0.85)" />
        </Pressable>
      </View>

      <TopTabs />

      {!!error && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void refresh()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={THEME.purpleBright} size="large" style={{ marginTop: 24 }} />
      ) : !stats ? (
        <Text style={styles.empty}>No command-center data yet.</Text>
      ) : (
        <>
          {/* Funnel Overview — real funnels */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Funnel Overview</Text>
                <Text style={styles.cardSub}>Track all your funnels in one place.</Text>
              </View>
              <Pressable onPress={() => router.push("/(tabs)/funnels")}>
                <Text style={styles.viewAll}>View All Funnels ›</Text>
              </Pressable>
            </View>
            {stats.funnels.length === 0 ? (
              <Text style={styles.emptyInline}>No funnels yet.</Text>
            ) : (
              <View style={styles.funnelGrid}>
                {stats.funnels.slice(0, 4).map((funnel, i) => {
                  const accent = accents[i % accents.length];
                  return (
                    <Pressable
                      key={funnel.id}
                      style={styles.funnelTile}
                      onPress={() => router.push("/(tabs)/funnels")}
                    >
                      <View
                        style={[
                          styles.funnelIcon,
                          { backgroundColor: `${accent.color}26` },
                        ]}
                      >
                        <Ionicons name={accent.icon as never} size={22} color={accent.color} />
                      </View>
                      <Text style={styles.funnelName} numberOfLines={2}>
                        {funnel.name}
                      </Text>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>
                          {normalizeStatus(funnel.status) || "—"}
                        </Text>
                      </View>
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
                <Text style={styles.cardSub}>All revenue across your funnels.</Text>
              </View>
              <Pressable onPress={() => router.push("/(tabs)/insights")}>
                <Text style={styles.viewAll}>View Insights ›</Text>
              </Pressable>
            </View>
            <View style={styles.revenueRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.revenueLabel}>Total Revenue</Text>
                <Text style={styles.revenueValue}>{formatCents(stats.verifiedRevenueCents)}</Text>
                {!!stats.revenue.changeLabel && (
                  <Text style={styles.revenueDelta}>{stats.revenue.changeLabel}</Text>
                )}
                <Text style={styles.revenueNote}>
                  Verified only — never projected or estimated. From the canonical money row
                  per funnel.
                </Text>
              </View>
              {stats.revenue.spark.some((p) => p > 0) ? (
                <Sparkline points={stats.revenue.spark} width={150} height={56} />
              ) : (
                <Text style={styles.sparkEmpty}>No verified revenue events in the last 30 days.</Text>
              )}
            </View>
          </View>

          {/* Relationship Score — average of the recent real check-ins */}
          <View style={styles.card}>
            <View style={styles.relRow}>
              {stats.checkinsError ? (
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Relationship Score</Text>
                  <Text style={styles.errorText}>{stats.checkinsError}</Text>
                </View>
              ) : stats.relationshipAvg === null ? (
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Relationship Score</Text>
                  <Text style={styles.cardSub}>
                    No check-ins yet — add your first check-in on Connections and the score
                    appears here.
                  </Text>
                  <Pressable onPress={() => router.push("/(tabs)/connections")}>
                    <Text style={styles.viewAll}>Open Connections ›</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Ring
                    pct={(stats.relationshipAvg / 10) * 100}
                    size={96}
                    stroke={8}
                    center={stats.relationshipAvg.toFixed(1)}
                    sub="/10"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Relationship Score</Text>
                    <Text style={styles.cardSub}>
                      Average of your last {stats.relationshipCount} check-in
                      {stats.relationshipCount === 1 ? "" : "s"} · goal {GOAL_RATING}/10.
                    </Text>
                    <Pressable onPress={() => router.push("/(tabs)/insights")}>
                      <Text style={styles.viewAll}>View Insights ›</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Talk to Forge */}
          <Pressable onPress={() => router.push("/(tabs)/forge")}>
            <LinearGradient
              colors={["#2B1B5E", "#1A1038", "#14102A"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.forgeCard}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.forgeTitle}>Talk to Forge</Text>
                <Text style={styles.forgeSub}>
                  Your AI partner for commands, insights, and execution.
                </Text>
              </View>
              <View style={styles.forgeBtn}>
                <Text style={styles.forgeBtnText}>Open Forge ›</Text>
              </View>
            </LinearGradient>
          </Pressable>

          {/* Forge sections — every screen the 5-tab bar no longer shows */}
          <Text style={styles.sectionLabel}>Forge sections</Text>
          <View style={styles.group}>
            {HUB.map((item) => (
              <Pressable
                key={item.route}
                style={styles.rowCard}
                onPress={() => router.push(item.route as never)}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name={item.icon as never} size={20} color={THEME.purpleBright} />
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.rowTitle}>{item.label}</Text>
                  <Text style={styles.rowSub}>{item.detail(stats)}</Text>
                </View>
                {item.label === "Approvals" && stats.pendingApprovals > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{stats.pendingApprovals}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
        <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
      </Pressable>
      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  logo: { color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  logoPlus: { color: THEME.purpleBright },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#3B2A63",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(168,85,247,0.5)",
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
    marginBottom: 14,
  },
  errorCard: { borderColor: "rgba(236,72,153,0.5)" },
  errorText: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  retryText: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
  empty: { color: THEME.textMuted, fontSize: 14, textAlign: "center", marginTop: 24 },
  emptyInline: { color: THEME.textMuted, fontSize: 13, paddingVertical: 8 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  cardTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  cardSub: { color: THEME.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  viewAll: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800", marginTop: 4 },
  funnelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  funnelTile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: THEME.radiusSm,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 12,
    gap: 8,
  },
  funnelIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  funnelName: { color: "#fff", fontSize: 13, fontWeight: "800", minHeight: 34 },
  statusBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: THEME.textFaint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { color: THEME.textMuted, fontSize: 10, fontWeight: "900" },
  revenueRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  revenueLabel: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  revenueValue: { color: THEME.green, fontSize: 28, fontWeight: "900", marginTop: 2 },
  revenueDelta: { color: THEME.green, fontSize: 12, fontWeight: "800", marginTop: 2 },
  revenueNote: { color: THEME.textFaint, fontSize: 11, lineHeight: 15, marginTop: 4 },
  sparkEmpty: { color: THEME.textFaint, fontSize: 11, lineHeight: 15, maxWidth: 150 },
  relRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  forgeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: THEME.radius,
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  forgeTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  forgeSub: { color: THEME.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  forgeBtn: {
    borderWidth: 1,
    borderColor: THEME.purpleBright,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  forgeBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  sectionLabel: { color: "#fff", fontSize: 15, fontWeight: "800", marginBottom: 10 },
  group: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
    marginBottom: 22,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(168,85,247,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1 },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  rowSub: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  countBadge: {
    backgroundColor: THEME.pink,
    borderRadius: 999,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  refreshBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  refreshText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
});
