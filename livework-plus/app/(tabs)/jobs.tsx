// Livework+ Jobs — forge_jobs list; tap a job to see its tasks
// (tasks table, ordered by step_index). Jobs are never marked completed
// from this screen — only planning, approvals, and lifecycle happen here.
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
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  formatDate,
  normalizeStatus,
  type ForgeJobRow,
  type ForgeTaskRow,
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
  const [jobs, setJobs] = useState<ForgeJobRow[]>([]);
  const [funnelNames, setFunnelNames] = useState<Record<string, string>>({});
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [tasksByJob, setTasksByJob] = useState<Record<string, ForgeTaskRow[]>>({});
  const [loadingTasksId, setLoadingTasksId] = useState<string | null>(null);
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
      const [j, f] = await Promise.all([
        supabase
          .from("forge_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("funnels").select("id,name,slug"),
      ]);
      if (j.error) throw new Error(j.error.message);
      if (f.error) throw new Error(f.error.message);
      setJobs((j.data ?? []) as ForgeJobRow[]);
      const names: Record<string, string> = {};
      for (const row of (f.data ?? []) as { id: string; name: string | null; slug: string | null }[]) {
        names[row.id] = row.name ?? row.slug ?? "Unnamed funnel";
      }
      setFunnelNames(names);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load jobs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggleJob(job: ForgeJobRow) {
    if (expandedJobId === job.id) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(job.id);
    if (tasksByJob[job.id] || !supabase) return;
    setLoadingTasksId(job.id);
    try {
      const { data, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .eq("forge_job_id", job.id)
        .order("step_index", { ascending: true });
      if (taskError) throw new Error(taskError.message);
      setTasksByJob((prev) => ({ ...prev, [job.id]: (data ?? []) as ForgeTaskRow[] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tasks.");
    } finally {
      setLoadingTasksId(null);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
        </Pressable>
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
      ) : jobs.length === 0 ? (
        <Text style={styles.empty}>No jobs yet.</Text>
      ) : (
        jobs.map((job) => {
          const expanded = expandedJobId === job.id;
          const jobTasks = tasksByJob[job.id] ?? [];
          const funnelLabel = job.funnel_id ? funnelNames[job.funnel_id] ?? "Unknown funnel" : null;
          return (
            <View key={job.id} style={styles.card}>
              <Pressable onPress={() => void toggleJob(job)}>
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
                {!!job.error_text && <Text style={styles.jobError}>{job.error_text}</Text>}
                <Text style={styles.expandHint}>
                  {expanded ? "Tap to collapse ▲" : "Tap to see tasks ▼"}
                </Text>
              </Pressable>

              {expanded && (
                <View style={styles.tasksBlock}>
                  {loadingTasksId === job.id ? (
                    <ActivityIndicator color={THEME.purpleBright} />
                  ) : jobTasks.length === 0 ? (
                    <Text style={styles.muted}>No tasks for this job.</Text>
                  ) : (
                    jobTasks.map((task) => (
                      <View key={task.id} style={styles.taskRow}>
                        <Text style={styles.taskStep}>{task.step_index ?? "–"}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.taskTitle} numberOfLines={2}>
                            {task.title || task.task_type || "Task"}
                          </Text>
                          {!!task.error_text && (
                            <Text style={styles.taskError}>{task.error_text}</Text>
                          )}
                          {task.approval_required ? (
                            <Text style={styles.approvalFlag}>Approval required</Text>
                          ) : null}
                        </View>
                        <StatusBadge status={task.status} />
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })
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
  tasksBlock: { marginTop: 12, gap: 10 },
  muted: { color: THEME.textFaint, fontSize: 12 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  taskStep: { color: THEME.textFaint, fontSize: 12, width: 20, textAlign: "center" },
  taskTitle: { color: "#fff", fontSize: 13 },
  taskError: { color: THEME.pink, fontSize: 11, marginTop: 2 },
  approvalFlag: { color: THEME.orange, fontSize: 11, fontWeight: "700" },
});
