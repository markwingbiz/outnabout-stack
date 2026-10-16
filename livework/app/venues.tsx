// Livework — My Venues (Phase 7 Slice 2).
// Lists ONLY the vendor's own venues (getUserVenues, tenant-scoped via RLS
// + explicit tenant filter). Each row shows the venue's contact details
// and its event count. Tap a venue to edit it; "Add venue" adds another
// venue under the vendor's existing tenant.
//
// Event counts use per-venue exact head-count queries (no rows fetched).
// Counts are vendor-scoped: RLS restricts events reads to the vendor's
// tenants, so a count for the vendor's own venue is exact.
//
// No venue delete in this slice: deleting a venue nulls its events'
// venue_id via the FK ON DELETE SET NULL — delete is a future decision,
// not a silent side effect.
//
// Slice 3: per-venue redemption counts (exact head-counts, same pattern
// as event counts). NO revenue figures anywhere: revenue_events has no
// tenant_id, so per-venue revenue is impossible with the current schema
// — do not attribute ecosystem revenue to a venue. Caveat: bownd-sync's
// mirror does NOT populate venue_redemptions.venue_id today, so
// redemption counts will read 0 until the Phase 9 mirror maps
// redemptions to venues; the counts are still schema-correct.
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
import { getUserVenues, type TenantVenue } from "../lib/tenant";

type VenueWithCount = TenantVenue & { eventCount: number | null; redemptionCount: number | null };

function addressLine(v: TenantVenue): string {
  return [v.address, v.city, v.state].filter((p) => p && p.trim()).join(", ");
}

export default function VenuesScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [venues, setVenues] = useState<VenueWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await getUserVenues();
      // Exact head-count per venue (no rows fetched). RLS scopes the
      // counts to the vendor's own tenants.
      const counts = await Promise.all(
        list.map(async (v) => {
          if (!supabase) return null;
          const { count, error: countError } = await supabase
            .from("events")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", v.id);
          if (countError) throw countError;
          return count ?? 0;
        }),
      );
      const redemptionCounts = await Promise.all(
        list.map(async (v) => {
          if (!supabase) return null;
          const { count, error: countError } = await supabase
            .from("venue_redemptions")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", v.id);
          if (countError) throw countError;
          return count ?? 0;
        }),
      );
      setVenues(
        list.map((v, i) => ({ ...v, eventCount: counts[i], redemptionCount: redemptionCounts[i] })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load your venues.");
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  // Refresh when returning from the add/edit form.
  useFocusEffect(
    useCallback(() => {
      if (session) void load();
    }, [session, load]),
  );

  if (authLoading || venues === null) {
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
          <Text style={styles.centerTitle}>Sign in to see your venues</Text>
          <Text style={styles.centerSub}>Venues belong to your account. Sign in to continue.</Text>
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
          <Text style={styles.centerTitle}>Could not load your venues</Text>
          <Text style={styles.centerSub}>{error}</Text>
          <Pressable style={styles.centerBtn} onPress={() => void load()}>
            <Text style={styles.centerBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>My Venues</Text>
          <View style={{ width: 24 }} />
        </View>

        <Pressable style={styles.addBtn} onPress={() => router.push("/venue-form")}>
          <Text style={styles.addText}>+ Add Venue</Text>
        </Pressable>

        {venues.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>No venues yet.</Text>
            <Text style={styles.emptySub}>Add your first venue to start listing events.</Text>
          </View>
        ) : (
          venues.map((v) => {
            const line = addressLine(v);
            return (
              <Pressable key={v.id} style={styles.card} onPress={() => router.push(`/venue-form?id=${v.id}`)}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.venueName}>{v.name}</Text>
                    {!!line && <Text style={styles.detail}>{line}</Text>}
                    {!!v.phone && <Text style={styles.detail}>{v.phone}</Text>}
                    {!!v.website && <Text style={styles.detail}>{v.website}</Text>}
                    <Text style={styles.count}>
                      {v.eventCount === null
                        ? "Events: —"
                        : v.eventCount === 0
                          ? "No events yet"
                          : `${v.eventCount} event${v.eventCount === 1 ? "" : "s"}`}
                    </Text>
                    <Text style={styles.countSub}>
                      {v.redemptionCount === null
                        ? "Redemptions: —"
                        : v.redemptionCount === 0
                          ? "No redemptions yet"
                          : `${v.redemptionCount} redemption${v.redemptionCount === 1 ? "" : "s"}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={THEME.textMuted} />
                </View>
              </Pressable>
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
  addBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  addText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  venueName: { color: "#fff", fontSize: 16, fontWeight: "900" },
  detail: { color: THEME.textMuted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  count: { color: THEME.purple, fontSize: 13, fontWeight: "800", marginTop: 8 },
  countSub: { color: THEME.textMuted, fontSize: 13, fontWeight: "700", marginTop: 3 },
  empty: { color: THEME.textMuted, fontSize: 14, fontWeight: "700" },
  emptySub: { color: THEME.textFaint, fontSize: 13, marginTop: 6, lineHeight: 18 },
});
