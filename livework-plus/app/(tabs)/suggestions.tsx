// Livework+ Forge Suggestions (Phase 8 Slice 5).
//
// Forge/worker suggestions for the operator: revenue ideas, internet
// scans (Scoutwave), and data scans. Rows are written by workers (Phase B
// runtime) or Forge — the UI never invents suggestions. The operator marks
// each one acted on or dismissed. Until the Phase B worker runtime is
// live, the honest empty state below is what Mark sees.
//
// Private — operator-gated (ForgeGate). Status changes go through direct
// Supabase client calls gated by the operator-only RLS policy from
// relationship-migration.sql. If the migration hasn't been run yet, the
// screen shows the friendly "run the migration" state, never crashes.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import {
  POLL_INTERVAL_MS,
  SUGGESTION_CATEGORIES,
  SUGGESTION_STATUSES,
  formatDate,
  isMissingTableError,
  usePolling,
  type ForgeSuggestionRow,
} from "../../lib/forge";

const PAGE = 100;

function categoryLabel(c: string | null | undefined): string {
  return c === "internet-scan"
    ? "Internet scan"
    : c === "data-scan"
      ? "Data scan"
      : c === "revenue"
        ? "Revenue"
        : c ?? "—";
}

function statusLabel(s: string | null | undefined): string {
  return s === "acted_on" ? "Acted on" : s === "dismissed" ? "Dismissed" : "New";
}

function statusColor(s: string | null | undefined): string {
  return s === "acted_on"
    ? THEME.green
    : s === "dismissed"
      ? THEME.textMuted
      : THEME.orange;
}

export default function SuggestionsScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <SuggestionsContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function SuggestionsContent() {
  const [rows, setRows] = useState<ForgeSuggestionRow[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
        .from("forge_suggestions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (categoryFilter) q = q.eq("category", categoryFilter);
      if (statusFilter) q = q.eq("status", statusFilter);
      const { data, error: qError } = await q;
      if (qError) throw qError;
      setRows((data ?? []) as ForgeSuggestionRow[]);
      setMigrationMissing(false);
    } catch (e) {
      if (isMissingTableError(e)) {
        setMigrationMissing(true);
      } else {
        setError(e instanceof Error ? e.message : "Could not load suggestions.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryFilter, statusFilter, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePolling(() => void refresh(), POLL_INTERVAL_MS);

  async function setStatus(row: ForgeSuggestionRow, status: "acted_on" | "dismissed") {
    if (!supabase || updatingId) return;
    setUpdatingId(row.id);
    setError(null);
    try {
      const { error: e } = await supabase
        .from("forge_suggestions")
        .update({ status })
        .eq("id", row.id);
      if (e) throw e;
      await refresh();
    } catch (e) {
      if (isMissingTableError(e)) setMigrationMissing(true);
      else setError(e instanceof Error ? e.message : "Could not update suggestion.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Suggestions</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
        </Pressable>
      </View>
      <Text style={styles.sub}>
        Forge and worker suggestions — revenue ideas, internet scans, data scans. Mark each one
        acted on or dismissed.
      </Text>

      {!!error && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void refresh()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {migrationMissing ? (
        <View style={styles.card}>
          <Text style={styles.migrationTitle}>Run the Slice 5 migration</Text>
          <Text style={styles.migrationText}>
            The suggestions table doesn&apos;t exist yet. Run relationship-migration.sql in the
            Supabase SQL Editor, then pull to refresh.
          </Text>
          <Pressable style={styles.addBtn} onPress={() => void refresh()}>
            <Text style={styles.addBtnText}>Check again</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator color={THEME.purpleBright} size="large" style={{ marginTop: 24 }} />
      ) : (
        <>
          <View style={styles.chips}>
            <Pressable
              style={[styles.chip, categoryFilter === null && styles.chipActive]}
              onPress={() => setCategoryFilter(null)}
            >
              <Text style={[styles.chipText, categoryFilter === null && styles.chipTextActive]}>
                All categories
              </Text>
            </Pressable>
            {SUGGESTION_CATEGORIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, categoryFilter === c && styles.chipActive]}
                onPress={() => setCategoryFilter(c)}
              >
                <Text style={[styles.chipText, categoryFilter === c && styles.chipTextActive]}>
                  {categoryLabel(c)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chips}>
            <Pressable
              style={[styles.chip, statusFilter === null && styles.chipActive]}
              onPress={() => setStatusFilter(null)}
            >
              <Text style={[styles.chipText, statusFilter === null && styles.chipTextActive]}>
                All statuses
              </Text>
            </Pressable>
            {SUGGESTION_STATUSES.map((s) => (
              <Pressable
                key={s}
                style={[styles.chip, statusFilter === s && styles.chipActive]}
                onPress={() => setStatusFilter(s)}
              >
                <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
                  {statusLabel(s)}
                </Text>
              </Pressable>
            ))}
          </View>

          {rows.length === 0 ? (
            <Text style={styles.empty}>
              No suggestions yet — Scoutwave and the other workers will fill this in once the
              Phase B worker runtime is live.
            </Text>
          ) : (
            rows.map((row) => (
              <View key={row.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{row.title || "Untitled suggestion"}</Text>
                  <Text style={[styles.statusBadge, { color: statusColor(row.status) }]}>
                    {statusLabel(row.status)}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  {categoryLabel(row.category)}
                  {row.source_worker_slug ? ` · ${row.source_worker_slug}` : ""} ·{" "}
                  {formatDate(row.created_at)}
                </Text>
                {!!row.body && <Text style={styles.itemBody}>{row.body}</Text>}
                {row.status === "new" && (
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actionBtn, updatingId === row.id && styles.actionBtnDisabled]}
                      onPress={() => void setStatus(row, "acted_on")}
                      disabled={updatingId === row.id}
                    >
                      <Text style={styles.actionBtnText}>Mark acted on</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.actionBtn,
                        styles.actionBtnSecondary,
                        updatingId === row.id && styles.actionBtnDisabled,
                      ]}
                      onPress={() => void setStatus(row, "dismissed")}
                      disabled={updatingId === row.id}
                    >
                      <Text style={styles.actionBtnText}>Dismiss</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
          {rows.length >= limit && (
            <Pressable style={styles.loadMoreBtn} onPress={() => setLimit((v) => v + PAGE)}>
              <Text style={styles.loadMoreText}>Load more</Text>
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
    gap: 10,
  },
  title: { color: "#fff", fontSize: 26, fontWeight: "900", flex: 1 },
  refreshBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refreshText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  sub: { color: THEME.textMuted, fontSize: 12, lineHeight: 17 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
    gap: 8,
  },
  errorCard: { borderColor: "rgba(236,72,153,0.5)" },
  errorText: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  retryText: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
  migrationTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  migrationText: { color: THEME.textMuted, fontSize: 13, lineHeight: 19 },
  addBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  addBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
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
  empty: { color: THEME.textMuted, fontSize: 14, textAlign: "center", marginTop: 24, lineHeight: 20 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  itemTitle: { color: "#fff", fontSize: 15, fontWeight: "800", flex: 1 },
  itemBody: { color: "#fff", fontSize: 13, lineHeight: 19 },
  meta: { color: THEME.textMuted, fontSize: 12 },
  statusBadge: { fontSize: 12, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionBtnSecondary: { backgroundColor: "rgba(255,255,255,0.12)" },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  loadMoreBtn: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadMoreText: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
});
