// Livework+ Jobs — forge_jobs list; tap a job to open its detail
// (tasks, plan/result JSON, retry for failed jobs). Jobs are never marked
// completed from this screen — only planning, approvals, and lifecycle
// happen here.
//
// Phase 8 Slice 4 (audit §4 + §12): execution-paused banner, worker
// column, status filter chips + search, rows link to job-detail
// (inline task expand removed — detail owns tasks now), 30s polling,
// Load more.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import ExecutionPausedBanner from "../../components/ExecutionPausedBanner";
import {
  POLL_INTERVAL_MS,
  formatDate,
  normalizeStatus,
  usePolling,
  type ForgeJobRow,
} from "../../lib/forge";

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = normalizeStatus(status);
  const color =
    s === "COMPLETED"
      ? THEME.green
      : s === "RUNNING" || s === "QUEUED"
        ? THEME.blue
        : s === "FAILED" || s === "CANCELLED"
          ? THEME.pink
          : s === "AWAITING_APPROVAL"
            ? THEME.orange
            : THEME.textMuted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{s || "—"}</Text>
    </View>
  );
}

const JOB_PAGE = 50;

export default function JobsScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <JobsContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function JobsContent() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ForgeJobRow[]>([]);
  const [funnelNames, setFunnelNames] = useState<Record<string, string>>({});
  const [workerNames, setWorkerNames] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [jobLimit, setJobLimit] = useState(JOB_PAGE);
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
      const [j, f, w] = await Promise.all([
        supabase
          .from("forge_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(jobLimit),
        supabase.from("funnels").select("id,name,slug"),
        supabase.from("workers").select("id,name,slug"),
      ]);
      if (j.error) throw new Error(j.error.message);
      if (f.error) throw new Error(f.error.message);
      if (w.error) throw new Error(w.error.message);
      setJobs((j.data ?? []) as ForgeJobRow[]);
      const funnelMap: Record<string, string> = {};
      for (const row of (f.data ?? []) as { id: string; name: string | null; slug: string | null }[]) {
        funnelMap[row.id] = row.name ?? row.slug ?? "Unnamed funnel";
      }
      setFunnelNames(funnelMap);
      const workerMap: Record<string, string> = {};
      for (const row of (w.data ?? []) as { id: string; name: string | null; slug: string | null }[]) {
        workerMap[row.id] = row.name ?? row.slug ?? "Unnamed worker";
      }
      setWorkerNames(workerMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load jobs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [jobLimit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePolling(() => void refresh(), POLL_INTERVAL_MS);

  const statuses = useMemo(() => {
    const seen = new Set<string>();
    for (const job of jobs) seen.add(normalizeStatus(job.status));
    return [...seen].sort();
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter && normalizeStatus(job.status) !== statusFilter) return false;
      if (!q) return true;
      const funnelLabel = job.funnel_id ? funnelNames[job.funnel_id] ?? "" : "";
      const workerLabel = job.worker_id ? workerNames[job.worker_id] ?? "" : "";
      return [job.title ?? "", job.job_type ?? "", funnelLabel, workerLabel]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [jobs, statusFilter, searchQuery, funnelNames, workerNames]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>
            {refreshing ? "Refreshing…" : "Refresh ↻ · auto-refreshes every 30s"}
          </Text>
        </Pressable>
      </View>

      <ExecutionPausedBanner />

      <TextInput
        style={styles.searchInput}
        placeholder="Search jobs (title, type, funnel, worker)…"
        placeholderTextColor={THEME.textFaint}
        value={searchQuery}
        onChangeText={setSearchQuery}
        returnKeyType="search"
      />
      <View style={styles.chips}>
        <Pressable
          style={[styles.chip, statusFilter === null && styles.chipActive]}
          onPress={() => setStatusFilter(null)}
        >
          <Text style={[styles.chipText, statusFilter === null && styles.chipTextActive]}>All</Text>
        </Pressable>
        {statuses.map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, statusFilter === s && styles.chipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

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
      ) : visibleJobs.length === 0 ? (
        <Text style={styles.empty}>
          {jobs.length === 0 ? "No jobs yet." : "No jobs match these filters."}
        </Text>
      ) : (
        visibleJobs.map((job) => {
          const funnelLabel = job.funnel_id ? funnelNames[job.funnel_id] ?? "Unknown funnel" : null;
          const workerLabel = job.worker_id ? workerNames[job.worker_id] ?? "Unknown worker" : null;
          return (
            <Pressable
              key={job.id}
              onPress={() =>
                router.push({ pathname: "/(tabs)/job-detail", params: { id: job.id } })
              }
            >
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.jobTitle} numberOfLines={2}>
                    {job.title || job.job_type || "Job"}
                  </Text>
                  <StatusBadge status={job.status} />
                </View>
                <Text style={styles.meta}>
                  {formatDate(job.created_at)}
                  {funnelLabel ? ` · ${funnelLabel}` : ""}
                  {job.job_type ? ` · ${job.job_type}` : ""}
                </Text>
                {!!workerLabel && <Text style={styles.meta}>Worker: {workerLabel}</Text>}
                {!!job.error_text && <Text style={styles.jobError}>{job.error_text}</Text>}
                <Text style={styles.expandHint}>Open job →</Text>
              </View>
            </Pressable>
          );
        })
      )}
      {jobs.length >= jobLimit && (
        <Pressable style={styles.loadMoreBtn} onPress={() => setJobLimit((v) => v + JOB_PAGE)}>
          <Text style={styles.loadMoreText}>Load more jobs</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#fff", fontSize: 26, fontWeight: "900" },
  refreshBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refreshText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  searchInput: {
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { borderColor: THEME.purpleBright, backgroundColor: "rgba(168,85,247,0.18)" },
  chipText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: "#fff" },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
  },
  errorCard: { borderColor: "rgba(236,72,153,0.5)" },
  errorText: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  retryText: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
  empty: { color: THEME.textMuted, fontSize: 14, textAlign: "center", marginTop: 24 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  jobTitle: { color: "#fff", fontSize: 15, fontWeight: "800", flex: 1 },
  meta: { color: THEME.textMuted, fontSize: 12, marginTop: 6 },
  jobError: { color: THEME.pink, fontSize: 12, marginTop: 6 },
  expandHint: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800", marginTop: 8 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },
  loadMoreBtn: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadMoreText: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
});
