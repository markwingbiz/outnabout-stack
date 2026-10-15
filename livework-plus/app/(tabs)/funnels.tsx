// Livework+ Funnel controls — every funnel with its money goal and
// lifecycle controls. Status comes from the backend (forge-funnel) only;
// this screen NEVER shows ACTIVE unless the backend says so, and it
// NEVER shows projected revenue as earned — only verified revenue.
// A funnel cannot reach READY/ACTIVE without a money goal (revenue_model
// + target); if Validate/Activate returns missing gates, they show
// under that funnel.
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
  callForge,
  extractGateFailures,
  formatCents,
  moneyTargetCents,
  normalizeStatus,
  type FunnelActionResponse,
  type FunnelRow,
  type MoneyFunnelRow,
} from "../../lib/forge";

type FunnelAction = "validate" | "activate" | "pause" | "resume" | "stop";

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

/** Which lifecycle buttons the current status allows. Stop is terminal. */
function actionsFor(status: string): { action: FunnelAction; label: string }[] {
  const s = normalizeStatus(status);
  switch (s) {
    case "DRAFT":
      return [
        { action: "validate", label: "Validate" },
        { action: "stop", label: "Stop" },
      ];
    case "VALIDATED":
    case "READY":
      return [
        { action: "validate", label: "Re-validate" },
        { action: "activate", label: "Activate" },
        { action: "stop", label: "Stop" },
      ];
    case "ACTIVE":
      return [
        { action: "pause", label: "Pause" },
        { action: "stop", label: "Stop" },
      ];
    case "PAUSED":
      return [
        { action: "resume", label: "Resume" },
        { action: "stop", label: "Stop" },
      ];
    case "APPROVAL_REQUIRED":
      return [{ action: "stop", label: "Stop" }];
    default:
      return []; // STOPPED / COMPLETED / FAILED are terminal
  }
}

