// Livework — Publish to Bownd outbox (Phase 7 Slice 3).
// Lists the vendor's bownd_publish_requests rows. Publish-request
// CREATION is deliberately NOT built in this slice — the button below is
// visibly disabled with the reason. See the blocker comment above
// PUBLISH_BLOCKED_REASON.
//
// Verified columns (design §7.3 + Phase A migration + bownd-sync, which
// reads '*' and writes status + bownd_*_ref):
//   id, status, venue_id (uuid NOT NULL), event_id (uuid NOT NULL),
//   prompt, forge_run_id, metadata, bownd_venue_ref, bownd_event_ref,
//   idempotency_key (unique), requested_at.
// NOTE: the repo has no migrations folder, so this column set is verified
// from the design doc + Phase A migration + bownd-sync source — NOT from
// a repo migration. The SELECT uses only these columns; if the live
// table differs, the query error surfaces honestly on this screen.
//
// Honesty notes:
// - bownd-sync is NOT deployed (Phase 9, blocked on the Firebase service
//   account + Bownd tenant mapping). A 'pending' request has NOT reached
//   Bownd. Nothing here claims a publish succeeded.
// - 'done' means bownd-sync marked the request done; 'failed' means it
//   needs a new request (bownd-sync does not retry).
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
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { getUserTenantIds, getUserVenues, type TenantVenue } from "../lib/tenant";

// BLOCKER — why publish-request creation is not built yet:
// 1. Vendor INSERT RLS on bownd_publish_requests is UNVERIFIED. Phase A
//    added only an operator/admin policy; the 4 pre-existing policies'
//    grants are not in any file (the repo has no migrations folder), so
//    an app-side INSERT could be RLS-rejected — a broken control.
// 2. The exact required INSERT columns are UNVERIFIED (is `prompt`
//    required? `forge_run_id`? is the timestamp `requested_at`?). The
//    design doc's insert shape (status, prompt, forge_run_id, metadata)
//    is a plan, not a verified column list.
// 3. bownd-sync is NOT deployed, so even a successful insert would sit
//    unprocessed. Unblock in Phase 9: verify the live table + vendor
//    INSERT policy, then enable creation with idempotency_key set to
//    `livework:<event_id>` so a publish is never queued twice.
const PUBLISH_BLOCKED_REASON =
  "Publishing is disabled until Bownd sync is live and vendor publish permissions are verified (Phase 9).";

type PublishRequest = {
  id: string;
  status: string;
  venueId: string | null;
  eventId: string | null;
  bowndVenueRef: string | null;
  bowndEventRef: string | null;
  idempotencyKey: string | null;
  requestedAt: string | null;
};

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Date unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Honest human label for a request status — the raw status is also shown. */
function statusLabel(status: string): string {
  if (status === "pending") return "Queued — delivery starts once Bownd sync is live";
  if (status === "done") return "Published to Bownd";
  if (status === "failed") return "Failed — needs a new request";
  return `Status: ${status}`;
}

