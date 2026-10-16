// Livework — Add New Event form (Phase 5 + Phase 7 Slice 1).
// Ticket tiers are real and editable, and saved in the existing
// `events.price_label` column ("GA — $25; VIP — $50"). Date is validated
// before save. No fake success: unconfigured Supabase shows an error and
// does NOT navigate back; success is shown only after the insert
// confirms. Event Image stays disabled (needs expo-image-picker +
// Supabase Storage — not installed yet).
// Requires phase-a-ui Auth (<AuthProvider> in app/_layout.tsx).
//
// Slice 1: the insert MUST include tenant_id + venue_id — without
// tenant_id the insert fails RLS (NULL fails the with_check). The venue
// comes from the vendor's own venues (one venue → auto-attached;
// several → a picker). events.source_ref is NOT NULL, no default, and
// UNIQUE (verified live) — so each vendor-created event gets
// `livework:<uuid>` (see newUuid). The old constant "livework" failed
// the unique constraint on the second event. events.start_ts is NOT NULL,
// so a date is required.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { getUserVenues, type TenantVenue } from "../lib/tenant";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

type Tier = { id: string; name: string; price: string };

let tierSeq = 0;
function newTier(name = "", price = ""): Tier {
  tierSeq += 1;
  return { id: `tier-${Date.now()}-${tierSeq}`, name, price };
}

