// Livework+ Forge chat — the operator interface to the Forge backend.
// Everything shown here comes from live Supabase queries (forge_threads,
// forge_jobs, tasks, approvals). No canned responses, no fake data,
// no simulated execution.
//
// Phase 8 Slice 4 (audit §1 + §12):
// - Execution-paused banner (Phase B not built; no live provider check).
// - Composer sends via forge-command, then navigates to the thread detail
//   (per-thread transcript + per-thread composer live there).
// - Thread rows link to thread detail; the inline expand is gone (it had
//   no composer and duplicated the detail screen).
// - 30s polling + Load more threads. Polling never touches composer input.
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
  callForge,
  formatDate,
  newIdempotencyKey,
  normalizeStatus,
  usePolling,
  type ApprovalRow,
  type ForgeJobRow,
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

const THREAD_PAGE = 100;

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
  const router = useRouter();
  const [threads, setThreads] = useState<ForgeThreadRow[]>([]);
  const [jobs, setJobs] = useState<ForgeJobRow[]>([]);
  const [tasks, setTasks] = useState<ForgeTaskRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [threadLimit, setThreadLimit] = useState(THREAD_PAGE);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const [t, j, tk, a] = await Promise.all([
        supabase
          .from("forge_threads")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(threadLimit),
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
          .from("approvals")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
      ]);
      const firstError = t.error ?? j.error ?? tk.error ?? a.error;
      if (firstError) throw new Error(firstError.message);
      setThreads((t.data ?? []) as ForgeThreadRow[]);
      setJobs((j.data ?? []) as ForgeJobRow[]);
      setTasks((tk.data ?? []) as ForgeTaskRow[]);
      setPendingApprovals((a.data ?? []) as ApprovalRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Forge data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [threadLimit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePolling(() => void refresh(), POLL_INTERVAL_MS);

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
      if (resp.thread_id) {
        // The thread detail is where the transcript + per-thread composer live.
        router.push({ pathname: "/(tabs)/thread-detail", params: { id: resp.thread_id } });
      } else {
        setSendNote(
          resp.deduped
            ? "Command already sent — showing the existing job."
            : `Command sent — job ${String(resp.job_id ?? "").slice(0, 8) || "created"}.`,
        );
        await refresh();
      }
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
          <Text style={styles.refreshText}>
            {refreshing ? "Refreshing…" : "Refresh ↻ · auto-refreshes every 30s"}
          </Text>
        </Pressable>
      </View>

      <ExecutionPausedBanner />

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
          return (
            <Pressable
              key={thread.id}
              onPress={() =>
                router.push({ pathname: "/(tabs)/thread-detail", params: { id: thread.id } })
              }
            >
              <View style={styles.card}>
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
                <Text style={styles.expandHint}>Open thread →</Text>
              </View>
            </Pressable>
          );
        })
      )}
      {threads.length >= threadLimit && (
        <Pressable style={styles.loadMoreBtn} onPress={() => setThreadLimit((v) => v + THREAD_PAGE)}>
          <Text style={styles.loadMoreText}>Load more threads</Text>
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
  loadMoreBtn: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadMoreText: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
});
