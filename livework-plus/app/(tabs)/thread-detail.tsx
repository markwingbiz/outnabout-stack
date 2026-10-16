// Livework+ Thread detail (Phase 8 Slice 4, audit §1).
//
// Design §10: transcript + per-thread composer + plan summary + linked jobs
// + "Approve all pending" shortcut. The per-thread composer sends to
// forge-command with thread_id set (forge-command already supports reusing
// a thread — no backend change needed). "Approve all pending" decides each
// pending approval through forge-approve, one at a time — no bypass.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  POLL_INTERVAL_MS,
  asRecord,
  callForge,
  decideApproval,
  formatDate,
  newIdempotencyKey,
  normalizeStatus,
  usePolling,
  type ApprovalRow,
  type ForgeJobRow,
  type ForgeMessageRow,
  type ForgeTaskRow,
  type ForgeThreadRow,
} from "../../lib/forge";

type PlanStep = {
  step_index: number | null;
  task_type: string | null;
  worker_slug: string | null;
  approval_required: boolean;
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

/** Plan steps out of a job's plan_json (forge-command parsed_intent). */
function planSteps(job: ForgeJobRow): PlanStep[] {
  const plan = asRecord(job.plan_json);
  const intent = asRecord(plan.parsed_intent);
  const raw = intent.steps;
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const r = asRecord(s);
    return {
      step_index: typeof r.step_index === "number" ? r.step_index : null,
      task_type: typeof r.task_type === "string" ? r.task_type : null,
      worker_slug: typeof r.worker_slug === "string" ? r.worker_slug : null,
      approval_required: r.approval_required === true,
    };
  });
}

const MESSAGE_PAGE = 200;

