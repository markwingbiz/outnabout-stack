// Livework+ Deliverables screen — Phase 8 Slice 2.
// List + detail with content preview. Approve / Publish / Reject go
// ONLY through the forge-deliverable-admin Edge Function (new in this
// slice — source in supabase/functions/forge-deliverable-admin).
// The UI never writes deliverables.status directly: transitions are
// enforced server-side (design §5.1) and every change writes an audit
// row. Until that function is deployed, the action buttons fail with
// an error shown on screen.
//
// Historical exclusion: this view shows post-Phase-A deliverables only
// (created_at >= PHASE_A_CUTOFF). The 6,719 Mar–May 2026 historical rows
// stay in the DB untouched and out of live views, per Mark's decision.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  PHASE_A_CUTOFF_ISO,
  asPrettyJson,
  callForge,
  formatDate,
  newIdempotencyKey,
  normalizeStatus,
  transitionsForDeliverable,
  type DeliverableRow,
  type DeliverableTransition,
  type DeliverableTransitionResponse,
} from "../../lib/forge";

type StatusFilter = "ALL" | "DRAFT" | "READY" | "APPROVED" | "PUBLISHED" | "REJECTED";

type ApprovalInfo = {
  id: string;
  status: string | null;
  request_type: string | null;
  title: string | null;
};

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = normalizeStatus(status);
  const color =
    s === "PUBLISHED"
      ? THEME.green
      : s === "APPROVED" || s === "READY"
        ? THEME.blue
        : s === "DRAFT"
          ? THEME.orange
          : s === "REJECTED"
            ? THEME.pink
            : THEME.textMuted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{s || "—"}</Text>
    </View>
  );
}

