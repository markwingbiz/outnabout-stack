// Livework+ Funnel detail — Phase 8 Slice 3.
// One funnel: full record, money goal (money_funnels), assigned workers,
// recent jobs, pending approvals, recent deliverables (post-Phase-A only),
// plus the money-goal editor (forge-funnel `configure` action).
// The UI never writes funnels/money_funnels directly: money-goal edits go
// through forge-funnel. Until that function is redeployed with the
// configure action, saving fails with an on-screen error.
// Lifecycle actions (Validate/Activate/...) live on the Funnels list —
// they are not duplicated here.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  callForge,
  formatCents,
  formatDate,
  moneyTargetCents,
  normalizeStatus,
  PHASE_A_CUTOFF_ISO,
  type DeliverableRow,
  type FunnelConfigureResponse,
  type FunnelStatusPayload,
  type MoneyFunnelRow,
} from "../../lib/forge";

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = normalizeStatus(status);
  const color =
    s === "ACTIVE"
      ? THEME.green
      : s === "VALIDATED" || s === "READY"
        ? THEME.blue
        : s === "PAUSED" || s === "APPROVAL_REQUIRED"
          ? THEME.orange
          : s === "STOPPED" || s === "FAILED" || s === "CANCELLED"
            ? THEME.pink
            : THEME.textMuted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{s || "—"}</Text>
    </View>
  );
}

