// Livework+ Bownd data (Phase 8 Slice 4, audit §10 / design §7).
//
// Read-only mirror view: Bownd events + venues mirrored from Firestore
// (source_ref 'bownd:<doc-id>'), Bownd redemptions (redemption_type
// 'bownd_qr'), and sync status from bownd_mirror_state. "Sync now" is
// DISABLED with the reason: the mirror is invoked from the operator
// terminal (Supabase dashboard / function invoke with operator auth) —
// no in-app invoke is wired. Nothing here writes.
// Redemptions show "Venue not linked" when the mirror did not attach a
// venue_id — the mirror does not populate venue_id/event_id today.
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
import { asRecord, formatDate, type BowndMirrorStateRow } from "../../lib/forge";

type MirroredEvent = {
  id: string;
  title: string | null;
  start_ts: string | null;
  status: string | null;
  source_ref: string | null;
};

type MirroredVenue = {
  id: string;
  name: string | null;
  source_ref: string | null;
};

type BowndRedemption = {
  id: string;
  customer_ref: string | null;
  venue_id: string | null;
  event_id: string | null;
  created_at: string | null;
  metadata: unknown;
};

export default function BowndScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <BowndContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function BowndContent() {
  const [mirrorState, setMirrorState] = useState<BowndMirrorStateRow[]>([]);
  const [events, setEvents] = useState<MirroredEvent[]>([]);
  const [venues, setVenues] = useState<MirroredVenue[]>([]);
  const [redemptions, setRedemptions] = useState<BowndRedemption[]>([]);
  const [pendingPublish, setPendingPublish] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const [ms, ev, ve, re, pu] = await Promise.all([
        supabase
          .from("bownd_mirror_state")
          .select("*")
          .order("collection", { ascending: true }),
        supabase
          .from("events")
          .select("id, title, start_ts, status, source_ref")
          .like("source_ref", "bownd:%")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("venues")
          .select("id, name, source_ref")
          .like("source_ref", "bownd:%")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("venue_redemptions")
          .select("id, customer_ref, venue_id, event_id, created_at, metadata")
          .eq("redemption_type", "bownd_qr")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("bownd_publish_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      const firstError = ms.error ?? ev.error ?? ve.error ?? re.error ?? pu.error;
      if (firstError) throw new Error(firstError.message);
      setMirrorState((ms.data ?? []) as BowndMirrorStateRow[]);
      setEvents((ev.data ?? []) as MirroredEvent[]);
      setVenues((ve.data ?? []) as MirroredVenue[]);
      setRedemptions((re.data ?? []) as BowndRedemption[]);
      setPendingPublish(typeof pu.count === "number" ? pu.count : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Bownd data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncedAnything = mirrorState.some((r) => r.last_sync_at);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Bownd Data</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
        </Pressable>
      </View>

      {/* Sync status — read-only; the mirror runs from the operator terminal */}
      <View style={[styles.card, styles.syncCard]}>
        <Text style={styles.sectionLabel}>Sync status</Text>
        <Text style={styles.syncNote}>
          Sync is live — bownd-sync is deployed. The mirror is invoked from the
          operator terminal, not from this screen, so Sync now stays disabled
          here. The rows below show mirrored Bownd data.
        </Text>
        <Pressable style={[styles.btn, styles.btnDisabled]} disabled>
          <Text style={styles.btnText}>Sync now (disabled — mirror runs from the operator terminal)</Text>
        </Pressable>
        {mirrorState.length === 0 ? (
          <Text style={styles.muted}>No mirror state rows yet — no sync has run.</Text>
        ) : (
          mirrorState.map((row) => (
            <View key={String(row.collection)} style={styles.mirrorRow}>
              <Text style={styles.mirrorCollection}>{row.collection ?? "—"}</Text>
              <Text style={styles.muted}>Last sync: {formatDate(row.last_sync_at)}</Text>
              <Text style={styles.muted}>Last seen: {formatDate(row.last_seen_update_at)}</Text>
              {!!row.last_error && (
                <Text style={styles.syncError}>Last error: {row.last_error}</Text>
              )}
            </View>
          ))
        )}
        <Text style={styles.muted}>
          Pending publish requests: {pendingPublish ?? "—"}
        </Text>
        {!syncedAnything && (
          <Text style={styles.muted}>
            The lists below show mirrored Bownd rows only. Until the first sync runs, they
            are empty — that is expected, not a bug.
          </Text>
        )}
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
          <Text style={styles.sectionLabel}>Mirrored Bownd events ({events.length})</Text>
          {events.length === 0 ? (
            <Text style={styles.muted}>No mirrored Bownd events yet.</Text>
          ) : (
            events.map((ev) => (
              <View key={ev.id} style={styles.card}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {ev.title || "Untitled event"}
                </Text>
                <Text style={styles.muted}>
                  {formatDate(ev.start_ts)} · {ev.status ?? "—"}
                </Text>
                <Text style={styles.muted}>{ev.source_ref ?? ""}</Text>
              </View>
            ))
          )}

          <Text style={styles.sectionLabel}>Mirrored Bownd venues ({venues.length})</Text>
          {venues.length === 0 ? (
            <Text style={styles.muted}>No mirrored Bownd venues yet.</Text>
          ) : (
            venues.map((v) => (
              <View key={v.id} style={styles.card}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {v.name || "Unnamed venue"}
                </Text>
                <Text style={styles.muted}>{v.source_ref ?? ""}</Text>
              </View>
            ))
          )}

          <Text style={styles.sectionLabel}>Bownd redemptions ({redemptions.length})</Text>
          {redemptions.length === 0 ? (
            <Text style={styles.muted}>No Bownd redemptions mirrored yet.</Text>
          ) : (
            redemptions.map((r) => {
              const meta = asRecord(r.metadata);
              const token = typeof meta.bownd_token === "string" ? meta.bownd_token : null;
              return (
                <View key={r.id} style={styles.card}>
                  <Text style={styles.rowTitle}>
                    {r.customer_ref ?? "Unknown customer"}
                  </Text>
                  <Text style={styles.muted}>
                    {formatDate(r.created_at)} · Venue:{" "}
                    {r.venue_id ? r.venue_id.slice(0, 8) : "Not linked"}
                  </Text>
                  {!!token && <Text style={styles.muted}>Token: {token.slice(0, 12)}…</Text>}
                </View>
              );
            })
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
  syncCard: { gap: 8 },
  errorCard: { borderColor: "rgba(236,72,153,0.5)" },
  errorText: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  retryText: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
  sectionLabel: { color: "#fff", fontSize: 15, fontWeight: "900", marginTop: 6 },
  syncNote: { color: THEME.orange, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  btn: {
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  mirrorRow: { gap: 2, marginTop: 6 },
  mirrorCollection: { color: "#fff", fontSize: 13, fontWeight: "800" },
  syncError: { color: THEME.pink, fontSize: 12 },
  muted: { color: THEME.textFaint, fontSize: 12, lineHeight: 17 },
  rowTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