export default function DeliverablesScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <DeliverablesContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function DeliverablesContent() {
  const [rows, setRows] = useState<DeliverableRow[]>([]);
  const [funnelNames, setFunnelNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [funnelFilter, setFunnelFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalInfo | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const [d, f] = await Promise.all([
        supabase
          .from("deliverables")
          .select("*")
          .gte("created_at", PHASE_A_CUTOFF_ISO)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("funnels").select("id, name, slug").order("name", { ascending: true }),
      ]);
      if (d.error) throw new Error(d.error.message);
      // Funnel names are a label nicety — never fail the list for them.
      const names = new Map<string, string>();
      if (!f.error) {
        for (const row of (f.data ?? []) as { id: string; name: string | null; slug: string | null }[]) {
          names.set(row.id, row.name ?? row.slug ?? row.id);
        }
      }
      setFunnelNames(names);
      setRows((d.data ?? []) as DeliverableRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load deliverables.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const types = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.deliverable_type) seen.add(r.deliverable_type);
    }
    return [...seen].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && normalizeStatus(r.status) !== statusFilter) return false;
      if (typeFilter !== "ALL" && r.deliverable_type !== typeFilter) return false;
      if (funnelFilter !== "ALL" && r.funnel_id !== funnelFilter) return false;
      return true;
    });
  }, [rows, statusFilter, typeFilter, funnelFilter]);

  async function loadApproval(deliverable: DeliverableRow) {
    setApproval(null);
    setApprovalError(null);
    if (!deliverable.approval_id || !supabase) return;
    try {
      const { data, error: qError } = await supabase
        .from("approvals")
        .select("id, status, request_type, title")
        .eq("id", deliverable.approval_id)
        .maybeSingle();
      if (qError) throw new Error(qError.message);
      setApproval((data ?? null) as ApprovalInfo | null);
      if (!data) setApprovalError("Linked approval row not found.");
    } catch (e) {
      setApprovalError(e instanceof Error ? e.message : "Could not load linked approval.");
    }
  }

  function toggleExpand(row: DeliverableRow) {
    if (expandedId === row.id) {
      setExpandedId(null);
      setApproval(null);
      setApprovalError(null);
      return;
    }
    setExpandedId(row.id);
    void loadApproval(row);
  }

  async function doTransition(row: DeliverableRow, transition: DeliverableTransition) {
    setActing(true);
    setError(null);
    try {
      await callForge<DeliverableTransitionResponse>("forge-deliverable-admin", {
        action: "transition_deliverable",
        deliverable_id: row.id,
        transition,
        idempotency_key: newIdempotencyKey(),
      });
      await refresh();
      await loadApproval(row);
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} (If the function is not deployed yet, deploy forge-deliverable-admin first.)`
          : `Could not ${transition} deliverable.`,
      );
    } finally {
      setActing(false);
    }
  }

  function confirmTransition(row: DeliverableRow, transition: DeliverableTransition) {
    const label = transition === "approve" ? "Approve" : transition === "publish" ? "Publish" : "Reject";
    Alert.alert(
      `${label} deliverable?`,
      transition === "publish"
        ? "Publishing marks this deliverable as published. The linked approval (if any) must already be approved."
        : transition === "reject"
          ? "Rejected is terminal — this deliverable cannot be approved afterwards."
          : "Approving moves this deliverable to approved. Publish it afterwards to mark it published.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: label,
          style: transition === "reject" ? "destructive" : "default",
          onPress: () => void doTransition(row, transition),
        },
      ],
    );
  }

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "DRAFT", label: "Draft" },
    { key: "READY", label: "Ready" },
    { key: "APPROVED", label: "Approved" },
    { key: "PUBLISHED", label: "Published" },
    { key: "REJECTED", label: "Rejected" },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Deliverables</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
        </Pressable>
      </View>

      <View style={styles.noteBox}>
        <Text style={styles.noteText}>
          Post-Phase-A deliverables only — historical Mar–May 2026 rows are excluded. Approve /
          Publish / Reject call the forge-deliverable-admin Edge Function (new in this slice — it
          needs a deploy to work live). The UI never writes deliverables.status directly.
        </Text>
      </View>

      {!!error && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.chipRow}>
        {statusTabs.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.chip, statusFilter === t.key && styles.chipActive]}
            onPress={() => setStatusFilter(t.key)}
          >
            <Text style={[styles.chipText, statusFilter === t.key && styles.chipTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, typeFilter === "ALL" && styles.chipActive]}
          onPress={() => setTypeFilter("ALL")}
        >
          <Text style={[styles.chipText, typeFilter === "ALL" && styles.chipTextActive]}>
            All types
          </Text>
        </Pressable>
        {types.map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, typeFilter === t && styles.chipActive]}
            onPress={() => setTypeFilter(t)}
          >
            <Text style={[styles.chipText, typeFilter === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, funnelFilter === "ALL" && styles.chipActive]}
          onPress={() => setFunnelFilter("ALL")}
        >
          <Text style={[styles.chipText, funnelFilter === "ALL" && styles.chipTextActive]}>
            All funnels
          </Text>
        </Pressable>
        {[...funnelNames.entries()].map(([id, name]) => (
          <Pressable
            key={id}
            style={[styles.chip, funnelFilter === id && styles.chipActive]}
            onPress={() => setFunnelFilter(id)}
          >
            <Text style={[styles.chipText, funnelFilter === id && styles.chipTextActive]}>
              {name}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={THEME.purpleBright} size="large" style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>
          {rows.length === 0
            ? "No post-Phase-A deliverables yet."
            : "No deliverables match these filters."}
        </Text>
      ) : (
        filtered.map((row) => {
          const expanded = expandedId === row.id;
          const transitions = transitionsForDeliverable(row.status);
          // Publish gate (UI mirror of the server rule): when the
          // deliverable carries an approval_id, Publish is disabled
          // until the linked approval is approved.
          const publishBlocked =
            !!row.approval_id &&
            (approvalError != null ||
              approval == null ||
              normalizeStatus(approval.status) !== "APPROVED");
          return (
            <View key={row.id} style={styles.card}>
              <Pressable onPress={() => toggleExpand(row)}>
                <View style={styles.rowBetween}>
                  <Text style={styles.deliverableTitle} numberOfLines={2}>
                    {row.title || row.deliverable_type || "Untitled deliverable"}
                  </Text>
                  <StatusBadge status={row.status} />
                </View>
                {!!row.summary && (
                  <Text style={styles.summary} numberOfLines={3}>
                    {row.summary}
                  </Text>
                )}
                <Text style={styles.meta}>
                  {row.deliverable_type ?? "—"} · {row.worker_name ?? "—"} ·{" "}
                  {row.funnel_id ? (funnelNames.get(row.funnel_id) ?? "—") : "—"}
                </Text>
                <Text style={styles.meta}>Created: {formatDate(row.created_at)}</Text>
              </Pressable>

              {expanded && (
                <View style={styles.detail}>
                  {!!row.content && (
                    <>
                      <Text style={styles.detailTitle}>Content</Text>
                      <ScrollView style={styles.previewBox} nestedScrollEnabled>
                        <Text style={styles.previewText}>{row.content}</Text>
                      </ScrollView>
                    </>
                  )}
                  {row.content_json != null && (
                    <>
                      <Text style={styles.detailTitle}>Structured content</Text>
                      <ScrollView style={styles.previewBox} nestedScrollEnabled>
                        <Text style={styles.previewText}>{asPrettyJson(row.content_json)}</Text>
                      </ScrollView>
                    </>
                  )}
                  <Text style={styles.detailLine}>Task: {row.task_id ?? "—"}</Text>
                  <Text style={styles.detailLine}>Worker: {row.worker_name ?? "—"}</Text>
                  <Text style={styles.detailLine}>
                    Funnel: {row.funnel_id ? (funnelNames.get(row.funnel_id) ?? row.funnel_id) : "—"}
                  </Text>
                  {!!row.approval_id && (
                    <>
                      <Text style={styles.detailLine}>Approval: {row.approval_id}</Text>
                      {approval ? (
                        <Text style={styles.detailLine}>
                          Linked approval: {approval.title ?? "—"} (
                          {normalizeStatus(approval.status)})
                        </Text>
                      ) : approvalError ? (
                        <Text style={styles.detailLine}>Linked approval: {approvalError}</Text>
                      ) : (
                        <Text style={styles.detailLine}>Linked approval: loading…</Text>
                      )}
                    </>
                  )}

                  {transitions.length > 0 ? (
                    <View style={styles.buttonRow}>
                      {transitions.map((t) => {
                        const blocked = t.transition === "publish" && publishBlocked;
                        return (
                          <Pressable
                            key={t.transition}
                            style={[
                              styles.actionBtn,
                              t.transition === "reject" && styles.actionBtnDanger,
                              (acting || blocked) && styles.actionBtnDisabled,
                            ]}
                            onPress={() => confirmTransition(row, t.transition)}
                            disabled={acting || blocked}
                          >
                            <Text style={styles.actionText}>
                              {acting ? "Working…" : t.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.terminalNote}>
                      This deliverable is in a terminal state — no actions available.
                    </Text>
                  )}
                  {publishBlocked && (
                    <Text style={styles.blockedNote}>
                      Publish is blocked until the linked approval is approved.
                    </Text>
                  )}
                  {normalizeStatus(row.status) === "DRAFT" && (
                    <Text style={styles.blockedNote}>
                      Approve is available once the deliverable is ready.
                    </Text>
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
  noteBox: {
    backgroundColor: "rgba(56,189,248,0.10)",
    borderRadius: 12,
    padding: 10,
  },
  noteText: { color: THEME.blue, fontSize: 12, lineHeight: 16 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
  },
  errorCard: { borderColor: "rgba(236,72,153,0.5)" },
  errorText: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  empty: { color: THEME.textMuted, fontSize: 14, textAlign: "center", marginTop: 24 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { borderColor: THEME.purpleBright, backgroundColor: "rgba(168,85,247,0.15)" },
  chipText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: "#fff" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  deliverableTitle: { color: "#fff", fontSize: 16, fontWeight: "800", flex: 1 },
  summary: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  meta: { color: THEME.textMuted, fontSize: 12, marginTop: 6 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },
  detail: { marginTop: 12, gap: 6 },
  detailTitle: { color: "#fff", fontSize: 13, fontWeight: "800", marginTop: 8 },
  detailLine: { color: THEME.textMuted, fontSize: 12, lineHeight: 17 },
  previewBox: {
    maxHeight: 300,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 10,
  },
  previewText: { color: "#fff", fontSize: 12, lineHeight: 17 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  actionBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  actionBtnDanger: { backgroundColor: "rgba(236,72,153,0.22)" },
  actionBtnDisabled: { opacity: 0.5 },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  terminalNote: { color: THEME.textFaint, fontSize: 12, marginTop: 6 },
  blockedNote: { color: THEME.orange, fontSize: 12, lineHeight: 16, marginTop: 4 },
});