export default function PublishScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [venues, setVenues] = useState<TenantVenue[]>([]);
  const [events, setEvents] = useState<Map<string, string>>(new Map());
  const [requests, setRequests] = useState<PublishRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      const tenantIds = await getUserTenantIds();
      const venueList = await getUserVenues();
      setVenues(venueList);
      if (tenantIds.length === 0) {
        setEvents(new Map());
        setRequests([]);
        return;
      }
      const eventsRes = await supabase
        .from("events")
        .select("id, title")
        .in("tenant_id", tenantIds);
      if (eventsRes.error) throw eventsRes.error;
      const eventMap = new Map<string, string>();
      const eventIds: string[] = [];
      for (const row of (eventsRes.data ?? []) as Record<string, unknown>[]) {
        if (typeof row.id === "string") {
          eventIds.push(row.id);
          if (typeof row.title === "string") eventMap.set(row.id, row.title);
        }
      }
      setEvents(eventMap);
      if (eventIds.length === 0) {
        setRequests([]);
        return;
      }
      // event_id is NOT NULL on bownd_publish_requests (design §7.3), so
      // filtering by the vendor's event IDs scopes the list to their
      // requests without needing a tenant_id column on this table.
      const requestsRes = await supabase
        .from("bownd_publish_requests")
        .select(
          "id, status, venue_id, event_id, bownd_venue_ref, bownd_event_ref, idempotency_key, metadata, requested_at",
        )
        .in("event_id", eventIds)
        .order("requested_at", { ascending: false });
      if (requestsRes.error) throw requestsRes.error;
      setRequests(
        ((requestsRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
          id: String(row.id ?? ""),
          status: asString(row.status) ?? "unknown",
          venueId: asString(row.venue_id),
          eventId: asString(row.event_id),
          bowndVenueRef: asString(row.bownd_venue_ref),
          bowndEventRef: asString(row.bownd_event_ref),
          idempotencyKey: asString(row.idempotency_key),
          requestedAt: asString(row.requested_at),
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load your publish requests.");
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  // Refresh when returning from another screen.
  useFocusEffect(
    useCallback(() => {
      if (session) void load();
    }, [session, load]),
  );

  if (authLoading || requests === null) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={THEME.purple} size="large" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Sign in to see your publish requests</Text>
          <Text style={styles.centerSub}>Publish requests belong to your account. Sign in to continue.</Text>
          <Pressable style={styles.centerBtn} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.centerBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Could not load your publish requests</Text>
          <Text style={styles.centerSub}>{error}</Text>
          <Pressable style={styles.centerBtn} onPress={() => void load()}>
            <Text style={styles.centerBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const venueNameById = new Map(venues.map((v) => [v.id, v.name]));

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Publish to Bownd</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Publish action — disabled with the reason (see blocker comment). */}
        <View style={styles.card}>
          <Pressable style={[styles.publishBtn, styles.publishBtnDisabled]} disabled>
            <Text style={styles.publishBtnText}>Publish event to Bownd</Text>
          </Pressable>
          <Text style={styles.blockedReason}>{PUBLISH_BLOCKED_REASON}</Text>
        </View>

        {requests.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>No publish requests yet.</Text>
            <Text style={styles.emptySub}>
              Nothing has been sent to Bownd. When publishing opens, your queued events will appear
              here with their delivery status.
            </Text>
          </View>
        ) : (
          requests.map((r) => {
            const eventTitle = r.eventId ? (events.get(r.eventId) ?? "Event not found") : "Event not linked";
            const venueName = r.venueId ? (venueNameById.get(r.venueId) ?? "Venue not linked") : "Venue not linked";
            return (
              <View key={r.id} style={styles.card}>
                <Text style={styles.eventTitle}>{eventTitle}</Text>
                <Text style={styles.detail}>Venue: {venueName}</Text>
                <Text style={styles.detail}>{statusLabel(r.status)}</Text>
                <Text style={styles.detail}>Raw status: {r.status}</Text>
                <Text style={styles.detail}>Requested: {formatDate(r.requestedAt)}</Text>
                {!!r.bowndEventRef && <Text style={styles.detail}>Bownd event ref: {r.bowndEventRef}</Text>}
                {!!r.bowndVenueRef && <Text style={styles.detail}>Bownd venue ref: {r.bowndVenueRef}</Text>}
                {!!r.idempotencyKey && <Text style={styles.token}>Key: {r.idempotencyKey}</Text>}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  centerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center" },
  centerSub: { color: THEME.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  centerBtn: { backgroundColor: THEME.purple, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  centerBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "900" },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  publishBtn: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  publishBtnDisabled: { backgroundColor: THEME.cardBorder, opacity: 0.6 },
  publishBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  blockedReason: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 10 },
  eventTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  detail: { color: THEME.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  token: { color: THEME.textFaint, fontSize: 12, marginTop: 6 },
  empty: { color: THEME.textMuted, fontSize: 14, fontWeight: "700" },
  emptySub: { color: THEME.textFaint, fontSize: 13, marginTop: 6, lineHeight: 18 },
});
