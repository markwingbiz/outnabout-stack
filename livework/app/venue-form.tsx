// Livework — Add / Edit venue (Phase 7 Slice 2).
// Reached from the venues screen: /venue-form for a new venue,
// /venue-form?id=<venueId> to edit an existing one.
//
// Add: inserts ONE venues row under the vendor's existing tenant — it does
// NOT create a new tenant (onboarding already created one in Slice 1).
// Edit: updates the venue's fields. tenant_id is never changed by this
// screen (an edit UPDATE does not include tenant_id, so it stays).
//
// No venue delete in this slice: deleting a venue nulls its events'
// venue_id via the FK ON DELETE SET NULL — delete is a future decision,
// not a silent side effect. See the venues screen note.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { getUserTenantIds, getUserVenues, type TenantVenue } from "../lib/tenant";
import VenueForm, { type VenueFormValues } from "../components/VenueForm";

export default function VenueFormScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const venueId = typeof id === "string" && id ? id : null;
  const editing = venueId !== null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [venue, setVenue] = useState<TenantVenue | null>(null);
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const [ids, venues] = await Promise.all([getUserTenantIds(), getUserVenues()]);
      setTenantIds(ids);
      if (venueId) {
        const found = venues.find((v) => v.id === venueId) ?? null;
        if (!found) throw new Error("Venue not found.");
        setVenue(found);
      }
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Could not load venue.");
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (session) void load();
    else setLoading(false);
  }, [session, load]);

  async function onSubmit(values: VenueFormValues) {
    if (!supabaseConfigured || !supabase) {
      Alert.alert(
        "Supabase is not configured",
        "Venue was not saved. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then try again.",
      );
      return;
    }
    setBusy(true);
    try {
      if (editing && venue) {
        // Edit: update fields only. tenant_id is NOT in the payload, so it
        // stays exactly as it was. RLS requires the row's tenant_id to be
        // one of the vendor's tenants — it already is (venue came from
        // getUserVenues, which is tenant-scoped).
        const { error } = await supabase
          .from("venues")
          .update({
            name: values.name,
            address: values.address || null,
            city: values.city || null,
            state: values.state || null,
            phone: values.phone || null,
            website: values.website || null,
          })
          .eq("id", venue.id);
        if (error) throw error;
        Alert.alert("Venue updated", "Your venue details were saved.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        // Add: one venues row under the vendor's existing tenant.
        // Multi-tenant vendors (rare) get the first tenant; a future
        // slice can add a tenant picker if multi-tenant vendors need it.
        const tenantId = tenantIds[0];
        if (!tenantId) throw new Error("No tenant found. Set up your venue first.");
        const { error } = await supabase.from("venues").insert({
          tenant_id: tenantId,
          name: values.name,
          address: values.address || null,
          city: values.city || null,
          state: values.state || null,
          phone: values.phone || null,
          website: values.website || null,
        });
        if (error) throw error;
        Alert.alert("Venue added", "Your venue was added.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (e: unknown) {
      Alert.alert("Could not save venue", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
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
          <Text style={styles.centerTitle}>Sign in to manage venues</Text>
          <Text style={styles.centerSub}>Venues belong to your account. Sign in to continue.</Text>
          <Pressable style={styles.centerBtn} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.centerBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Could not load venue</Text>
          <Text style={styles.centerSub}>{loadError}</Text>
          <Pressable style={styles.centerBtn} onPress={() => void load()}>
            <Text style={styles.centerBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!editing && tenantIds.length === 0) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Set up your venue first</Text>
          <Text style={styles.centerSub}>You need a venue profile before adding more venues.</Text>
          <Pressable style={styles.centerBtn} onPress={() => router.push("/setup-venue")}>
            <Text style={styles.centerBtnText}>Set up your venue</Text>
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
          <Text style={styles.title}>{editing ? "Edit venue" : "Add venue"}</Text>
          <View style={{ width: 24 }} />
        </View>
        <VenueForm
          initial={
            venue
              ? {
                  name: venue.name,
                  address: venue.address ?? "",
                  city: venue.city ?? "",
                  state: venue.state ?? "",
                  phone: venue.phone ?? "",
                  website: venue.website ?? "",
                }
              : undefined
          }
          submitLabel={editing ? "Save changes" : "Add venue"}
          busy={busy}
          onSubmit={(values) => void onSubmit(values)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, gap: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  centerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center" },
  centerSub: { color: THEME.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  centerBtn: { backgroundColor: THEME.purple, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  centerBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "900" },
});