export default function ThreadDetailScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <ThreadDetailContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function ThreadDetailContent() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const threadId = typeof params.id === "string" ? params.id : "";

  const [thread, setThread] = useState<ForgeThreadRow | null>(null);
  const [messages, setMessages] = useState<ForgeMessageRow[]>([]);
  const [jobs, setJobs] = useState<ForgeJobRow[]>([]);
  const [tasks, setTasks] = useState<ForgeTaskRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRow[]>([]);
  const [messageLimit, setMessageLimit] = useState(MESSAGE_PAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [approveAllNote, setApproveAllNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !threadId) return;
    setRefreshing(true);
    setError(null);
    try {
      const [t, m, j] = await Promise.all([
        supabase.from("forge_threads").select("*").eq("id", threadId).maybeSingle(),
        supabase
          .from("forge_messages")
          .select("*")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true })
          .limit(messageLimit),
        supabase
          .from("forge_jobs")
          .select("*")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false }),
      ]);
      if (t.error) throw new Error(t.error.message);
      if (m.error) throw new Error(m.error.message);
      if (j.error) throw new Error(j.error.message);
      const jobRows = ((j.data ?? []) as ForgeJobRow[]);
      const jobIds = jobRows.map((x) => x.id);
      let taskRows: ForgeTaskRow[] = [];
      let approvalRows: ApprovalRow[] = [];
      if (jobIds.length > 0) {
        const tk = await supabase
          .from("tasks")
          .select("*")
          .in("forge_job_id", jobIds)
          .order("step_index", { ascending: true });
        if (tk.error) throw new Error(tk.error.message);
        taskRows = (tk.data ?? []) as ForgeTaskRow[];
        const taskIds = taskRows.map((x) => x.id);
        if (taskIds.length > 0) {
          const a = await supabase
            .from("approvals")
            .select("*")
            .eq("status", "pending")
            .in("task_id", taskIds)
            .order("created_at", { ascending: true });
          if (a.error) throw new Error(a.error.message);
          approvalRows = (a.data ?? []) as ApprovalRow[];
        }
      }
      setThread((t.data ?? null) as ForgeThreadRow | null);
      setMessages((m.data ?? []) as ForgeMessageRow[]);
      setJobs(jobRows);
      setTasks(taskRows);
      setPendingApprovals(approvalRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load thread.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [threadId, messageLimit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll for new messages / job updates. Only list state is refreshed —
  // the composer text is untouched.
  usePolling(() => void refresh(), POLL_INTERVAL_MS, Boolean(threadId));

  async function sendReply() {
    const text = composer.trim();
    if (!text || sending || !threadId) return;
    setSending(true);
    setError(null);
    setSendNote(null);
    try {
      const resp = await callForge<{ job_id?: string; deduped?: boolean }>("forge-command", {
        text,
        thread_id: threadId,
        idempotency_key: newIdempotencyKey(),
      });
      setComposer("");
      setSendNote(
        resp.deduped
          ? "Message already sent — showing the existing job."
          : `Reply sent — job ${String(resp.job_id ?? "").slice(0, 8) || "created"}.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reply.");
    } finally {
      setSending(false);
    }
  }

  async function approveAllPending() {
    if (approvingAll || pendingApprovals.length === 0) return;
    setApprovingAll(true);
    setApproveAllNote(null);
    setError(null);
    let ok = 0;
    const failures: string[] = [];
    for (const a of pendingApprovals) {
      try {
        await decideApproval(a.id, "approve");
        ok += 1;
      } catch (e) {
        failures.push(`${a.title ?? a.id.slice(0, 8)}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setApproveAllNote(
      `Approved ${ok} of ${pendingApprovals.length}.` +
        (failures.length > 0 ? ` ${failures.length} failed: ${failures.join("; ")}` : ""),
    );
    setApprovingAll(false);
    await refresh();
  }

  function confirmApproveAll() {
    Alert.alert(
      "Approve all pending?",
      `This approves all ${pendingApprovals.length} pending approval(s) in this thread, one at a time through forge-approve. Gated actions may then execute.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Approve all", style: "destructive", onPress: () => void approveAllPending() },
      ],
    );
  }

  if (!threadId) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>No thread selected.</Text>
        <Pressable onPress={() => router.push("/(tabs)/forge")}>
          <Text style={styles.link}>Back to Forge</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/(tabs)/forge")}>
        <Text style={styles.link}>← Back to Forge</Text>
      </Pressable>

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
      ) : !thread ? (
        <Text style={styles.empty}>Thread not found.</Text>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.title} numberOfLines={3}>
                {thread.title || "Untitled thread"}
              </Text>
              <StatusBadge status={thread.status} />
            </View>
            <Text style={styles.meta}>{formatDate(thread.created_at)}</Text>
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

          {/* Transcript */}
          <Text style={styles.sectionLabel}>Transcript</Text>
          {messages.length === 0 ? (
            <Text style={styles.muted}>No messages in this thread yet.</Text>
          ) : (
            messages.map((msg) => (
              <View key={msg.id} style={styles.message}>
                <Text style={styles.messageRole}>{msg.role.toUpperCase()}</Text>
                <Text style={styles.messageText}>{msg.content}</Text>
                <Text style={styles.messageTime}>{formatDate(msg.created_at)}</Text>
              </View>
            ))
          )}
          {messages.length >= messageLimit && (
            <Pressable style={styles.loadMoreBtn} onPress={() => setMessageLimit((v) => v + MESSAGE_PAGE)}>
              <Text style={styles.loadMoreText}>Load more messages</Text>
            </Pressable>
          )}

          {/* Per-thread composer */}
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="Reply in this thread…"
              placeholderTextColor={THEME.textFaint}
              value={composer}
              onChangeText={setComposer}
              multiline
              editable={!sending}
            />
            <Pressable
              style={[styles.sendBtn, (!composer.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => void sendReply()}
              disabled={!composer.trim() || sending}
            >
              <Text style={styles.sendText}>{sending ? "Sending…" : "Send reply"}</Text>
            </Pressable>
            {!!sendNote && <Text style={styles.sendNote}>{sendNote}</Text>}
          </View>

          {/* Plan summary + linked jobs */}
          <Text style={styles.sectionLabel}>Jobs &amp; plan</Text>
          {jobs.length === 0 ? (
            <Text style={styles.muted}>No jobs in this thread yet.</Text>
          ) : (
            jobs.map((job) => {
              const steps = planSteps(job);
              const jobTasks = tasks.filter((t) => t.forge_job_id === job.id);
              return (
                <View key={job.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.jobTitle} numberOfLines={2}>
                      {job.title || job.job_type || "Job"}
                    </Text>
                    <StatusBadge status={job.status} />
                  </View>
                  {!!job.error_text && <Text style={styles.jobError}>{job.error_text}</Text>}
                  <Text style={styles.subLabel}>Plan</Text>
                  {steps.length === 0 ? (
                    <Text style={styles.muted}>No plan recorded for this job.</Text>
                  ) : (
                    steps.map((s, i) => (
                      <Text key={i} style={styles.planLine}>
                        {s.step_index ?? i + 1}. {s.task_type ?? "step"}
                        {s.worker_slug ? ` · ${s.worker_slug}` : ""}
                        {s.approval_required ? " · approval required" : ""}
                      </Text>
                    ))
                  )}
                  <Text style={styles.subLabel}>Tasks ({jobTasks.length})</Text>
                  {jobTasks.length === 0 ? (
                    <Text style={styles.muted}>No tasks created for this job yet.</Text>
                  ) : (
                    jobTasks.map((t) => (
                      <View key={t.id} style={styles.taskRow}>
                        <Text style={styles.taskStep}>{t.step_index ?? "–"}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.taskTitle} numberOfLines={2}>
                            {t.title || t.task_type || "Task"}
                          </Text>
                          {t.approval_required ? (
                            <Text style={styles.approvalFlag}>Approval required</Text>
                          ) : null}
                        </View>
                        <StatusBadge status={t.status} />
                      </View>
                    ))
                  )}
                </View>
              );
            })
          )}

          {/* Approve all pending */}
          <Text style={styles.sectionLabel}>Pending approvals ({pendingApprovals.length})</Text>
          {pendingApprovals.length === 0 ? (
            <Text style={styles.muted}>No pending approvals for this thread.</Text>
          ) : (
            <>
              {pendingApprovals.map((a) => (
                <View key={a.id} style={styles.approvalRow}>
                  <Text style={styles.approvalTitle} numberOfLines={2}>
                    {a.title || a.request_type || "Approval"}
                  </Text>
                  <StatusBadge status={a.status} />
                </View>
              ))}
              <Pressable
                style={[styles.approveAllBtn, approvingAll && styles.btnDisabled]}
                onPress={confirmApproveAll}
                disabled={approvingAll}
              >
                <Text style={styles.approveAllText}>
                  {approvingAll ? "Approving…" : `Approve all ${pendingApprovals.length} pending`}
                </Text>
              </Pressable>
              {!!approveAllNote && <Text style={styles.sendNote}>{approveAllNote}</Text>}
            </>
          )}
          <Text style={styles.footNote}>
            Approve-all decides each approval through forge-approve. Gated actions (send /
            publish / spend / delete) only execute after approval — nothing here sends
            anything by itself.
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
  subLabel: { color: "#fff", fontSize: 13, fontWeight: "800", marginTop: 10 },
  muted: { color: THEME.textFaint, fontSize: 12 },
  message: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 10,
  },
  messageRole: { color: THEME.purpleBright, fontSize: 10, fontWeight: "900" },
  messageText: { color: "#fff", fontSize: 13, lineHeight: 18, marginTop: 3 },
  messageTime: { color: THEME.textFaint, fontSize: 11, marginTop: 4 },
  loadMoreBtn: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadMoreText: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
  input: { color: "#fff", fontSize: 15, minHeight: 56, textAlignVertical: "top" },
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
  jobTitle: { color: "#fff", fontSize: 14, fontWeight: "800", flex: 1 },
  jobError: { color: THEME.pink, fontSize: 12, marginTop: 6 },
  planLine: { color: THEME.textMuted, fontSize: 12, lineHeight: 18 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
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
  approveAllBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  approveAllText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  btnDisabled: { opacity: 0.45 },
  footNote: { color: THEME.textFaint, fontSize: 11, lineHeight: 15 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },
});
