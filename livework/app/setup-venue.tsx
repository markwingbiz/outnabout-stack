// Livework — Set up your venue (Phase 7 Slice 1).
// Shown to a signed-in vendor with no venue yet (via the dashboard empty
// state and the _layout tenant gate). The form creates a NEW tenant +
// membership + venue for this vendor. It never lists, offers, or lets the
// user pick an existing tenant.
//
// Slice 2: the form UI lives in components/VenueForm.tsx, shared with
// venue-form.tsx (venues screen). This screen keeps its 3-step submit
// logic (tenant → membership → venue); only the fields moved.
//
// NOTE — requires the self-onboarding RLS policies (see
// phase-7-slice-1/onboarding-rls.sql, NOT applied): tenants and
// tenant_users inserts are admin-only in the current RLS, so steps 1–2
// fail for a non-admin vendor until those policies land. The form
// surfaces the real RLS error; it does not silently skip steps.
//
// No cross-table rollback: if step 2 or 3 fails after step 1 created the
// tenant, the tenant row remains. The form reports the real error and
// the vendor can retry — a retry reuses the existing tenant (see the
// existingIds check) instead of creating a duplicate.
import React, { useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { getUserTenantIds, getUserVenues } from "../lib/tenant";
import VenueForm, { type VenueFormValues } from "../components/VenueForm";

export default function SetupVenueScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If the vendor already has a venue, they do not need this screen.
  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setChecking(false);
      return;
    }
    let alive = true;
    setChecking(true);
    setCheckError(null);
    Promise.all([getUserTenantIds(), getUserVenues()])
      .then(([, venues]) => {
        if (!alive) return;
        setChecking(false);
        if (venues.length > 0) router.replace("/");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setChecking(false);
        setCheckError(e instanceof Error ? e.message : "Could not check your venue status.");
      });
    return () => {
      alive = false;
    };
  }, [authLoading, session, router]);

  async function onSubmit(values: VenueFormValues) {
    const { name, address, city, state, phone, website } = values;
    if (!name.trim()) {
      Alert.alert("Missing venue name", "Enter your venue name.");
      return;
    }
    if (!supabaseConfigured || !supabase) {
      Alert.alert(
        "Supabase is not configured",
        "Venue was not saved. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then try again.",
      );
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Not signed in.");

      // Re-check membership at submit time: an earlier setup may have
      // stopped after step 2. Reuse that tenant instead of duplicating it.
      const existingIds = await getUserTenantIds();
      let tenantId: string;
      if (existingIds.length === 0) {
        // Step 1: create the tenant, named after the venue.
        const { data: tenantRow, error: tenantError } = await supabase
          .from("tenants")
          .insert({ name: name.trim() })
          .select("id")
          .single();
        if (tenantError) throw tenantError;
        const newId =
          tenantRow && typeof (tenantRow as { id?: unknown }).id === "string"
            ? (tenantRow as { id: string }).id
            : null;
        if (!newId) throw new Error("Tenant insert did not return an id.");
        tenantId = newId;
        // Step 2: membership. Must succeed before the venue insert,
        // because venues RLS requires tenant_id IN current_tenant_ids().
        const { error: memberError } = await supabase
          .from("tenant_users")
          .insert({ tenant_id: tenantId, user_id: userId, role: "owner" });
        if (memberError) throw memberError;
      } else {
        tenantId = existingIds[0];
      }

      // Step 3: the venue. (venues.hours / venues.tags have DB defaults.)
      const { error: venueError } = await supabase.from("venues").insert({
        tenant_id: tenantId,
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
      });
      if (venueError) throw venueError;

      Alert.alert("Venue set up", "Your venue is ready.", [
        { text: "OK", onPress: () => router.replace("/") },
      ]);
    } catch (e: unknown) {
      Alert.alert("Could not set up venue", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || checking) {
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
          <Text style={styles.centerTitle}>Sign in to set up your venue</Text>
          <Text style={styles.centerSub}>Your venue is tied to your account. Sign in to continue.</Text>
          <Pressable style={styles.centerBtn} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.centerBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (checkError) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Could not check your venue</Text>
          <Text style={styles.centerSub}>{checkError}</Text>
          <Pressable style={styles.centerBtn} onPress={() => router.replace("/setup-venue")}>
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
          <Text style={styles.title}>Set up your venue</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.intro}>
          Tell us about your venue. We&apos;ll create your venue profile — your events and revenue live under it.
        </Text>

        <VenueForm submitLabel="Create my venue" busy={busy} onSubmit={(values) => void onSubmit(values)} />
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
  intro: { color: THEME.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 18 },
});