function JobBadge({ status }: { status: string | null | undefined }) {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function FunnelDetailScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <FunnelDetailContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function FunnelDetailContent() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawId = params.id;
  const funnelId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [payload, setPayload] = useState<FunnelStatusPayload | null>(null);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Money-goal editor state (dollars as typed; converted to cents on save).
  const [modelInput, setModelInput] = useState("");
  const [targetDollarsInput, setTargetDollarsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(
    async (withSpinner = true) => {
      if (!funnelId) {
        setError("No funnel selected.");
        setLoading(false);
        return;
      }
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }
      if (withSpinner) setRefreshing(true);
      setError(null);
      try {
        const [statusResp, delivs] = await Promise.all([
          callForge<FunnelStatusPayload>("forge-funnel", { action: "status", funnel_id: funnelId }),
          supabase
            .from("deliverables")
            .select("*")
            .eq("funnel_id", funnelId)
            .gte("created_at", PHASE_A_CUTOFF_ISO)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        if (delivs.error) throw new Error(delivs.error.message);
        setPayload(statusResp);
        setDeliverables((delivs.data ?? []) as DeliverableRow[]);
        // Prefill the editor from the canonical money goal. The canonical
        // row is the one carrying a target when one exists (the 2026-10-21
        // remap puts exactly one target per funnel family), else the
        // backfill_* mirror, else the first row — the same rule as the
        // Funnels list.
        const moneyRows = (statusResp.money_funnels ?? []) as MoneyFunnelRow[];
        const canonical =
          moneyRows.find((r) => moneyTargetCents(r) !== null) ??
          moneyRows.find((r) => (r.key ?? "").startsWith("backfill_")) ??
          moneyRows[0] ??
          null;
        setModelInput(canonical?.revenue_model ?? "");
        const target = canonical ? moneyTargetCents(canonical) : null;
        setTargetDollarsInput(target != null ? (target / 100).toFixed(2) : "");
        setSaveSuccess(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load funnel detail.");
      } finally {
        setLoading(false);
        if (withSpinner) setRefreshing(false);
      }
    },
    [funnelId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  async function saveMoneyGoal() {
    if (!funnelId) return;
    setSaveError(null);
    setSaveSuccess(false);
    const model = modelInput.trim();
    if (!model) {
      setSaveError("Revenue model is required (e.g. venue_subscriptions).");
      return;
    }
    const dollars = Number(targetDollarsInput.trim());
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setSaveError("Target must be a positive dollar amount (e.g. 25000).");
      return;
    }
    const targetCents = Math.round(dollars * 100);
    setSaving(true);
    try {
      await callForge<FunnelConfigureResponse>("forge-funnel", {
        action: "configure",
        funnel_id: funnelId,
        revenue_model: model,
        revenue_target_cents: targetCents,
      });
      setSaveSuccess(true);
      await load(false);
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? `${e.message} (If forge-funnel has not been redeployed with the configure action yet, deploy it first.)`
          : "Could not save the money goal.",
      );
    } finally {
      setSaving(false);
    }
  }

  const funnel = payload?.funnel ?? null;
  const goal = payload?.money_goal ?? null;
  const progressPct =
    goal && goal.revenue_target_cents != null && goal.revenue_target_cents > 0
      ? Math.round((goal.verified_revenue_cents / goal.revenue_target_cents) * 1000) / 10
      : null;
  const config = (funnel?.config ?? {}) as Record<string, unknown>;
  const objective = typeof config.objective === "string" ? config.objective : null;
  const trigger =
    typeof config.trigger === "string"
      ? config.trigger
      : typeof config.schedule === "string"
        ? config.schedule
        : null;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push("/(tabs)/funnels")}>
        <Text style={styles.backLink}>← All funnels</Text>
      </Pressable>

      {!!error && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={THEME.purpleBright} size="large" style={{ marginTop: 24 }} />
      ) : !funnel ? (
        <Text style={styles.empty}>Funnel not found.</Text>
      ) : (
        <>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2}>
              {funnel.name || funnel.slug || "Unnamed funnel"}
            </Text>
            <StatusBadge status={funnel.status} />
          </View>
          {!!funnel.slug && <Text style={styles.meta}>Slug: {funnel.slug}</Text>}
          {!!funnel.type && <Text style={styles.meta}>Type: {funnel.type}</Text>}
          {!!funnel.description && <Text style={styles.description}>{funnel.description}</Text>}
          <Text style={styles.meta}>Created: {formatDate(funnel.created_at)}</Text>
          {objective ? <Text style={styles.meta}>Objective: {objective}</Text> : null}
          {trigger ? <Text style={styles.meta}>Trigger: {trigger}</Text> : null}

          {/* Money goal */}
          <Section title="Money goal">
            {goal ? (
              <>
                <Text style={styles.moneyValue}>
                  {goal.revenue_model ?? "No revenue model"} · Target{" "}
                  {goal.revenue_target_cents != null ? formatCents(goal.revenue_target_cents) : "—"}
                </Text>
                <Text style={styles.moneyLine}>
                  Verified revenue: {formatCents(goal.verified_revenue_cents)}
                </Text>
                <Text style={styles.moneyLine}>Costs: {formatCents(goal.spent_cents)}</Text>
                <Text style={styles.moneyLine}>Budget: {formatCents(goal.budget_cents)}</Text>
                <Text
                  style={[styles.moneyLine, { color: goal.net_cents >= 0 ? THEME.green : THEME.pink }]}
                >
                  Net: {formatCents(goal.net_cents)}
                </Text>
                {progressPct != null && (
                  <Text style={styles.moneyLine}>Progress: {progressPct}% of target</Text>
                )}
              </>
            ) : (
              <Text style={styles.moneyMissing}>
                No money goal set — set one below to satisfy the activation gate.
              </Text>
            )}
          </Section>

          {/* Money-goal editor */}
          <Section title="Edit money goal">
            <Text style={styles.fieldLabel}>Revenue model</Text>
            <TextInput
              style={styles.input}
              value={modelInput}
              onChangeText={setModelInput}
              placeholder="e.g. venue_subscriptions"
              placeholderTextColor={THEME.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldLabel}>Revenue target (dollars)</Text>
            <TextInput
              style={styles.input}
              value={targetDollarsInput}
              onChangeText={setTargetDollarsInput}
              placeholder="e.g. 25000"
              placeholderTextColor={THEME.textFaint}
              keyboardType="decimal-pad"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              The target is stored as cents (dollars × 100) in the money row&apos;s metadata. Saving
              calls the forge-funnel configure action — it needs a redeploy of forge-funnel to work
              live.
            </Text>
            {!!saveError && <Text style={styles.saveError}>{saveError}</Text>}
            {saveSuccess && <Text style={styles.saveSuccess}>Money goal saved.</Text>}
            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={() => void saveMoneyGoal()}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save money goal"}</Text>
            </Pressable>
          </Section>

          {/* Workers */}
          <Section title={`Workers (${(payload?.workers ?? []).length})`}>
            {(payload?.workers ?? []).length === 0 ? (
              <Text style={styles.emptyInline}>No workers assigned to this funnel.</Text>
            ) : (
              (payload?.workers ?? []).map((w) => (
                <View key={w.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{w.name || w.slug || "Unnamed worker"}</Text>
                    <Text style={styles.listMeta}>Last run: {formatDate(w.last_run_at)}</Text>
                  </View>
                  <StatusBadge status={w.status} />
                </View>
              ))
            )}
          </Section>

          {/* Recent jobs */}
          <Section title={`Recent jobs (${(payload?.recent_jobs ?? []).length})`}>
            {(payload?.recent_jobs ?? []).length === 0 ? (
              <Text style={styles.emptyInline}>No jobs for this funnel yet.</Text>
            ) : (
              (payload?.recent_jobs ?? []).map((j) => (
                <View key={j.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle} numberOfLines={2}>
                      {j.title || j.job_type || "Job"}
                    </Text>
                    <Text style={styles.listMeta}>{formatDate(j.created_at)}</Text>
                    {!!j.error_text && (
                      <Text style={styles.errorInline} numberOfLines={2}>
                        {j.error_text}
                      </Text>
                    )}
                  </View>
                  <JobBadge status={j.status} />
                </View>
              ))
            )}
          </Section>

          {/* Pending approvals */}
          <Section title={`Pending approvals (${(payload?.pending_approvals ?? []).length})`}>
            {(payload?.pending_approvals ?? []).length === 0 ? (
              <Text style={styles.emptyInline}>No pending approvals for this funnel.</Text>
            ) : (
              (payload?.pending_approvals ?? []).map((a) => (
                <View key={a.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle} numberOfLines={2}>
                      {a.title || a.request_type || "Approval"}
                    </Text>
                    <Text style={styles.listMeta}>
                      {a.request_type ?? ""} · Created {formatDate(a.created_at)}
                    </Text>
                    {a.expires_at ? (
                      <Text style={styles.listMeta}>Expires: {formatDate(a.expires_at)}</Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </Section>

          {/* Recent deliverables (post-Phase-A only) */}
          <Section title={`Recent deliverables (${deliverables.length})`}>
            {deliverables.length === 0 ? (
              <Text style={styles.emptyInline}>
                No post-Phase-A deliverables for this funnel yet. Historical Mar–May 2026 rows are
                excluded.
              </Text>
            ) : (
              deliverables.map((d) => (
                <View key={d.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle} numberOfLines={2}>
                      {d.title || d.deliverable_type || "Deliverable"}
                    </Text>
                    <Text style={styles.listMeta}>
                      {d.deliverable_type ?? ""} · {formatDate(d.created_at)}
                    </Text>
                    {!!d.summary && (
                      <Text style={styles.listMeta} numberOfLines={2}>
                        {d.summary}
                      </Text>
                    )}
                  </View>
                  <StatusBadge status={d.status} />
                </View>
              ))
            )}
          </Section>

          <Pressable
            style={styles.refreshBtn}
            onPress={() => void load()}
            disabled={refreshing}
          >
            <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 14 },
  backLink: { color: THEME.purpleBright, fontSize: 14, fontWeight: "800" },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  title: { color: "#fff", fontSize: 24, fontWeight: "900", flex: 1 },
  meta: { color: THEME.textMuted, fontSize: 12, marginTop: 4 },
  description: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 8 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },
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
  emptyInline: { color: THEME.textMuted, fontSize: 13, lineHeight: 18 },
  section: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
    gap: 6,
  },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "800", marginBottom: 4 },
  moneyValue: { color: "#fff", fontSize: 14, fontWeight: "700" },
  moneyLine: { color: THEME.textMuted, fontSize: 13 },
  moneyMissing: { color: THEME.orange, fontSize: 13, lineHeight: 18 },
  fieldLabel: { color: THEME.textMuted, fontSize: 12, fontWeight: "800", marginTop: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  hint: { color: THEME.textFaint, fontSize: 12, lineHeight: 16 },
  saveError: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  saveSuccess: { color: THEME.green, fontSize: 13, fontWeight: "700" },
  saveBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  listTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  listMeta: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  errorInline: { color: THEME.pink, fontSize: 12, marginTop: 2 },
  refreshBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  refreshText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
});
