// Livework+ Approval detail (Phase 8 Slice 4, audit §5).
//
// Design §10: detail view with payload preview + linked task/job/funnel
// context. Shows expires_at (highlighted when expiring/expired) and a
// human-readable requester label. Decisions go through forge-approve via
// the shared decideApproval helper — the same path as the inbox.
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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  POLL_INTERVAL_MS,
  approvalExpiryState,
  asPrettyJson,
  decideApproval,
  formatDate,
  normalizeStatus,
  requesterLabel,
  usePolling,
  type ApprovalRow,
} from "../../lib/forge";

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = normalizeStatus(status);
  const color =
    s === "APPROVED" ? THEME.green : s === "REJECTED" || s === "EXPIRED" ? THEME.pink : THEME.orange;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{s || "—"}</Text>
    </View>
  );
}

type LinkedContext = {
  taskTitle: string | null;
  taskType: string | null;
  jobTitle: string | null;
  jobId: string | null;
  funnelName: string | null;
  deliverableTitle: string | null;
  workerName: string | null;
};

export default function ApprovalDetailScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <ApprovalDetailContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function ApprovalDetailContent() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const approvalId = typeof params.id === "string" ? params.id : "";

  const [approval, setApproval] = useState<ApprovalRow | null>(null);
  const [context, setContext] = useState<LinkedContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [decideNote, setDecideNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !approvalId) return;
    setRefreshing(true);
    setError(null);
    try {
      const { data, error: aError } = await supabase
        .from("approvals")
        .select("*")
        .eq("id", approvalId)
        .maybeSingle();
      if (aError) throw new Error(aError.message);
      const row = (data ?? null) as ApprovalRow | null;
      setApproval(row);
      if (!row) {
        setContext(null);
        return;
      }
      const ctx: LinkedContext = {
        taskTitle: null,
        taskType: null,
        jobTitle: null,
        jobId: null,
        funnelName: null,
        deliverableTitle: null,
        workerName: null,
      };
      let jobId: string | null = null;
      if (row.task_id) {
        const t = await supabase
          .from("tasks")
          .select("title, task_type, forge_job_id")
          .eq("id", row.task_id)
          .maybeSingle();
        if (!t.error && t.data) {
          const d = t.data as { title: string | null; task_type: string | null; forge_job_id: string | null };
          ctx.taskTitle = d.title;
          ctx.taskType = d.task_type;
          jobId = d.forge_job_id;
        }
      }
      if (jobId) {
        ctx.jobId = jobId;
        const j = await supabase
          .from("forge_jobs")
          .select("title, job_type")
          .eq("id", jobId)
          .maybeSingle();
        if (!j.error && j.data) {
          const d = j.data as { title: string | null; job_type: string | null };
          ctx.jobTitle = d.title ?? d.job_type;
        }
      }
      if (row.funnel_id) {
        const f = await supabase
          .from("funnels")
          .select("name, slug")
          .eq("id", row.funnel_id)
          .maybeSingle();
        if (!f.error && f.data) {
          const d = f.data as { name: string | null; slug: string | null };
          ctx.funnelName = d.name ?? d.slug;
        }
      }
      if (row.deliverable_id) {
        const d = await supabase
          .from("deliverables")
          .select("title, deliverable_type")
          .eq("id", row.deliverable_id)
          .maybeSingle();
        if (!d.error && d.data) {
          const dd = d.data as { title: string | null; deliverable_type: string | null };
          ctx.deliverableTitle = dd.title ?? dd.deliverable_type;
        }
      }
      if (row.worker_id) {
        const w = await supabase
          .from("workers")
          .select("name, slug")
          .eq("id", row.worker_id)
          .maybeSingle();
        if (!w.error && w.data) {
          const d = w.data as { name: string | null; slug: string | null };
          ctx.workerName = d.name ?? d.slug;
        }
      }
      setContext(ctx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load approval.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [approvalId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePolling(() => void refresh(), POLL_INTERVAL_MS, Boolean(approvalId));

  async function decide(decision: "approve" | "reject", reason?: string) {
    if (!approval || acting) return;
    setActing(true);
    setError(null);
    setDecideNote(null);
    try {
      await decideApproval(approval.id, decision, reason);
      setDecideNote(decision === "approve" ? "Approved." : "Rejected.");
      setRejecting(false);
      setRejectReason("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record decision.");
    } finally {
      setActing(false);
    }
  }

  if (!approvalId) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>No approval selected.</Text>
        <Pressable onPress={() => router.push("/(tabs)/approvals")}>
          <Text style={styles.link}>Back to Approvals</Text>
        </Pressable>
      </View>
    );
  }

  const isPending = approval ? normalizeStatus(approval.status) === "PENDING" : false;
  const expiry = approval ? approvalExpiryState(approval) : null;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/(tabs)/approvals")}>
        <Text style={styles.link}>← Back to Approvals</Text>
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
      ) : !approval ? (
        <Text style={styles.empty}>Approval not found.</Text>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.title} numberOfLines={3}>
                {approval.title || "Approval request"}
              </Text>
              <StatusBadge status={approval.status} />
            </View>
            <Text style={styles.type}>
              {approval.request_type || approval.approval_type || "general"}
              {approval.priority ? ` · priority ${approval.priority}` : ""}
              {approval.source ? ` · ${approval.source}` : ""}
            </Text>
            {!!(approval.summary || approval.description) && (
              <Text style={styles.summary}>{approval.summary || approval.description}</Text>
            )}
            <Text style={styles.meta}>
              Requested by {requesterLabel(approval.requested_by)} ·{" "}
              {formatDate(approval.created_at)}
            </Text>
            <Text style={styles.meta}>
              Expires: {formatDate(approval.expires_at)}
              {expiry === "expiring" && (
                <Text style={styles.expiring}> · Expiring soon (under 24h)</Text>
              )}
              {expiry === "expired" && (
                <Text style={styles.expired}> · Expired — deciding it auto-expires the request</Text>
              )}
            </Text>
            {!!approval.approved_by && (
              <Text style={styles.meta}>
                Decided by {requesterLabel(approval.approved_by)} ·{" "}
                {formatDate(approval.approved_at ?? approval.rejected_at ?? approval.decided_at)}
              </Text>
            )}
            {!!approval.reason && <Text style={styles.meta}>Reason: {approval.reason}</Text>}
            {!!approval.reviewer_notes && (
              <Text style={styles.meta}>Reviewer notes: {approval.reviewer_notes}</Text>
            )}
            {!!approval.resolution && (
              <Text style={styles.meta}>Resolution: {approval.resolution}</Text>
            )}
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

          <Text style={styles.sectionLabel}>What this gates</Text>
          <View style={styles.card}>
            <Text style={styles.ctxLine}>Task: {context?.taskTitle ?? "—"}{context?.taskType ? ` (${context.taskType})` : ""}</Text>
            <Text style={styles.ctxLine}>
              Job: {context?.jobTitle ?? "—"}
            </Text>
            {context?.jobId && (
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/(tabs)/job-detail", params: { id: context.jobId as string } })
                }
              >
                <Text style={styles.link}>Open job →</Text>
              </Pressable>
            )}
            <Text style={styles.ctxLine}>Funnel: {context?.funnelName ?? "—"}</Text>
            <Text style={styles.ctxLine}>Deliverable: {context?.deliverableTitle ?? "—"}</Text>
            <Text style={styles.ctxLine}>Worker: {context?.workerName ?? "—"}</Text>
          </View>

          <Text style={styles.sectionLabel}>Payload (exact action)</Text>
          <Text style={styles.jsonBlock} selectable>
            {asPrettyJson(approval.payload)}
          </Text>
          {!!approval.details && (
            <Text style={styles.jsonBlock} selectable>
              {approval.details}
            </Text>
          )}

          {isPending && (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Decide</Text>
              {rejecting ? (
                <View style={styles.rejectBox}>
                  <TextInput
                    style={styles.reasonInput}
                    placeholder="Reason for rejection…"
                    placeholderTextColor={THEME.textFaint}
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    multiline
                    editable={!acting}
                  />
                  <View style={styles.buttonRow}>
                    <Pressable
                      style={[styles.btn, styles.btnDanger]}
                      onPress={() => void decide("reject", rejectReason.trim() || undefined)}
                      disabled={acting}
                    >
                      <Text style={styles.btnText}>{acting ? "Rejecting…" : "Confirm Reject"}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.btn, styles.btnGhost]}
                      onPress={() => {
                        setRejecting(false);
                        setRejectReason("");
                      }}
                      disabled={acting}
                    >
                      <Text style={styles.btnText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.buttonRow}>
                  <Pressable
                    style={[styles.btn, styles.btnApprove]}
                    onPress={() => void decide("approve")}
                    disabled={acting}
                  >
                    <Text style={styles.btnText}>{acting ? "Working…" : "Approve ✓"}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnDanger]}
                    onPress={() => setRejecting(true)}
                    disabled={acting}
                  >
                    <Text style={styles.btnText}>Reject ✕</Text>
                  </Pressable>
                </View>
              )}
              {!!decideNote && <Text style={styles.sendNote}>{decideNote}</Text>}
            </View>
          )}
          {!isPending && (
            <Text style={styles.muted}>
              This approval is already decided — no further action is possible.
            </Text>
          )}
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
  type: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800", marginTop: 4 },
  summary: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  meta: { color: THEME.textFaint, fontSize: 12, marginTop: 6 },
  expiring: { color: THEME.orange, fontWeight: "800" },
  expired: { color: THEME.pink, fontWeight: "800" },
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
  ctxLine: { color: THEME.textMuted, fontSize: 13, lineHeight: 19 },
  jsonBlock: {
    color: THEME.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "monospace",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 10,
  },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 11, alignItems: "center" },
  btnApprove: { backgroundColor: THEME.purpleDeep },
  btnDanger: { backgroundColor: "rgba(236,72,153,0.22)" },
  btnGhost: { backgroundColor: "rgba(255,255,255,0.10)" },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  rejectBox: { marginTop: 12, gap: 10 },
  reasonInput: {
    color: "#fff",
    fontSize: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  sendNote: { color: THEME.green, fontSize: 12, marginTop: 8 },
  muted: { color: THEME.textFaint, fontSize: 12 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },
});
