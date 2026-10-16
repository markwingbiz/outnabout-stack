// Livework+ Workers screen — Phase 8 Slice 2.
// Registry list (workers table) with contract-completeness + last_run_at
// + status control (active/idle/disabled, operator only).
//
// Status changes go ONLY through the forge-worker-admin Edge Function
// (new in this slice — source in supabase/functions/forge-worker-admin).
// The UI never writes workers.status directly: transitions are enforced
// server-side and every change writes an audit row. Until that function
// is deployed, the status buttons fail with an error shown on screen.
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
  TextInput,
} from "react-native";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  asRecord,
  asStringArray,
  callForge,
  formatDate,
  newIdempotencyKey,
  normalizeStatus,
  workerContractChecklist,
  workerContractComplete,
  workerIsEligible,
  type WorkerRow,
  type WorkerStatusResponse,
} from "../../lib/forge";

type StatusFilter = "ALL" | "ACTIVE" | "IDLE" | "DISABLED";
type ContractFilter = "ALL" | "COMPLETE" | "INCOMPLETE";

type WorkerDetail = {
  jobCount: number;
  deliverableCount: number;
  recentJobs: { id: string; title: string | null; status: string | null; created_at: string | null }[];
  recentDeliverables: { id: string; title: string | null; status: string | null; created_at: string | null }[];
};

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = normalizeStatus(status);
  const color =
    s === "ACTIVE"
      ? THEME.green
      : s === "IDLE"
        ? THEME.orange
        : s === "DISABLED"
          ? THEME.pink
          : THEME.textMuted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{s || "—"}</Text>
    </View>
  );
}