export default function FunnelsScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <FunnelsContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function FunnelsContent() {
  const [funnels, setFunnels] = useState<FunnelRow[]>([]);
  const [moneyRows, setMoneyRows] = useState<MoneyFunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [gateErrors, setGateErrors] = useState<Record<string, string[]>>({});

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const [f, m] = await Promise.all([
        supabase.from("funnels").select("*").order("created_at", { ascending: true }),
        supabase.from("money_funnels").select("*").order("created_at", { ascending: true }),
      ]);
      if (f.error) throw new Error(f.error.message);
      if (m.error) throw new Error(m.error.message);
      setFunnels((f.data ?? []) as FunnelRow[]);
      setMoneyRows((m.data ?? []) as MoneyFunnelRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load funnels.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const moneyByFunnel = useMemo(() => {
    const map = new Map<string, MoneyFunnelRow[]>();
    for (const row of moneyRows) {
      if (!row.funnel_id) continue;
      const list = map.get(row.funnel_id) ?? [];
      list.push(row);
      map.set(row.funnel_id, list);
    }
    return map;
  }, [moneyRows]);

  /** Canonical money view: prefer the backfill_* mirror row, else the first. */
  function canonicalMoney(funnelId: string): MoneyFunnelRow | null {
    const rows = moneyByFunnel.get(funnelId) ?? [];
    if (rows.length === 0) return null;
    return rows.find((r) => (r.key ?? "").startsWith("backfill_")) ?? rows[0];
  }

  async function doAction(funnel: FunnelRow, action: FunnelAction) {
    setActingId(funnel.id);
    setError(null);
    try {
      const resp = await callForge<FunnelActionResponse>("forge-funnel", {
        action,
        funnel_id: funnel.id,
      });
      const gates = extractGateFailures(resp);
      setGateErrors((prev) => ({ ...prev, [funnel.id]: gates }));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} funnel.`);
    } finally {
      setActingId(null);
    }
  }

  function runAction(funnel: FunnelRow, action: FunnelAction) {
    if (action === "stop") {
      Alert.alert(
        "Stop funnel?",
        "STOPPED is terminal — this funnel cannot be resumed afterwards.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Stop",
            style: "destructive",
            onPress: () => void doAction(funnel, "stop"),
          },
        ],
      );
      return;
    }
    void doAction(funnel, action);
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Funnels</Text>
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
      ) : funnels.length === 0 ? (
        <Text style={styles.empty}>No funnels yet.</Text>
      ) : (
        funnels.map((funnel) => {
          const money = canonicalMoney(funnel.id);
          const target = money ? moneyTargetCents(money) : null;
          const verified = money?.verified_revenue_cents ?? 0;
          const spent = money?.spent_cents ?? 0;
          const net = verified - spent;
          const gates = gateErrors[funnel.id] ?? [];
          const actions = actionsFor(funnel.status ?? "");
          const acting = actingId === funnel.id;
          return (
            <View key={funnel.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.funnelName} numberOfLines={2}>
                  {funnel.name || funnel.slug || "Unnamed funnel"}
                </Text>
                <StatusBadge status={funnel.status} />
              </View>
              {!!funnel.description && (
                <Text style={styles.description} numberOfLines={3}>
                  {funnel.description}
                </Text>
              )}

              {/* Money goal — verified revenue only, never projected */}
              <View style={styles.moneyBox}>
                <Text style={styles.moneyLabel}>Money goal</Text>
                {money ? (
                  <>
                    <Text style={styles.moneyValue}>
                      {money.revenue_model ?? "No revenue model"} · Target{" "}
                      {target != null ? formatCents(target) : "—"}
                    </Text>
                    <Text style={styles.moneyLine}>
                      Verified revenue: {formatCents(verified)}
                    </Text>
                    <Text style={styles.moneyLine}>Costs: {formatCents(spent)}</Text>
                    <Text style={[styles.moneyLine, { color: net >= 0 ? THEME.green : THEME.pink }]}>
                      Net: {formatCents(net)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.moneyMissing}>
                    No money goal set — Validate will list it as a missing gate.
                  </Text>
                )}
              </View>

              {gates.length > 0 && (
                <View style={styles.gateBox}>
                  <Text style={styles.gateTitle}>Missing gates:</Text>
                  {gates.map((g, i) => (
                    <Text key={i} style={styles.gateLine}>
                      • {g}
                    </Text>
                  ))}
                </View>
              )}

              {actions.length > 0 ? (
                <View style={styles.buttonRow}>
                  {actions.map((a) => (
                    <Pressable
                      key={a.action}
                      style={[
                        styles.actionBtn,
                        a.action === "stop" && styles.actionBtnDanger,
                        acting && styles.actionBtnDisabled,
                      ]}
                      onPress={() => runAction(funnel, a.action)}
                      disabled={acting}
                    >
                      <Text style={styles.actionText}>
                        {acting ? "Working…" : a.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.terminalNote}>
                  This funnel is in a terminal state — no actions available.
                </Text>
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
  funnelName: { color: "#fff", fontSize: 16, fontWeight: "800", flex: 1 },
  description: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },
  moneyBox: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    gap: 3,
  },
  moneyLabel: { color: THEME.textMuted, fontSize: 11, fontWeight: "800" },
  moneyValue: { color: "#fff", fontSize: 13, fontWeight: "700" },
  moneyLine: { color: THEME.textMuted, fontSize: 12 },
  moneyMissing: { color: THEME.orange, fontSize: 12, lineHeight: 16 },
  gateBox: {
    backgroundColor: "rgba(245,158,11,0.10)",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    gap: 3,
  },
  gateTitle: { color: THEME.orange, fontSize: 12, fontWeight: "800" },
  gateLine: { color: "#fff", fontSize: 12, lineHeight: 16 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  actionBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  actionBtnDanger: { backgroundColor: "rgba(236,72,153,0.22)" },
  actionBtnDisabled: { opacity: 0.5 },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  terminalNote: { color: THEME.textFaint, fontSize: 12, marginTop: 12 },
});
