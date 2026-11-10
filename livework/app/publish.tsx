// Livework — Publish to Bownd outbox (Phase 7 Slice 3).
// Lists the vendor's bownd_publish_requests rows + lets the vendor queue
// new ones. Publish-request creation is ENABLED (Phase 9+).
//
// Verified LIVE against the database (2026-10-18):
// - bownd_publish_requests columns: id (default gen_random_uuid),
//   tenant_id uuid NOT NULL (no default — INSERT must supply it),
//   venue_id uuid NOT NULL, event_id uuid NULLABLE, status text NOT NULL
//   default 'pending', prompt/forge_run_id nullable, requested_at
//   default now(), idempotency_key nullable.
// - INSERT policy `bownd_publish_requests_insert`: authenticated,
//   WITH CHECK tenant_id IN current_tenant_ids(). The app inserts with
//   the event's (or venue's) tenant_id.
// - Status CHECK: pending / processing / published / failed / cancelled
//   (no 'done' — old rows saying 'done' get the legacy label below).
// - One-ref CHECK: event_id OR venue_id must be non-null. venue_id is
//   NOT NULL anyway, so an event without a venue cannot be published.
// - NO unique constraint on idempotency_key — the app dedupes by
//   SELECTing for an existing pending/processing/published request
//   before INSERTing. Failed/cancelled requests may be re-queued.
// - bownd-sync IS deployed (REST rewrite). A 'pending' request waits
//   for the next publish invoke — nothing here claims it is live yet.
// - Venue-first: the sync needs the venue published before its events,
//   so publishing an event queues a venue request first (event_id NULL,
//   key `livework:venue:<venue_id>`) and then the event request
//   (key `livework:<event_id>`).
import React, { useCallback, useEffect, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { getUserTenantIds, getUserVenues, type TenantVenue } from "../lib/tenant";
import { canPublishToBownd, verificationLabel, verificationStatusOf } from "../lib/verification";

// Publish-request creation is ENABLED — see the verified-live notes in
// the file header. Keys: venue `livework:venue:<venue_id>`, event
// `livework:<event_id>`.
//
// Verification gate (v1): publishing is UX-blocked here when the event's
// venue is not verified — bownd-sync ALSO enforces it server-side
// (request would fail with 'venue_unverified'). is_test venues exempt.

/** Statuses that mean "already queued or live" — never insert over these. */
const ACTIVE_REQUEST_STATUSES = ["pending", "processing", "published"];

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
  if (status === "pending") return "Queued — waiting for the next Bownd sync run";
  if (status === "processing") return "Publishing…";
  if (status === "published") return "Published to Bownd";
  if (status === "done") return "Published to Bownd";
  if (status === "failed") return "Failed — needs a new request";
  if (status === "cancelled") return "Cancelled";
  return `Status: ${status}`;
}

type EventRow = {
  id: string;
  title: string;
  tenantId: string | null;
  venueId: string | null;
};

