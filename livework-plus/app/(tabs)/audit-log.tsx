// Livework+ Audit log (Phase 8 Slice 4, audit §11 / design §5.3).
//
// Read-only list of forge_audit_log rows, newest first, filterable by
// actor type + action search. Operator-gated. No client writes — Edge
// Functions write audit rows via service_role. This is the oversight
// trail: every Forge action Mark + Muse monitor lives here.
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
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  AUDIT_ACTOR_TYPES,
  asPrettyJson,
  formatDate,
  type AuditLogRow,
} from "../../lib/forge";

const PAGE = 100;

export default function AuditLogScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <AuditLogContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function AuditLogContent() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [actorFilter, setActorFilter] = useState<string | null>(null);
  const [actionQuery, setActionQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      let q = supabase
        .from("forge_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (actorFilter) q = q.eq("actor_type", actorFilter);
      if (appliedQuery.trim()) {
        const escaped = appliedQuery.trim().replace(/[%_]/g, "");
        q = q.ilike("action", `%${escaped}%`);
      }
      const { data, error: qError } = await q;
      if (qError) throw new Error(qError.message);
      setRows((data ?? []) as AuditLogRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load audit log.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [actorFilter, appliedQuery, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Audit Log</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
        </Pressable>
      </View>
      <Text style={styles.sub}>
        Every Forge action, newest first. Read-only — Edge Functions write these rows.
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Filter by action (e.g. approval.approved)…"
        placeholderTextColor={THEME.textFaint}
        value={actionQuery}
        onChangeText={setActionQuery}
        onSubmitEditing={() => setAppliedQuery(actionQuery)}
        returnKeyType="search"
      />
      <View style={styles.chips}>
        <Pressable
          style={[styles.chip, actorFilter === null && styles.chipActive]}
          onPress={() => setActorFilter(null)}
        >
          <Text style={[styles.chipText, actorFilter === null && styles.chipTextActive]}>All actors</Text>
        </Pressable>
        {AUDIT_ACTOR_TYPES.map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, actorFilter === t && styles.chipActive]}
            onPress={() => setActorFilter(t)}
          >
            <Text style={[styles.chipText, actorFilter === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
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
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No audit entries match these filters.</Text>
      ) : (
        rows.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <Pressable key={row.id} onPress={() => setExpandedId(expanded ? null : row.id)}>
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.action} numberOfLines={2}>
                    {row.action || "—"}
                  </Text>
                  <Text style={styles.actor}>{row.actor_type || "—"}</Text>
                </View>
                <Text style={styles.meta}>
                  {row.entity_type || "—"} · {String(row.entity_id ?? "").slice(0, 8)} ·{" "}
                  {formatDate(row.created_at)}
                </Text>
                {row.actor_user_id && (
                  <Text style={styles.meta}>Actor: {row.actor_user_id.slice(0, 8)}</Text>
                )}
                {expanded && (
                  <View style={styles.expanded}>
                    <Text style={styles.jsonLabel}>Before</Text>
                    <Text style={styles.jsonBlock} selectable>
                      {asPrettyJson(row.before)}
                    </Text>
                    <Text style={styles.jsonLabel}>After</Text>
                    <Text style={styles.jsonBlock} selectable>
                      {asPrettyJson(row.after)}
                    </Text>
                    <Text style={styles.jsonLabel}>Metadata</Text>
                    <Text style={styles.jsonBlock} selectable>
                      {asPrettyJson(row.metadata)}
                    </Text>
                  </View>
                )}
                <Text style={styles.expandHint}>{expanded ? "Tap to collapse ▲" : "Tap for detail ▼"}</Text>
              </View>
            </Pressable>
          );
        })
      )}
      {rows.length >= limit && (
        <Pressable style={styles.loadMoreBtn} onPress={() => setLimit((v) => v + PAGE)}>
          <Text style={styles.loadMoreText}>Load more</Text>
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
  sub: { color: THEME.textMuted, fontSize: 12, lineHeight: 17 },
  searchInput: {
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { borderColor: THEME.purpleBright, backgroundColor: "rgba(168,85,247,0.18)" },
  chipText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: "#fff" },
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
  action: { color: "#fff", fontSize: 14, fontWeight: "800", flex: 1 },
  actor: { color: THEME.purpleBright, fontSize: 11, fontWeight: "800" },
  meta: { color: THEME.textMuted, fontSize: 12, marginTop: 4 },
  expanded: { marginTop: 10, gap: 6 },
  jsonLabel: { color: "#fff", fontSize: 12, fontWeight: "800", marginTop: 4 },
  jsonBlock: {
    color: THEME.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "monospace",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 10,
  },
  expandHint: { color: THEME.purpleBright, fontSize: 11, fontWeight: "800", marginTop: 8 },
  loadMoreBtn: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadMoreText: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
});
