// Livework+ Forge chat — the operator interface to the Forge backend.
// Everything shown here comes from live Supabase queries (forge_threads,
// forge_jobs, forge_messages, tasks, approvals). No canned responses,
// no fake data, no simulated execution.
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
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  callForge,
  formatDate,
  newIdempotencyKey,
  normalizeStatus,
  type ApprovalRow,
  type ForgeJobRow,
  type ForgeMessageRow,
  type ForgeTaskRow,
  type ForgeThreadRow,
} from "../../lib/forge";

type ForgeCommandResponse = {
  thread_id?: string;
  job_id?: string;
  task_ids?: string[];
  status?: string;
  deduped?: boolean;
  error?: string;
};

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = normalizeStatus(status);
  const color =
    s === "ACTIVE" || s === "COMPLETED" || s === "APPROVED"
      ? THEME.green
      : s === "PENDING" || s === "AWAITING_APPROVAL" || s === "APPROVAL_REQUIRED"
        ? THEME.orange
        : s === "FAILED" || s === "REJECTED" || s === "STOPPED" || s === "CANCELLED"
          ? THEME.pink
          : THEME.textMuted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{s || "—"}</Text>
    </View>
  );
}

export default function ForgeScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <ForgeContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function ForgeContent() {
  const [threads, setThreads] = useState<ForgeThreadRow[]>([]);
  const [jobs, setJobs] = useState<ForgeJobRow[]>([]);
  const [tasks, setTasks] = useState<ForgeTaskRow[]>([]);
  const [messages, setMessages] = useState<ForgeMessageRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const [t, j, tk, m, a] = await Promise.all([
        supabase
          .from("forge_threads")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("forge_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("tasks")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("forge_messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("approvals")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
      ]);
      const firstError = t.error ?? j.error ?? tk.error ?? m.error ?? a.error;
      if (firstError) throw new Error(firstError.message);
      setThreads((t.data ?? []) as ForgeThreadRow[]);
      setJobs((j.data ?? []) as ForgeJobRow[]);
      setTasks((tk.data ?? []) as ForgeTaskRow[]);
      setMessages((m.data ?? []) as ForgeMessageRow[]);
      setPendingApprovals((a.data ?? []) as ApprovalRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Forge data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const jobsByThread = useMemo(() => {
    const map = new Map<string, ForgeJobRow[]>();
    for (const job of jobs) {
      if (!job.thread_id) continue;
      const list = map.get(job.thread_id) ?? [];
      list.push(job);
      map.set(job.thread_id, list);
    }
    return map;
  }, [jobs]);

  const tasksByJob = useMemo(() => {
    const map = new Map<string, ForgeTaskRow[]>();
    for (const task of tasks) {
      if (!task.forge_job_id) continue;
      const list = map.get(task.forge_job_id) ?? [];
      list.push(task);
      map.set(task.forge_job_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0));
    }
    return map;
  }, [tasks]);

  const messagesByThread = useMemo(() => {
    const map = new Map<string, ForgeMessageRow[]>();
    for (const msg of messages) {
      if (!msg.thread_id) continue;
      const list = map.get(msg.thread_id) ?? [];
      list.push(msg);
      map.set(msg.thread_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    }
    return map;
  }, [messages]);

  async function sendCommand() {
    const text = composer.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setSendNote(null);
    try {
      const resp = await callForge<ForgeCommandResponse>("forge-command", {
        text,
        idempotency_key: newIdempotencyKey(),
      });
      setComposer("");
      setSendNote(
        resp.deduped
          ? "Command already sent — showing the existing job."
          : `Command sent — job ${String(resp.job_id ?? "").slice(0, 8) || "created"}.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send command.");
    } finally {
      setSending(false);
    }
  }

  function threadTaskIds(threadId: string): string[] {
    const jobIds = (jobsByThread.get(threadId) ?? []).map((j) => j.id);
    return tasks
      .filter((t) => t.forge_job_id && jobIds.includes(t.forge_job_id))
      .map((t) => t.id);
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Forge</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
        </Pressable>
      </View>

      {/* Composer */}
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Tell Forge what to do…"
          placeholderTextColor={THEME.textFaint}
          value={composer}
          onChangeText={setComposer}
          multiline
          editable={!sending}
        />
        <Pressable
          style={[styles.sendBtn, (!composer.trim() || sending) && styles.sendBtnDisabled]}
          onPress={() => void sendCommand()}
          disabled={!composer.trim() || sending}
        >
          <Text style={styles.sendText}>{sending ? "Sending…" : "Send"}</Text>
        </Pressable>
        {!!sendNote && <Text style={styles.sendNote}>{sendNote}</Text>}
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
      ) : threads.length === 0 ? (
        <Text style={styles.empty}>No Forge conversations yet — send a command above.</Text>
      ) : (
        threads.map((thread) => {
          const threadJobs = jobsByThread.get(thread.id) ?? [];
          const taskIds = threadTaskIds(thread.id);
          const threadApprovals = pendingApprovals.filter(
            (a) => a.task_id && taskIds.includes(a.task_id),
          );
          const expanded = expandedThreadId === thread.id;
          const threadMessages = messagesByThread.get(thread.id) ?? [];
          return (
            <View key={thread.id} style={styles.card}>
              <Pressable
                onPress={() => setExpandedThreadId(expanded ? null : thread.id)}
              >
                <View style={styles.threadHeader}>
                  <Text style={styles.threadTitle} numberOfLines={2}>
                    {thread.title || "Untitled thread"}
                  </Text>
                  <StatusBadge status={thread.status} />
                </View>
                <Text style={styles.meta}>
                  {formatDate(thread.created_at)} · {threadJobs.length}{" "}
                  {threadJobs.length === 1 ? "job" : "jobs"} · {taskIds.length}{" "}
                  {taskIds.length === 1 ? "task" : "tasks"} · {threadApprovals.length} pending{" "}
                  {threadApprovals.length === 1 ? "approval" : "approvals"}
                </Text>
                <Text style={styles.expandHint}>{expanded ? "Tap to collapse ▲" : "Tap to expand ▼"}</Text>
              </Pressable>

              {expanded && (
                <View style={styles.expanded}>
                  {/* Transcript */}
                  <Text style={styles.sectionLabel}>Transcript</Text>
                  {threadMessages.length === 0 ? (
                    <Text style={styles.muted}>No messages in this thread yet.</Text>
                  ) : (
                    threadMessages.map((msg) => (
                      <View key={msg.id} style={styles.message}>
                        <Text style={styles.messageRole}>{msg.role.toUpperCase()}</Text>
                        <Text style={styles.messageText}>{msg.content}</Text>
                        <Text style={styles.messageTime}>{formatDate(msg.created_at)}</Text>
                      </View>
                    ))
                  )}

                  {/* Jobs + tasks */}
                  <Text style={styles.sectionLabel}>Jobs</Text>
                  {threadJobs.length === 0 ? (
                    <Text style={styles.muted}>No jobs in this thread yet.</Text>
                  ) : (
                    threadJobs.map((job) => {
                      const jobTasks = tasksByJob.get(job.id) ?? [];
                      return (
                        <View key={job.id} style={styles.jobBlock}>
                          <View style={styles.jobHeader}>
                            <Text style={styles.jobTitle} numberOfLines={2}>
                              {job.title || job.job_type || "Job"}
                            </Text>
                            <StatusBadge status={job.status} />
                          </View>
                          {!!job.error_text && (
                            <Text style={styles.jobError}>{job.error_text}</Text>
                          )}
                          {jobTasks.length === 0 ? (
                            <Text style={styles.muted}>No tasks created for this job yet.</Text>
                          ) : (
                            jobTasks.map((task) => (
                              <View key={task.id} style={styles.taskRow}>
                                <Text style={styles.taskStep}>{task.step_index ?? "–"}</Text>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.taskTitle} numberOfLines={2}>
                                    {task.title || task.task_type || "Task"}
                                  </Text>
                                  {task.approval_required ? (
                                    <Text style={styles.approvalFlag}>
                                      Approval required
                                    </Text>
                                  ) : null}
                                </View>
                                <StatusBadge status={task.status} />
                              </View>
                            ))
                          )}
                        </View>
                      );
                    })
                  )}

                  {/* Pending approvals linked to this thread */}
                  <Text style={styles.sectionLabel}>Pending approvals</Text>
                  {threadApprovals.length === 0 ? (
                    <Text style={styles.muted}>No pending approvals for this thread.</Text>
                  ) : (
                    threadApprovals.map((a) => (
                      <View key={a.id} style={styles.approvalRow}>
                        <Text style={styles.approvalTitle} numberOfLines={2}>
                          {a.title || a.request_type || "Approval"}
                        </Text>
                        <StatusBadge status={a.status} />
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
  input: {
    color: "#fff",
    fontSize: 15,
    minHeight: 56,
    textAlignVertical: "top",
  },
  sendBtn: {
    alignSelf: "flex-end",
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 10,
    marginTop: 8,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  sendNote: { color: THEME.green, fontSize: 12, marginTop: 8 },
  errorCard: { borderColor: "rgba(236,72,153,0.5)" },
  errorText: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  retryText: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
  empty: { color: THEME.textMuted, fontSize: 14, textAlign: "center", marginTop: 24 },
  threadHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  threadTitle: { color: "#fff", fontSize: 16, fontWeight: "800", flex: 1 },
  meta: { color: THEME.textMuted, fontSize: 12, marginTop: 6 },
  expandHint: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800", marginTop: 8 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: "900" },
  expanded: { marginTop: 14, gap: 10 },
  sectionLabel: { color: "#fff", fontSize: 14, fontWeight: "800", marginTop: 6 },
  muted: { color: THEME.textFaint, fontSize: 12 },
  message: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 10,
  },
  messageRole: { color: THEME.purpleBright, fontSize: 10, fontWeight: "900" },
  messageText: { color: "#fff", fontSize: 13, lineHeight: 18, marginTop: 3 },
  messageTime: { color: THEME.textFaint, fontSize: 11, marginTop: 4 },
  jobBlock: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  jobHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  jobTitle: { color: "#fff", fontSize: 13, fontWeight: "800", flex: 1 },
  jobError: { color: THEME.pink, fontSize: 12 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  taskStep: { color: THEME.textFaint, fontSize: 12, width: 20, textAlign: "center" },
  taskTitle: { color: "#fff", fontSize: 12 },
  approvalFlag: { color: THEME.orange, fontSize: 11, fontWeight: "700" },
  approvalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 10,
  },
  approvalTitle: { color: "#fff", fontSize: 13, flex: 1 },
});