// UUID v4 for source_ref. Mirrors Livework+ lib/forge.ts
// newIdempotencyKey: prefers crypto.randomUUID, falls back to
// Math.random bytes. Uniqueness is what events.source_ref's UNIQUE
// constraint needs — the value is never displayed or matched on.
function newUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function AddEventScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [eventType, setEventType] = useState("General Admission");
  const [performers, setPerformers] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([newTier("General Admission", "")]);
  const [busy, setBusy] = useState(false);
  const [venues, setVenues] = useState<TenantVenue[] | null>(null);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const loadVenues = useCallback(async () => {
    setVenuesError(null);
    try {
      const list = await getUserVenues();
      setVenues(list);
      setSelectedVenueId((prev) => prev ?? list[0]?.id ?? null);
    } catch (e: unknown) {
      setVenuesError(e instanceof Error ? e.message : "Could not load your venues.");
    }
  }, []);

  useEffect(() => {
    if (session) void loadVenues();
  }, [session, loadVenues]);

  function validateDate(value: string): string | null {
    const trimmed = value.trim();
    // events.start_ts is NOT NULL with no default — a date is required.
    if (!trimmed) return "Enter a date & time.";
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return "Enter a valid date & time (e.g. May 24, 2026, 8:00 PM).";
    }
    return null;
  }

  function updateTier(id: string, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTier(id: string) {
    setTiers((prev) => (prev.length <= 1 ? prev : prev.filter((t) => t.id !== id)));
  }

  async function onSave() {
    if (!title.trim()) {
      Alert.alert("Missing title", "Enter an event title.");
      return;
    }
    const err = validateDate(date);
    setDateError(err);
    if (err) return;
    const selectedVenue = (venues ?? []).find((v) => v.id === selectedVenueId) ?? null;
    if (!selectedVenue) {
      Alert.alert("Missing venue", "Select a venue for this event.");
      return;
    }
    if (!selectedVenue.tenant_id) {
      Alert.alert(
        "Venue has no tenant",
        "This venue is missing its tenant link. Set up your venue again.",
      );
      return;
    }
    if (!supabaseConfigured || !supabase) {
      Alert.alert(
        "Supabase is not configured",
        "Event was not saved. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then try again.",
      );
      return;
    }
    const filledTiers = tiers.filter((t) => t.name.trim() || t.price.trim());
    const priceLabel =
      filledTiers.length > 0
        ? filledTiers.map((t) => `${t.name.trim() || "Ticket"}${t.price.trim() ? ` — $${t.price.trim().replace(/^\$/, "")}` : ""}`).join("; ")
        : null;
    setBusy(true);
    try {
      const { error } = await supabase.from("events").insert({
        // tenant_id is REQUIRED: without it the insert fails RLS
        // (NULL fails the with_check). venue_id attributes the event.
        tenant_id: selectedVenue.tenant_id,
        venue_id: selectedVenue.id,
        title: title.trim(),
        description: performers.trim() || null,
        start_ts: new Date(date.trim()).toISOString(),
        price_label: priceLabel,
        event_type: eventType,
        status: "draft",
        // events.source_ref is NOT NULL, no default, and UNIQUE — one
        // `livework:<uuid>` per event, so the second event no longer
        // fails the unique constraint the constant "livework" hit.
        // Shape matches bownd-sync's `<origin>:<id>` refs
        // ('bownd:<firestore-doc-id>'); publish looks events up by id,
        // never by source_ref, so this changes nothing downstream.
        source_ref: `livework:${newUuid()}`,
      });
      if (error) throw error;
      // Success only after the backend confirms the insert.
      Alert.alert("Event saved", "Saved to Supabase.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
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
          <Text style={styles.centerTitle}>Sign in to create events</Text>
          <Text style={styles.centerSub}>Events are saved to your account. Sign in to continue.</Text>
          <Pressable style={styles.centerBtn} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.centerBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (venues === null) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={THEME.purple} size="large" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (venuesError) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Could not load your venues</Text>
          <Text style={styles.centerSub}>{venuesError}</Text>
          <Pressable style={styles.centerBtn} onPress={() => void loadVenues()}>
            <Text style={styles.centerBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (venues.length === 0) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Set up your venue first</Text>
          <Text style={styles.centerSub}>Events belong to a venue. Set yours up, then come back to add events.</Text>
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
          <Text style={styles.title}>Add New Event</Text>
          <View style={{ width: 24 }} />
        </View>

        <Field label="Venue">
          {venues.length === 1 ? (
            <Text style={styles.venueSingle}>{venues[0].name}</Text>
          ) : (
            <View style={styles.typeRow}>
              {venues.map((v) => (
                <Pressable
                  key={v.id}
                  style={[styles.typeBtn, selectedVenueId === v.id && styles.typeBtnActive]}
                  onPress={() => setSelectedVenueId(v.id)}
                >
                  <Text style={[styles.typeText, selectedVenueId === v.id && styles.typeTextActive]}>{v.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Field>

        <Field label="Event Title">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Indie Night"
            placeholderTextColor={THEME.textFaint}
            style={styles.input}
          />
        </Field>

        <Field label="Date & Time">
          <TextInput
            value={date}
            onChangeText={(v) => {
              setDate(v);
              setDateError(validateDate(v));
            }}
            placeholder="May 24, 2026, 8:00 PM"
            placeholderTextColor={THEME.textFaint}
            style={styles.input}
          />
          {!!dateError && <Text style={styles.inlineError}>{dateError}</Text>}
        </Field>

        <Field label="Event Type">
          <View style={styles.typeRow}>
            {["General Admission", "Ticketed", "Free"].map((t) => (
              <Pressable
                key={t}
                style={[styles.typeBtn, eventType === t && styles.typeBtnActive]}
                onPress={() => setEventType(t)}
              >
                <Text style={[styles.typeText, eventType === t && styles.typeTextActive]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Performers / Artists">
          <TextInput
            value={performers}
            onChangeText={setPerformers}
            placeholder="Add performers"
            placeholderTextColor={THEME.textFaint}
            style={styles.input}
          />
        </Field>

        <Field label="Ticket Types & Prices">
          {tiers.map((t) => (
            <View key={t.id} style={styles.tierRow}>
              <TextInput
                value={t.name}
                onChangeText={(v) => updateTier(t.id, { name: v })}
                placeholder="Ticket name"
                placeholderTextColor={THEME.textFaint}
                style={[styles.input, styles.tierName]}
              />
              <TextInput
                value={t.price}
                onChangeText={(v) => updateTier(t.id, { price: v.replace(/[^0-9.]/g, "") })}
                placeholder="$"
                placeholderTextColor={THEME.textFaint}
                style={[styles.input, styles.tierPrice]}
                keyboardType="decimal-pad"
              />
              <Pressable onPress={() => removeTier(t.id)} hitSlop={8} disabled={tiers.length <= 1}>
                <Ionicons
                  name="close-circle"
                  size={24}
                  color={tiers.length <= 1 ? THEME.textFaint : "#F9A8D4"}
                />
              </Pressable>
            </View>
          ))}
        </Field>

        <Pressable style={styles.addTicket} onPress={() => setTiers((prev) => [...prev, newTier("", "")])}>
          <Text style={styles.addTicketText}>+ Add Ticket Type</Text>
        </Pressable>

        <View style={[styles.imageBox, styles.imageBoxDisabled]}>
          <Ionicons name="image-outline" size={28} color={THEME.textFaint} />
          <Text style={styles.imageText}>Event Image</Text>
          <Text style={styles.disabledNote}>
            Event images need image upload (expo-image-picker + Supabase Storage) — not installed yet.
          </Text>
        </View>

        <Pressable style={[styles.saveBtn, busy && { opacity: 0.7 }]} onPress={onSave} disabled={busy}>
          <Text style={styles.saveText}>{busy ? "Saving…" : "Create Event"}</Text>
        </Pressable>
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
  field: { marginBottom: 14 },
  label: { color: THEME.textMuted, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    color: "#fff",
    fontSize: 15,
  },
  inlineError: { color: "#F9A8D4", fontSize: 12, marginTop: 6, lineHeight: 16 },
  venueSingle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  typeBtn: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  typeBtnActive: { borderColor: THEME.purple, backgroundColor: "rgba(139,92,246,0.2)" },
  typeText: { color: THEME.textMuted, fontSize: 13, fontWeight: "700" },
  typeTextActive: { color: "#fff" },
  tierRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 },
  tierName: { flex: 1 },
  tierPrice: { width: 96 },
  addTicket: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 14,
  },
  addTicketText: { color: THEME.purple, fontWeight: "800", fontSize: 14 },
  imageBox: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 18,
  },
  imageBoxDisabled: { opacity: 0.6 },
  imageText: { color: THEME.textFaint, fontSize: 13, fontWeight: "700" },
  disabledNote: { color: THEME.textFaint, fontSize: 12, textAlign: "center", lineHeight: 16 },
  saveBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
