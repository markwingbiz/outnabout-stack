// Livework+ Home — Forge command center (Phase 8 Slice 3).
// Replaces the dating-app "Control Center". Operator dashboard: quick stats
// (funnels by status, jobs running/failed, pending approvals, workers
// active, verified revenue), recent threads, recent failed jobs, and links
// to every Forge tab. All figures come from real queries; job/approval/
// worker counts use full-table fetches (these tables are small), never
// list caps. No demo data, no fake figures.
// The legacy Connections/Dates tabs and TopTabs navigation are untouched
// (§13 decision is not part of this slice).
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
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import {
  canonicalMoneyRows,
  formatCents,
  formatDate,
  normalizeStatus,
  type ForgeThreadRow,
  type FunnelRow,
  type MoneyFunnelRow,
} from "../../lib/forge";

type FailedJob = {
  id: string;
  title: string | null;
  job_type: string | null;
  funnel_id: string | null;
  error_text: string | null;
  created_at: string;
};

type Stats = {
  funnelTotal: number;
  funnelByStatus: { status: string; count: number }[];
  jobsRunning: number;
  jobsFailed: number;
  pendingApprovals: number;
  workersActive: number;
  verifiedRevenueCents: number;
};

const LINKS: { label: string; icon: string; route: string }[] = [
  { label: "Forge", icon: "flash", route: "/(tabs)/forge" },
  { label: "Funnels", icon: "filter", route: "/(tabs)/funnels" },
  { label: "Workers", icon: "construct", route: "/(tabs)/workers" },
  { label: "Jobs", icon: "list", route: "/(tabs)/jobs" },
  { label: "Approvals", icon: "checkmark-circle", route: "/(tabs)/approvals" },
  { label: "Deliverables", icon: "document-text", route: "/(tabs)/deliverables" },
  { label: "Insights", icon: "stats-chart", route: "/(tabs)/insights" },
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [threads, setThreads] = useState<ForgeThreadRow[]>([]);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [funnelNames, setFunnelNames] = useState<Record<string, string>>({});
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
      const [f, m, j, a, w, t, fj, fn] = await Promise.all([
        supabase.from("funnels").select("id,status").limit(1000),
        supabase
          .from("money_funnels")
          .select("funnel_id,key,verified_revenue_cents")
          .limit(1000),
        supabase.from("forge_jobs").select("status").limit(1000),
        supabase.from("approvals").select("id,status").limit(1000),
        supabase.from("workers").select("id,status").limit(1000),
        supabase
          .from("forge_threads")
          .select("id,title,status,created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("forge_jobs")
          .select("id,title,job_type,funnel_id,error_text,created_at,status")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("funnels").select("id,name,slug"),
      ]);
      for (const r of [f, m, j, a, w, t, fj, fn]) {
        if (r.error) throw new Error(r.error.message);
      }
      const funnelRows = (f.data ?? []) as { id: string; status: string | null }[];
      const byStatus = new Map<string, number>();
      for (const row of funnelRows) {
        const s = normalizeStatus(row.status) || "UNKNOWN";
        byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
      }
      const jobRows = (j.data ?? []) as { status: string }[];
      const jobsRunning = jobRows.filter(
        (row) => normalizeStatus(row.status) === "RUNNING" || normalizeStatus(row.status) === "QUEUED",
      ).length;
      const jobsFailed = jobRows.filter((row) => normalizeStatus(row.status) === "FAILED").length;
      const pendingApprovals = ((a.data ?? []) as { status: string | null }[]).filter(
        (row) => normalizeStatus(row.status) === "PENDING",
      ).length;
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
      setStats({
        funnelTotal: funnelRows.length,
        funnelByStatus: [...byStatus.entries()]
          .map(([status, count]) => ({ status, count }))
          .sort((x, y) => y.count - x.count),
        jobsRunning,
        jobsFailed,
        pendingApprovals,
        workersActive,
        verifiedRevenueCents,
      });
      setThreads((t.data ?? []) as ForgeThreadRow[]);
      const failed = ((fj.data ?? []) as (FailedJob & { status: string })[])
        .filter((row) => normalizeStatus(row.status) === "FAILED")
        .slice(0, 5);
      setFailedJobs(failed);
      const names: Record<string, string> = {};
      for (const row of (fn.data ?? []) as FunnelRow[]) {
        names[row.id] = row.name ?? row.slug ?? "Unnamed funnel";
      }
      setFunnelNames(names);
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

      {/* Command-center hero */}
      <LinearGradient
        colors={["#2B1B5E", "#1A1038", "#14102A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Forge Command Center</Text>
          <Text style={styles.heroSub}>
            Live status across funnels, jobs, approvals, and verified revenue.
          </Text>
        </View>
        <View style={styles.shield}>
          <Ionicons name="flash" size={44} color={THEME.purpleBright} />
        </View>
      </LinearGradient>

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
          {/* Quick stats */}
          <Text style={styles.sectionLabel}>At a glance</Text>
          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.funnelTotal}</Text>
              <Text style={styles.statLabel}>Funnels</Text>
              <Text style={styles.statDetail}>
                {stats.funnelByStatus.map((s) => `${s.status} ${s.count}`).join(" · ") || "—"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.jobsRunning}</Text>
              <Text style={styles.statLabel}>Jobs running / queued</Text>
              <Text style={styles.statDetail}>{stats.jobsFailed} failed</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.pendingApprovals}</Text>
              <Text style={styles.statLabel}>Pending approvals</Text>
              <Pressable onPress={() => router.push("/(tabs)/approvals")}>
                <Text style={styles.statLink}>Open approvals →</Text>
              </Pressable>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.workersActive}</Text>
              <Text style={styles.statLabel}>Workers active</Text>
              <Pressable onPress={() => router.push("/(tabs)/workers")}>
                <Text style={styles.statLink}>Open workers →</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.revenueCard}>
            <Text style={styles.revenueLabel}>Verified revenue (all funnels)</Text>
            <Text style={styles.revenueValue}>{formatCents(stats.verifiedRevenueCents)}</Text>
            <Text style={styles.revenueNote}>
              Verified only — never projected or estimated. From the canonical money row per funnel.
            </Text>
          </View>

          {/* Recent threads */}
          <Text style={styles.sectionLabel}>Recent Forge threads</Text>
          <View style={styles.group}>
            {threads.length === 0 ? (
              <Text style={styles.emptyInline}>No Forge threads yet.</Text>
            ) : (
              threads.map((thread) => (
                <Pressable
                  key={thread.id}
                  style={styles.rowCard}
                  onPress={() => router.push("/(tabs)/forge")}
                >
                  <View style={styles.rowMid}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {thread.title || "Untitled thread"}
                    </Text>
                    <Text style={styles.rowSub}>
                      {normalizeStatus(thread.status) || "—"} · {formatDate(thread.created_at)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
                </Pressable>
              ))
            )}
          </View>

          {/* Recent failed jobs */}
          <Text style={styles.sectionLabel}>Recent failed jobs</Text>
          <View style={styles.group}>
            {failedJobs.length === 0 ? (
              <Text style={styles.emptyInline}>No failed jobs in the latest 50 jobs.</Text>
            ) : (
              failedJobs.map((job) => (
                <Pressable
                  key={job.id}
                  style={styles.rowCard}
                  onPress={() => router.push("/(tabs)/jobs")}
                >
                  <View style={styles.rowMid}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {job.title || job.job_type || "Job"}
                    </Text>
                    <Text style={styles.rowSub}>
                      {job.funnel_id ? funnelNames[job.funnel_id] ?? "Unknown funnel" : "No funnel"} ·{" "}
                      {formatDate(job.created_at)}
                    </Text>
                    {!!job.error_text && (
                      <Text style={styles.rowError} numberOfLines={2}>
                        {job.error_text}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
                </Pressable>
              ))
            )}
          </View>

          {/* Links */}
          <Text style={styles.sectionLabel}>Open</Text>
          <View style={styles.linkGrid}>
            {LINKS.map((link) => (
              <Pressable
                key={link.route}
                style={styles.linkCard}
                onPress={() => router.push(link.route as never)}
              >
                <Ionicons name={link.icon as never} size={22} color={THEME.purpleBright} />
                <Text style={styles.linkText}>{link.label}</Text>
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
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: THEME.radius,
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  heroSub: { color: THEME.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  shield: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(168,85,247,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.4)",
  },
  sectionLabel: { color: "#fff", fontSize: 15, fontWeight: "800", marginBottom: 10 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
  },
  errorCard: { borderColor: "rgba(236,72,153,0.5)", marginBottom: 14 },
  errorText: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  retryText: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
  empty: { color: THEME.textMuted, fontSize: 14, textAlign: "center", marginTop: 24 },
  emptyInline: { color: THEME.textMuted, fontSize: 13, padding: 14 },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
  },
  statValue: { color: "#fff", fontSize: 26, fontWeight: "900" },
  statLabel: { color: THEME.textMuted, fontSize: 12, fontWeight: "800", marginTop: 2 },
  statDetail: { color: THEME.textMuted, fontSize: 12, marginTop: 4 },
  statLink: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800", marginTop: 4 },
  revenueCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
    marginBottom: 22,
  },
  revenueLabel: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  revenueValue: { color: THEME.green, fontSize: 28, fontWeight: "900", marginTop: 4 },
  revenueNote: { color: THEME.textFaint, fontSize: 12, lineHeight: 16, marginTop: 6 },
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
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  rowMid: { flex: 1 },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  rowSub: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  rowError: { color: THEME.pink, fontSize: 12, marginTop: 2 },
  linkGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
  },
  linkCard: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
    alignItems: "center",
    gap: 8,
  },
  linkText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  refreshBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  refreshText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
});
