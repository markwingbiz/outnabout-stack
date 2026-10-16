// Livework — Redemptions (Phase 7 Slice 3).
// Lists ONLY the vendor's own venue_redemptions (tenant_id IN the user's
// tenant IDs, via getUserTenantIds). Optional venue filter.
//
// Verified columns (design §7.2 + bownd-sync mirror writer, which inserts
// redemption_type / customer_ref / tenant_id / metadata):
//   id, tenant_id, venue_id (nullable), event_id (nullable),
//   redemption_type, customer_ref, metadata (jsonb:
//   { bownd_token, experience_id, redeemed_at, redeemed_by_device,
//   status }), created_at.
//
// Honesty notes:
// - The table is EMPTY until bownd-sync is deployed (Phase 9, blocked on
//   the Firebase service account + Bownd tenant mapping). The empty state
//   says so; no fake/sample rows, ever.
// - The mirror does NOT populate venue_id / event_id today, so mirrored
//   rows appear under "All venues" with "Venue not linked" until the
//   Phase 9 mirror maps them. Filtering by a venue only shows rows whose
//   venue_id is set.
// - No revenue figures here: redemptions carry no price (design §7.2).
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

type Redemption = {
  id: string;
  tenantId: string | null;
  venueId: string | null;
  eventId: string | null;
  redemptionType: string;
  customerRef: string;
  createdAt: string | null;
  redeemedAtMillis: number | null;
  bowndToken: string | null;
  experienceId: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

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

function formatRedeemedAt(millis: number | null, fallbackIso: string | null): string {
  if (millis !== null) {
    const d = new Date(millis);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }
  return formatDate(fallbackIso);
}

export default function RedemptionsScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [venues, setVenues] = useState<TenantVenue[]>([]);
  const [events, setEvents] = useState<Map<string, string>>(new Map());
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
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
        setRedemptions([]);
        return;
      }
      const [eventsRes, redemptionsRes] = await Promise.all([
        supabase.from("events").select("id, title").in("tenant_id", tenantIds),
        supabase
          .from("venue_redemptions")
          .select("id, tenant_id, venue_id, event_id, redemption_type, customer_ref, metadata, created_at")
          .in("tenant_id", tenantIds)
          .order("created_at", { ascending: false }),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (redemptionsRes.error) throw redemptionsRes.error;
      const eventMap = new Map<string, string>();
      for (const row of (eventsRes.data ?? []) as Record<string, unknown>[]) {
        if (typeof row.id === "string" && typeof row.title === "string") {
          eventMap.set(row.id, row.title);
        }
      }
      setEvents(eventMap);
      setRedemptions(
        ((redemptionsRes.data ?? []) as Record<string, unknown>[]).map((row) => {
          const meta = asRecord(row.metadata);
          const redeemedAt = meta ? meta.redeemed_at : null;
          return {
            id: String(row.id ?? ""),
            tenantId: asString(row.tenant_id),
            venueId: asString(row.venue_id),
            eventId: asString(row.event_id),
            redemptionType: asString(row.redemption_type) ?? "redemption",
            customerRef: asString(row.customer_ref) ?? "unknown",
            createdAt: asString(row.created_at),
            redeemedAtMillis:
              typeof redeemedAt === "number" && Number.isFinite(redeemedAt) ? redeemedAt : null,
            bowndToken: meta ? asString(meta.bownd_token) : null,
            experienceId: meta ? asString(meta.experience_id) : null,
          };
        }),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load your redemptions.");
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

  if (authLoading || redemptions === null) {
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
          <Text style={styles.centerTitle}>Sign in to see your redemptions</Text>
          <Text style={styles.centerSub}>Redemptions belong to your account. Sign in to continue.</Text>
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
          <Text style={styles.centerTitle}>Could not load your redemptions</Text>
          <Text style={styles.centerSub}>{error}</Text>
          <Pressable style={styles.centerBtn} onPress={() => void load()}>
            <Text style={styles.centerBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const visible =
    selectedVenueId === null
      ? redemptions
      : redemptions.filter((r) => r.venueId === selectedVenueId);
  const venueNameById = new Map(venues.map((v) => [v.id, v.name]));

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Redemptions</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Venue filter — same picker pattern as add-event. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable
            style={[styles.chip, selectedVenueId === null && styles.chipActive]}
            onPress={() => setSelectedVenueId(null)}
          >
            <Text style={[styles.chipText, selectedVenueId === null && styles.chipTextActive]}>
              All venues
            </Text>
          </Pressable>
          {venues.map((v) => (
            <Pressable
              key={v.id}
              style={[styles.chip, selectedVenueId === v.id && styles.chipActive]}
              onPress={() => setSelectedVenueId(v.id)}
            >
              <Text style={[styles.chipText, selectedVenueId === v.id && styles.chipTextActive]}>
                {v.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {redemptions.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>No redemptions yet.</Text>
            <Text style={styles.emptySub}>
              Redemptions appear here once Bownd sync is live. Bownd customers redeem offers in the
              Bownd app; those redemptions flow back to your venues.
            </Text>
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>No redemptions for this venue yet.</Text>
            <Text style={styles.emptySub}>
              Some redemptions may not be linked to a venue yet — they appear under All venues.
            </Text>
          </View>
        ) : (
          visible.map((r) => {
            const venueName = r.venueId ? (venueNameById.get(r.venueId) ?? "Venue not linked") : "Venue not linked";
            const eventTitle = r.eventId ? (events.get(r.eventId) ?? "Event not found") : null;
            return (
              <View key={r.id} style={styles.card}>
                <Text style={styles.redemptionType}>{r.redemptionType}</Text>
                <Text style={styles.detail}>Venue: {venueName}</Text>
                {!!eventTitle && <Text style={styles.detail}>Event: {eventTitle}</Text>}
                <Text style={styles.detail}>Customer: {r.customerRef}</Text>
                <Text style={styles.detail}>
                  Redeemed: {formatRedeemedAt(r.redeemedAtMillis, r.createdAt)}
                </Text>
                {!!r.experienceId && <Text style={styles.detail}>Experience: {r.experienceId}</Text>}
                {!!r.bowndToken && (
                  <Text style={styles.token}>Bownd token: {r.bowndToken.slice(0, 8)}…</Text>
                )}
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
  chips: { gap: 8, paddingBottom: 2 },
  chip: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: { borderColor: THEME.purple, backgroundColor: THEME.purple },
  chipText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  redemptionType: { color: "#fff", fontSize: 15, fontWeight: "900" },
  detail: { color: THEME.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  token: { color: THEME.textFaint, fontSize: 12, marginTop: 6 },
  empty: { color: THEME.textMuted, fontSize: 14, fontWeight: "700" },
  emptySub: { color: THEME.textFaint, fontSize: 13, marginTop: 6, lineHeight: 18 },
});
