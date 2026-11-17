// Livework+ Funnel controls — every canonical funnel with its money goal
// and lifecycle controls. Status comes from the backend (forge-funnel)
// only; this screen NEVER shows ACTIVE unless the backend says so, and
// it NEVER shows projected revenue as earned — only verified revenue.
// A funnel cannot reach READY/ACTIVE without a money goal (revenue_model
// + target); if Validate/Activate returns missing gates, they show
// under that funnel. Each card links to the funnel-detail screen
// (Phase 8 Slice 3).
// 2026-10-21 Monfun remap: the funnels table also holds sub-rows
// (config.parent_funnel — they nest under their canonical funnel, money
// included) and one legacy row (metadata.registry_note — KC Content,
// not a funnel; never listed or counted).
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
import { useRouter } from "expo-router";
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
  const router = useRouter();
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

  /** Parent funnel id for sub-rows (config.parent_funnel), else null. */
  function parentOf(f: FunnelRow): string | null {
    const v = f.config?.parent_funnel;
    return typeof v === "string" ? v : null;
  }

  /** Legacy rows (metadata.registry_note) are history, not funnels. */
  function isLegacy(f: FunnelRow): boolean {
    const v = f.metadata?.registry_note;
    return typeof v === "string" && v.length > 0;
  }

  type FunnelView = {
    funnel: FunnelRow;
    subFunnels: FunnelRow[];
    money: MoneyFunnelRow | null;
  };

  /**
   * Canonical funnel views: legacy rows dropped, sub-rows nested under
   * their canonical funnel. A funnel's money family is its own money rows
   * plus its sub-rows' rows; the canonical money row is the one carrying
   * the monthly target (Social + SEO's target lives on its SEO sub-row's
   * backfill mirror), else the backfill_* mirror, else the first row.
   * Only canonical rows feed the totals — no double counting.
   */
  const views = useMemo<FunnelView[]>(() => {
    const live = funnels.filter((f) => !isLegacy(f));
    const liveIds = new Set(live.map((f) => f.id));
    const subsByParent = new Map<string, FunnelRow[]>();
    const canonicalList: FunnelRow[] = [];
    for (const f of live) {
      const parent = parentOf(f);
      if (parent && parent !== f.id && liveIds.has(parent)) {
        const list = subsByParent.get(parent) ?? [];
        list.push(f);
        subsByParent.set(parent, list);
      } else {
        canonicalList.push(f);
      }
    }
    return canonicalList.map((funnel) => {
      const subFunnels = subsByParent.get(funnel.id) ?? [];
      const family = [funnel.id, ...subFunnels.map((s) => s.id)].flatMap(
        (id) => moneyByFunnel.get(id) ?? [],
      );
      const money =
        family.find((r) => moneyTargetCents(r) !== null) ??
        family.find((r) => (r.key ?? "").startsWith("backfill_")) ??
        family[0] ??
        null;
      return { funnel, subFunnels, money };
    });
  }, [funnels, moneyByFunnel]);

  const totals = useMemo(() => {
    let target = 0;
    let verified = 0;
    for (const v of views) {
      if (!v.money) continue;
      target += moneyTargetCents(v.money) ?? 0;
      verified += v.money.verified_revenue_cents ?? 0;
    }
    return { target, verified };
  }, [views]);

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

      {!loading && views.length > 0 && (
        <Text style={styles.summaryLine}>
          {views.length} funnels · Combined target {formatCents(totals.target)}/mo ·
          Verified revenue {formatCents(totals.verified)}
        </Text>
      )}

      {loading ? (
        <ActivityIndicator color={THEME.purpleBright} size="large" style={{ marginTop: 24 }} />
      ) : views.length === 0 ? (
        <Text style={styles.empty}>No funnels yet.</Text>
      ) : (
        views.map((view) => {
          const funnel = view.funnel;
          const money = view.money;
          const subFunnels = view.subFunnels;
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

              {subFunnels.length > 0 && (
                <View style={styles.subBox}>
                  <Text style={styles.subLabel}>Includes</Text>
                  {subFunnels.map((s) => (
                    <View key={s.id} style={styles.subRow}>
                      <Text style={styles.subName} numberOfLines={2}>
                        {s.name || s.slug || "Sub-funnel"}
                      </Text>
                      <StatusBadge status={s.status} />
                    </View>
                  ))}
                </View>
              )}

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

              {/* Detail: full record, money goal editor, workers, jobs, approvals, deliverables */}
              <Pressable
                style={styles.detailLink}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/funnel-detail",
                    params: { id: funnel.id },
                  })
                }
              >
                <Text style={styles.detailLinkText}>View detail →</Text>
              </Pressable>
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
  summaryLine: { color: THEME.textMuted, fontSize: 12, fontWeight: "700" },
  subBox: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    gap: 6,
  },
  subLabel: { color: THEME.textMuted, fontSize: 11, fontWeight: "800" },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  subName: { color: THEME.textMuted, fontSize: 12, fontWeight: "700", flex: 1 },
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
  detailLink: { marginTop: 12, alignSelf: "flex-start" },
  detailLinkText: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800" },
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