export default function WorkersScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <WorkersContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function WorkersContent() {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [contractFilter, setContractFilter] = useState<ContractFilter>("ALL");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
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
      const { data, error: qError } = await supabase
        .from("workers")
        .select("*")
        .order("name", { ascending: true });
      if (qError) throw new Error(qError.message);
      setWorkers((data ?? []) as WorkerRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (statusFilter !== "ALL" && normalizeStatus(w.status) !== statusFilter) return false;
      const complete = workerContractComplete(w);
      if (contractFilter === "COMPLETE" && !complete) return false;
      if (contractFilter === "INCOMPLETE" && complete) return false;
      if (q) {
        const hay = `${w.name ?? ""} ${w.slug ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [workers, statusFilter, contractFilter, search]);

  async function loadDetail(worker: WorkerRow) {
    if (!supabase) return;
    setDetailLoading(true);
    try {
      const [jobsCount, delsCount, jobs, dels] = await Promise.all([
        supabase
          .from("forge_jobs")
          .select("id", { count: "exact", head: true })
          .eq("worker_id", worker.id),
        supabase
          .from("deliverables")
          .select("id", { count: "exact", head: true })
          .eq("worker_id", worker.id),
        supabase
          .from("forge_jobs")
          .select("id, title, status, created_at")
          .eq("worker_id", worker.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("deliverables")
          .select("id, title, status, created_at")
          .eq("worker_id", worker.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (jobsCount.error) throw new Error(jobsCount.error.message);
      if (delsCount.error) throw new Error(delsCount.error.message);
      if (jobs.error) throw new Error(jobs.error.message);
      if (dels.error) throw new Error(dels.error.message);
      setDetail({
        jobCount: jobsCount.count ?? 0,
        deliverableCount: delsCount.count ?? 0,
        recentJobs: (jobs.data ?? []) as WorkerDetail["recentJobs"],
        recentDeliverables: (dels.data ?? []) as WorkerDetail["recentDeliverables"],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load worker detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleExpand(worker: WorkerRow) {
    if (expandedId === worker.id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(worker.id);
    setDetail(null);
    void loadDetail(worker);
  }

  async function doSetStatus(worker: WorkerRow, status: string) {
    setActing(true);
    setError(null);
    try {
      await callForge<WorkerStatusResponse>("forge-worker-admin", {
        action: "set_worker_status",
        worker_id: worker.id,
        status,
        idempotency_key: newIdempotencyKey(),
      });
      await refresh();
      await loadDetail(worker);
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} (If the function is not deployed yet, deploy forge-worker-admin first.)`
          : `Could not set worker status.`,
      );
    } finally {
      setActing(false);
    }
  }

  function confirmSetStatus(worker: WorkerRow, status: string) {
    const label = status === "active" ? "Active" : status === "idle" ? "Idle" : "Disabled";
    Alert.alert(
      `Set worker ${label}?`,
      status === "disabled"
        ? "Disabled workers are never dispatched. This does not delete the worker."
        : status === "active"
          ? "Active workers with a complete contract become dispatchable."
          : "Idle workers stay registered but are not dispatched.",
      [
        { text: "Cancel", style: "cancel" },
        { text: `Set ${label}`, onPress: () => void doSetStatus(worker, status) },
      ],
    );
  }

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "ACTIVE", label: "Active" },
    { key: "IDLE", label: "Idle" },
    { key: "DISABLED", label: "Disabled" },
  ];
  const contractTabs: { key: ContractFilter; label: string }[] = [
    { key: "ALL", label: "All contracts" },
    { key: "COMPLETE", label: "Complete" },
    { key: "INCOMPLETE", label: "Incomplete" },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Workers</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
        </Pressable>
      </View>

      <View style={styles.noteBox}>
        <Text style={styles.noteText}>
          Status changes call the forge-worker-admin Edge Function (new in this slice — it needs a
          deploy to work live). The UI never writes workers.status directly.
        </Text>
      </View>

      {!!error && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <TextInput
        style={styles.search}
        placeholder="Search name or slug…"
        placeholderTextColor={THEME.textFaint}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

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
        {contractTabs.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.chip, contractFilter === t.key && styles.chipActive]}
            onPress={() => setContractFilter(t.key)}
          >
            <Text style={[styles.chipText, contractFilter === t.key && styles.chipTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={THEME.purpleBright} size="large" style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>
          {workers.length === 0 ? "No workers in the registry yet." : "No workers match these filters."}
        </Text>
      ) : (
        filtered.map((worker) => {
          const complete = workerContractComplete(worker);
          const eligible = workerIsEligible(worker);
          const expanded = expandedId === worker.id;
          const checklist = workerContractChecklist(worker);
          const relatedTo = asStringArray(asRecord(worker.metadata).related_to);
          return (
            <View key={worker.id} style={styles.card}>
              <Pressable onPress={() => toggleExpand(worker)}>
                <View style={styles.rowBetween}>
                  <Text style={styles.workerName} numberOfLines={2}>
                    {worker.name || worker.slug || "Unnamed worker"}
                  </Text>
                  <StatusBadge status={worker.status} />
                </View>
                {!!worker.slug && <Text style={styles.slug}>{worker.slug}</Text>}
                {!!worker.short_role && (
                  <Text style={styles.role} numberOfLines={2}>
                    {worker.short_role}
                  </Text>
                )}
                <View style={styles.metaRow}>
                  <Text style={[styles.meta, { color: complete ? THEME.green : THEME.orange }]}>
                    Contract: {complete ? "complete" : "incomplete"}
                  </Text>
                  <Text style={[styles.meta, { color: eligible ? THEME.green : THEME.textMuted }]}>
                    {eligible ? "Dispatch-eligible" : "Not dispatchable"}
                  </Text>
                </View>
                <Text style={styles.meta}>Last run: {formatDate(worker.last_run_at)}</Text>
              </Pressable>

              {expanded && (
                <View style={styles.detail}>
                  {!!worker.description && (
                    <Text style={styles.description}>{worker.description}</Text>
                  )}
                  <Text style={styles.detailTitle}>Contract checklist</Text>
                  {checklist.map((c) => (
                    <Text key={c.label} style={styles.checkLine}>
                      {c.ok ? "✓" : "✗"} {c.label}
                    </Text>
                  ))}
                  <Text style={styles.detailLine}>Category: {worker.category ?? "—"}</Text>
                  <Text style={styles.detailLine}>Queue: {worker.queue_name ?? "—"}</Text>
                  <Text style={styles.detailLine}>
                    Max attempts: {worker.max_attempts ?? "—"} · Timeout:{" "}
                    {worker.timeout_seconds ?? "—"}s
                  </Text>
                  <Text style={styles.detailLine}>Model: {worker.model ?? "—"}</Text>
                  <Text style={styles.detailLine}>
                    Requires approval for:{" "}
                    {asStringArray(worker.requires_approval_for).join(", ") || "—"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Tools: {asStringArray(worker.tools).join(", ") || "—"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Capabilities: {asStringArray(worker.capabilities).join(", ") || "—"}
                  </Text>
                  {relatedTo.length > 0 && (
                    <Text style={styles.detailLine}>Related to: {relatedTo.join(", ")}</Text>
                  )}

                  <Text style={styles.detailTitle}>Linked work</Text>
                  {detailLoading ? (
                    <ActivityIndicator color={THEME.purpleBright} />
                  ) : detail ? (
                    <>
                      <Text style={styles.detailLine}>
                        Jobs: {detail.jobCount} · Deliverables: {detail.deliverableCount}
                      </Text>
                      {detail.recentJobs.map((j) => (
                        <Text key={j.id} style={styles.linkedLine}>
                          Job · {j.title ?? "Untitled"} ({normalizeStatus(j.status)})
                        </Text>
                      ))}
                      {detail.recentDeliverables.map((d) => (
                        <Text key={d.id} style={styles.linkedLine}>
                          Deliverable · {d.title ?? "Untitled"} ({normalizeStatus(d.status)})
                        </Text>
                      ))}
                      {detail.recentJobs.length === 0 &&
                        detail.recentDeliverables.length === 0 && (
                          <Text style={styles.detailLine}>No jobs or deliverables yet.</Text>
                        )}
                    </>
                  ) : (
                    <Text style={styles.detailLine}>Could not load linked work.</Text>
                  )}

                  <Text style={styles.detailTitle}>Set status</Text>
                  <View style={styles.buttonRow}>
                    {(["active", "idle", "disabled"] as const).map((s) => (
                      <Pressable
                        key={s}
                        style={[
                          styles.actionBtn,
                          s === "disabled" && styles.actionBtnDanger,
                          acting && styles.actionBtnDisabled,
                        ]}
                        onPress={() => confirmSetStatus(worker, s)}
                        disabled={acting}
                      >
                        <Text style={styles.actionText}>
                          {acting ? "Working…" : `Set ${s === "active" ? "Active" : s === "idle" ? "Idle" : "Disabled"}`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
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
  search: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusSm,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
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
  workerName: { color: "#fff", fontSize: 16, fontWeight: "800", flex: 1 },
  slug: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  role: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  meta: { color: THEME.textMuted, fontSize: 12 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },
  detail: { marginTop: 12, gap: 6 },
  description: { color: THEME.textMuted, fontSize: 13, lineHeight: 18 },
  detailTitle: { color: "#fff", fontSize: 13, fontWeight: "800", marginTop: 8 },
  checkLine: { color: THEME.textMuted, fontSize: 12, lineHeight: 17 },
  detailLine: { color: THEME.textMuted, fontSize: 12, lineHeight: 17 },
  linkedLine: { color: "#fff", fontSize: 12, lineHeight: 17 },
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
});
