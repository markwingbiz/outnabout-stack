// Livework+ Approvals inbox — pending approvals first, decided below.
// Approve / Reject go through forge-approve via the shared decideApproval
// helper (same path as approval-detail). Rejections ask for a reason
// before confirming. Cards link to approval-detail for the full payload.
//
// Phase 8 Slice 4 (audit §5 + §12): expires_at with expiring/expired
// highlight, human-readable requester label, detail links, 30s polling,
// Load more decided approvals.
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
import { useRouter } from "expo-router";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  POLL_INTERVAL_MS,
  approvalExpiryState,
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
    s === "APPROVED"
      ? THEME.green
      : s === "REJECTED" || s === "EXPIRED" || s === "CANCELLED"
        ? THEME.pink
        : THEME.orange;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{s || "—"}</Text>
    </View>
  );
}

function ExpiryLine({ approval }: { approval: ApprovalRow }) {
  const state = approvalExpiryState(approval);
  return (
    <Text style={styles.meta}>
      Expires: {formatDate(approval.expires_at)}
      {state === "expiring" && (
        <Text style={styles.expiring}> · Expiring soon (under 24h)</Text>
      )}
      {state === "expired" && (
        <Text style={styles.expired}> · Expired — deciding it auto-expires the request</Text>
      )}
    </Text>
  );
}

const DECIDED_PAGE = 50;

export default function ApprovalsScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <ApprovalsContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function ApprovalsContent() {
  const router = useRouter();
  const [pending, setPending] = useState<ApprovalRow[]>([]);
  const [decided, setDecided] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showDecided, setShowDecided] = useState(false);
  const [decidedLimit, setDecidedLimit] = useState(DECIDED_PAGE);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const [p, d] = await Promise.all([
        supabase
          .from("approvals")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
        supabase
          .from("approvals")
          .select("*")
          .in("status", ["approved", "rejected"])
          .order("created_at", { ascending: false })
          .limit(decidedLimit),
      ]);
      if (p.error) throw new Error(p.error.message);
      if (d.error) throw new Error(d.error.message);
      setPending((p.data ?? []) as ApprovalRow[]);
      setDecided((d.data ?? []) as ApprovalRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load approvals.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [decidedLimit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePolling(() => void refresh(), POLL_INTERVAL_MS);

  function openDetail(id: string) {
    router.push({ pathname: "/(tabs)/approval-detail", params: { id } });
  }

  async function decide(
    approval: ApprovalRow,
    decision: "approve" | "reject",
    reason?: string,
  ) {
    setActingId(approval.id);
    setError(null);
    try {
      await decideApproval(approval.id, decision, reason);
      setRejectingId(null);
      setRejectReason("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record decision.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Approvals</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>
            {refreshing ? "Refreshing…" : "Refresh ↻ · auto-refreshes every 30s"}
          </Text>
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
      ) : (
        <>
          <Text style={styles.sectionTitle}>Pending ({pending.length})</Text>
          {pending.length === 0 ? (
            <Text style={styles.empty}>No pending approvals.</Text>
          ) : (
            pending.map((a) => {
              const acting = actingId === a.id;
              const rejecting = rejectingId === a.id;
              return (
                <View key={a.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Pressable onPress={() => openDetail(a.id)} style={{ flex: 1 }}>
                      <Text style={styles.approvalTitle} numberOfLines={2}>
                        {a.title || "Approval request"}
                      </Text>
                    </Pressable>
                    <StatusBadge status={a.status} />
                  </View>
                  <Text style={styles.type}>
                    {a.request_type || a.approval_type || "general"}
                    {a.priority ? ` · priority ${a.priority}` : ""}
                  </Text>
                  {!!(a.summary || a.description) && (
                    <Text style={styles.summary}>{a.summary || a.description}</Text>
                  )}
                  <Text style={styles.meta}>
                    Requested by {requesterLabel(a.requested_by)} ·{" "}
                    {formatDate(a.created_at)}
                  </Text>
                  <ExpiryLine approval={a} />
                  <Pressable onPress={() => openDetail(a.id)}>
                    <Text style={styles.detailLink}>View detail →</Text>
                  </Pressable>

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
                          onPress={() => void decide(a, "reject", rejectReason.trim() || undefined)}
                          disabled={acting}
                        >
                          <Text style={styles.btnText}>
                            {acting ? "Rejecting…" : "Confirm Reject"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.btn, styles.btnGhost]}
                          onPress={() => {
                            setRejectingId(null);
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
                        onPress={() => void decide(a, "approve")}
                        disabled={acting}
                      >
                        <Text style={styles.btnText}>
                          {acting ? "Working…" : "Approve ✓"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.btn, styles.btnDanger]}
                        onPress={() => setRejectingId(a.id)}
                        disabled={acting}
                      >
                        <Text style={styles.btnText}>Reject ✕</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* Decided — collapsed by default */}
          <Pressable style={styles.decidedToggle} onPress={() => setShowDecided((v) => !v)}>
            <Text style={styles.decidedToggleText}>
              Decided ({decided.length}) {showDecided ? "▲" : "▼"}
            </Text>
          </Pressable>
          {showDecided &&
            decided.map((a) => (
              <View key={a.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Pressable onPress={() => openDetail(a.id)} style={{ flex: 1 }}>
                    <Text style={styles.approvalTitle} numberOfLines={2}>
                      {a.title || "Approval request"}
                    </Text>
                  </Pressable>
                  <StatusBadge status={a.status} />
                </View>
                <Text style={styles.type}>
                  {a.request_type || a.approval_type || "general"}
                </Text>
                <Text style={styles.meta}>
                  Decided {formatDate(a.approved_at ?? a.rejected_at ?? a.reviewed_at)}
                  {!!a.reason && ` · Reason: ${a.reason}`}
                </Text>
                <Pressable onPress={() => openDetail(a.id)}>
                  <Text style={styles.detailLink}>View detail →</Text>
                </Pressable>
              </View>
            ))}
          {showDecided && decided.length >= decidedLimit && (
            <Pressable
              style={styles.loadMoreBtn}
              onPress={() => setDecidedLimit((v) => v + DECIDED_PAGE)}
            >
              <Text style={styles.loadMoreText}>Load more decided</Text>
            </Pressable>
          )}
        </>
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
  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  empty: { color: THEME.textMuted, fontSize: 14, textAlign: "center", marginTop: 8 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  approvalTitle: { color: "#fff", fontSize: 15, fontWeight: "800", flex: 1 },
  type: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800", marginTop: 4 },
  summary: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  meta: { color: THEME.textFaint, fontSize: 12, marginTop: 8 },
  expiring: { color: THEME.orange, fontWeight: "800" },
  expired: { color: THEME.pink, fontWeight: "800" },
  detailLink: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800", marginTop: 6 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
  },
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
  decidedToggle: { paddingVertical: 6 },
  decidedToggleText: { color: THEME.purpleBright, fontSize: 14, fontWeight: "800" },
  loadMoreBtn: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadMoreText: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
});
