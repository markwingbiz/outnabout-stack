// Livework+ Job detail (Phase 8 Slice 4, audit §4).
//
// Design §10: job detail with plan, tasks, errors, and retry. Shows
// forge_jobs.plan_json + result_json (never shown before), the worker name
// (via workers lookup), and a Retry button for failed jobs. Retry calls
// forge-job-admin, which enqueues a NEW job attempt (new job + task rows)
// — the failed job is never mutated, and gated tasks get fresh approvals.
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import ExecutionPausedBanner from "../../components/ExecutionPausedBanner";
import {
  POLL_INTERVAL_MS,
  asPrettyJson,
  callForge,
  formatDate,
  newIdempotencyKey,
  normalizeStatus,
  usePolling,
  type ForgeJobRow,
  type ForgeTaskRow,
  type JobRetryResponse,
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

export default function JobDetailScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <JobDetailContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function JobDetailContent() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const jobId = typeof params.id === "string" ? params.id : "";

  const [job, setJob] = useState<ForgeJobRow | null>(null);
  const [tasks, setTasks] = useState<ForgeTaskRow[]>([]);
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [funnelName, setFunnelName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const [confirmingRetry, setConfirmingRetry] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !jobId) return;
    setRefreshing(true);
    setError(null);
    try {
      const [j, tk] = await Promise.all([
        supabase.from("forge_jobs").select("*").eq("id", jobId).maybeSingle(),
        supabase
          .from("tasks")
          .select("*")
          .eq("forge_job_id", jobId)
          .order("step_index", { ascending: true }),
      ]);
      if (j.error) throw new Error(j.error.message);
      if (tk.error) throw new Error(tk.error.message);
      const jobRow = (j.data ?? null) as ForgeJobRow | null;
      setJob(jobRow);
      setTasks((tk.data ?? []) as ForgeTaskRow[]);
      if (jobRow?.worker_id) {
        const w = await supabase
          .from("workers")
          .select("name, slug")
          .eq("id", jobRow.worker_id)
          .maybeSingle();
        if (!w.error && w.data) {
          const d = w.data as { name: string | null; slug: string | null };
          setWorkerName(d.name ?? d.slug ?? "Unknown worker");
        }
      } else {
        setWorkerName(null);
      }
      if (jobRow?.funnel_id) {
        const f = await supabase
          .from("funnels")
          .select("name, slug")
          .eq("id", jobRow.funnel_id)
          .maybeSingle();
        if (!f.error && f.data) {
          const d = f.data as { name: string | null; slug: string | null };
          setFunnelName(d.name ?? d.slug ?? "Unknown funnel");
        }
      } else {
        setFunnelName(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load job.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [jobId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePolling(() => void refresh(), POLL_INTERVAL_MS, Boolean(jobId));

  async function retryJob() {
    if (retrying || !job) return;
    setRetrying(true);
    setError(null);
    setRetryNote(null);
    try {
      const resp = await callForge<JobRetryResponse>("forge-job-admin", {
        action: "retry",
        job_id: job.id,
        idempotency_key: newIdempotencyKey(),
      });
      const newId = resp.job?.id;
      setRetryNote(
        resp.deduped
          ? "Retry already recorded — showing the existing attempt."
          : `New attempt enqueued (job ${String(newId ?? "").slice(0, 8)}). The failed job is unchanged.`,
      );
      if (newId) {
        router.replace({ pathname: "/(tabs)/job-detail", params: { id: newId } });
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry job.");
    } finally {
      setRetrying(false);
      setConfirmingRetry(false);
    }
  }

  if (!jobId) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>No job selected.</Text>
        <Pressable onPress={() => router.push("/(tabs)/jobs")}>
          <Text style={styles.link}>Back to Jobs</Text>
        </Pressable>
      </View>
    );
  }

  const isFailed = job ? normalizeStatus(job.status) === "FAILED" : false;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/(tabs)/jobs")}>
        <Text style={styles.link}>← Back to Jobs</Text>
      </Pressable>
      <ExecutionPausedBanner />

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
      ) : !job ? (
        <Text style={styles.empty}>Job not found.</Text>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.title} numberOfLines={3}>
                {job.title || job.job_type || "Job"}
              </Text>
              <StatusBadge status={job.status} />
            </View>
            <Text style={styles.meta}>
              {formatDate(job.created_at)}
              {funnelName ? ` · ${funnelName}` : ""}
              {job.job_type ? ` · ${job.job_type}` : ""}
            </Text>
            <Text style={styles.meta}>
              Worker: {workerName ?? "None assigned"}
            </Text>
            {!!job.error_text && <Text style={styles.jobError}>{job.error_text}</Text>}
            <Pressable
              style={styles.refreshBtn}
              onPress={() => void refresh()}
              disabled={refreshing}
            >
              <Text style={styles.refreshText}>
                {refreshing ? "Refreshing…" : "Refresh ↻ · auto-refreshes every 30s"}
              </Text>
            </Pressable>
          </View>

          {isFailed && (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Retry</Text>
              <Text style={styles.muted}>
                Retry enqueues a new attempt — new job + task rows, gated tasks get fresh
                approvals. The failed job is never changed.
              </Text>
              {confirmingRetry ? (
                <View style={styles.buttonRow}>
                  <Pressable
                    style={[styles.btn, styles.btnDanger]}
                    onPress={() => void retryJob()}
                    disabled={retrying}
                  >
                    <Text style={styles.btnText}>{retrying ? "Retrying…" : "Confirm retry"}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnGhost]}
                    onPress={() => setConfirmingRetry(false)}
                    disabled={retrying}
                  >
                    <Text style={styles.btnText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={[styles.btn, styles.btnDanger]} onPress={() => setConfirmingRetry(true)}>
                  <Text style={styles.btnText}>Retry failed job</Text>
                </Pressable>
              )}
              {!!retryNote && <Text style={styles.sendNote}>{retryNote}</Text>}
            </View>
          )}

          <Text style={styles.sectionLabel}>Tasks ({tasks.length})</Text>
          {tasks.length === 0 ? (
            <Text style={styles.muted}>No tasks for this job.</Text>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.taskTitle} numberOfLines={2}>
                    {task.title || task.task_type || "Task"}
                  </Text>
                  <StatusBadge status={task.status} />
                </View>
                <Text style={styles.meta}>
                  Step {task.step_index ?? "–"}
                  {task.approval_required ? " · Approval required" : ""}
                </Text>
                {!!task.error_text && <Text style={styles.taskError}>{task.error_text}</Text>}
                {task.input != null && (
                  <Text style={styles.jsonBlock} selectable>
                    Input: {asPrettyJson(task.input)}
                  </Text>
                )}
              </View>
            ))
          )}

          <Text style={styles.sectionLabel}>Plan</Text>
          <Text style={styles.jsonBlock} selectable>
            {asPrettyJson(job.plan_json)}
          </Text>

          <Text style={styles.sectionLabel}>Result</Text>
          <Text style={styles.jsonBlock} selectable>
            {asPrettyJson(job.result_json)}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  centerText: { color: THEME.textMuted, fontSize: 14 },
  link: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800" },
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
  title: { color: "#fff", fontSize: 18, fontWeight: "900", flex: 1 },
  meta: { color: THEME.textMuted, fontSize: 12, marginTop: 6 },
  jobError: { color: THEME.pink, fontSize: 12, marginTop: 6 },
  refreshBtn: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
  },
  refreshText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  sectionLabel: { color: "#fff", fontSize: 15, fontWeight: "900", marginTop: 6 },
  muted: { color: THEME.textFaint, fontSize: 12, lineHeight: 17 },
  taskTitle: { color: "#fff", fontSize: 14, fontWeight: "800", flex: 1 },
  taskError: { color: THEME.pink, fontSize: 11, marginTop: 4 },
  jsonBlock: {
    color: THEME.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "monospace",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 11, alignItems: "center" },
  btnDanger: { backgroundColor: "rgba(236,72,153,0.22)" },
  btnGhost: { backgroundColor: "rgba(255,255,255,0.10)" },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  sendNote: { color: THEME.green, fontSize: 12, marginTop: 8 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },
});