export default function PublishScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [venues, setVenues] = useState<TenantVenue[]>([]);
  const [events, setEvents] = useState<Map<string, string>>(new Map());
  const [eventRows, setEventRows] = useState<EventRow[]>([]);
  const [requests, setRequests] = useState<PublishRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

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
        .select("id, title, tenant_id, venue_id")
        .in("tenant_id", tenantIds);
      if (eventsRes.error) throw eventsRes.error;
      const eventMap = new Map<string, string>();
      const eventIds: string[] = [];
      const rows: EventRow[] = [];
      for (const row of (eventsRes.data ?? []) as Record<string, unknown>[]) {
        if (typeof row.id === "string") {
          eventIds.push(row.id);
          if (typeof row.title === "string") eventMap.set(row.id, row.title);
          rows.push({
            id: row.id,
            title: typeof row.title === "string" ? row.title : "Untitled event",
            tenantId: typeof row.tenant_id === "string" ? row.tenant_id : null,
            venueId: typeof row.venue_id === "string" ? row.venue_id : null,
          });
        }
      }
      setEvents(eventMap);
      setEventRows(rows);
      // Requests are tenant-scoped by RLS. Scope the list to the
      // vendor's events AND venues: venue-only requests have
      // event_id NULL and would be missed by an event_id-only filter.
      const venueIds = venueList.map((v) => v.id);
      const orParts: string[] = [];
      if (eventIds.length > 0) orParts.push(`event_id.in.(${eventIds.join(",")})`);
      if (venueIds.length > 0) orParts.push(`venue_id.in.(${venueIds.join(",")})`);
      if (orParts.length === 0) {
        setRequests([]);
        return;
      }
      const requestsRes = await supabase
        .from("bownd_publish_requests")
        .select(
          "id, status, venue_id, event_id, bownd_venue_ref, bownd_event_ref, idempotency_key, metadata, requested_at",
        )
        .or(orParts.join(","))
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

  // Queue a publish for one event. Venue-first: if the event's venue has
  // no active venue request yet, queue the venue request first, then the
  // event request. Dedupes by SELECT (no unique constraint on
  // idempotency_key). Failed/cancelled requests may be re-queued.
  async function onPublishEvent(ev: EventRow) {
    if (!supabase) {
      Alert.alert("Could not publish", "Supabase is not configured.");
      return;
    }
    if (!ev.venueId) {
      Alert.alert(
        "Event has no venue",
        "This event isn't assigned to a venue yet. Edit the event to add a venue, then publish.",
      );
      return;
    }
    const venue = venues.find((v) => v.id === ev.venueId);
    // UX gate: refuse to queue until the venue is verified. The vendor
    // requests a review from My Venues; after approval this unblocks.
    if (venue && !canPublishToBownd(venue)) {
      Alert.alert(
        "Venue not verified",
        `"${venue.name}" is ${verificationLabel(verificationStatusOf(venue)).toLowerCase()} — only verified venues publish to Bownd. Request a verification review from My Venues, and publishing unlocks after approval.`,
      );
      return;
    }
    const tenantId = ev.tenantId ?? venue?.tenant_id ?? null;
    if (!tenantId) {
      Alert.alert("Could not publish", "Couldn't determine which tenant owns this event.");
      return;
    }
    if (publishingId) return;
    setPublishingId(ev.id);
    try {
      // 1. Already queued/live for this event? Don't duplicate.
      const existing = await supabase
        .from("bownd_publish_requests")
        .select("id, status")
        .eq("event_id", ev.id)
        .in("status", ACTIVE_REQUEST_STATUSES)
        .limit(1);
      if (existing.error) throw existing.error;
      if ((existing.data ?? []).length > 0) {
        Alert.alert("Already queued", "This event already has a publish request. See its status below.");
        await load();
        return;
      }
      // 2. Venue request first, unless one is already active.
      const venueExisting = await supabase
        .from("bownd_publish_requests")
        .select("id, status")
        .eq("venue_id", ev.venueId)
        .is("event_id", null)
        .in("status", ACTIVE_REQUEST_STATUSES)
        .limit(1);
      if (venueExisting.error) throw venueExisting.error;
      if ((venueExisting.data ?? []).length === 0) {
        const venueInsert = await supabase.from("bownd_publish_requests").insert({
          tenant_id: tenantId,
          venue_id: ev.venueId,
          event_id: null,
          status: "pending",
          idempotency_key: `livework:venue:${ev.venueId}`,
          metadata: { source: "livework" },
        });
        if (venueInsert.error) throw venueInsert.error;
      }
      // 3. Event request.
      const eventInsert = await supabase.from("bownd_publish_requests").insert({
        tenant_id: tenantId,
        venue_id: ev.venueId,
        event_id: ev.id,
        status: "pending",
        idempotency_key: `livework:${ev.id}`,
        metadata: { source: "livework" },
      });
      if (eventInsert.error) throw eventInsert.error;
      Alert.alert(
        "Queued",
        "Your venue publishes first, then the event, on the next Bownd sync run.",
      );
      await load();
    } catch (e: unknown) {
      Alert.alert(
        "Could not publish",
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
    } finally {
      setPublishingId(null);
    }
  }

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

        {/* Publish action — queue one of your events. Queued requests are
            picked up on the next Bownd sync run; the venue publishes
            first, then the event. */}
        <View style={styles.card}>
          <Text style={styles.eventTitle}>Publish an event</Text>
          <Text style={styles.emptySub}>
            Queued requests wait for the next Bownd sync run. Your venue publishes
            first, then the event.
          </Text>
          {eventRows.length === 0 ? (
            <Text style={styles.emptySub}>No events yet — create an event first.</Text>
          ) : (
            eventRows.map((ev) => {
              const latest = (requests ?? []).find((r) => r.eventId === ev.id);
              const busy = publishingId === ev.id;
              const venueName = ev.venueId
                ? (venueNameById.get(ev.venueId) ?? "Venue not linked")
                : "No venue";
              const actionLabel =
                latest && ACTIVE_REQUEST_STATUSES.includes(latest.status)
                  ? latest.status === "published"
                    ? "Published"
                    : "Queued"
                  : latest && latest.status === "failed"
                    ? "Retry publish"
                    : "Publish to Bownd";
              const actionDisabled =
                busy || (!!latest && ACTIVE_REQUEST_STATUSES.includes(latest.status));
              return (
                <View key={ev.id} style={styles.publishRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.publishRowTitle} numberOfLines={1}>
                      {ev.title}
                    </Text>
                    <Text style={styles.detail}>Venue: {venueName}</Text>
                    {!!latest && (
                      <Text style={styles.detail}>{statusLabel(latest.status)}</Text>
                    )}
                  </View>
                  <Pressable
                    style={[styles.publishBtn, actionDisabled && styles.publishBtnDisabled]}
                    disabled={actionDisabled}
                    onPress={() => void onPublishEvent(ev)}
                  >
                    <Text style={styles.publishBtnText}>
                      {busy ? "Queuing…" : actionLabel}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.eventTitle}>Publish requests</Text>
        {requests.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>No publish requests yet.</Text>
            <Text style={styles.emptySub}>
              Publish an event above and its request will appear here with its delivery status.
            </Text>
          </View>
        ) : (
          requests.map((r) => {
            const venueName = r.venueId ? (venueNameById.get(r.venueId) ?? "Venue not linked") : "Venue not linked";
            const eventTitle = r.eventId
              ? (events.get(r.eventId) ?? "Event not found")
              : `Venue: ${venueName}`;
            return (
              <View key={r.id} style={styles.card}>
                <Text style={styles.eventTitle}>{eventTitle}</Text>
                {!r.eventId && (
                  <Text style={styles.detail}>Venue publish — publishes the venue to Bownd.</Text>
                )}
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
    backgroundColor: THEME.purple,
  },
  publishBtnDisabled: { backgroundColor: THEME.cardBorder, opacity: 0.6 },
  publishBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  publishRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.cardBorder,
  },
  publishRowTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  blockedReason: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 10 },
  eventTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  detail: { color: THEME.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  token: { color: THEME.textFaint, fontSize: 12, marginTop: 6 },
  empty: { color: THEME.textMuted, fontSize: 14, fontWeight: "700" },
  emptySub: { color: THEME.textFaint, fontSize: 13, marginTop: 6, lineHeight: 18 },
});
