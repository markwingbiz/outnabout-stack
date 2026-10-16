// Livework — Edit Event (Phase 7 Slice 2).
// Reached from the dashboard's "Your Events" list: /edit-event?id=<eventId>.
// Prefills from the event row; save is an UPDATE that keeps tenant_id +
// venue_id set (never clears them) and preserves the existing status.
//
// STATUS: the only status value in the Livework codebase is "draft"
// (written by add-event). No other status exists, so this screen has NO
// status control and does NOT include status in the UPDATE — inventing a
// status (e.g. "published") would create a value nothing else reads.
// The existing status is preserved untouched.
//
// Mirrors add-event.tsx's form (tiers ↔ price_label, performers ↔
// description, free-text date). A future slice may extract a shared
// event form; this slice keeps add-event untouched.
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { getUserTenantIds, getUserVenues, type TenantVenue } from "../lib/tenant";

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

/**
 * Reverse of add-event's price_label builder ("GA — $25; VIP — $50").
 * Segments that do not match "name — $price" keep their text as the name
 * with an empty price, so nothing the vendor typed is silently dropped.
 */
function parsePriceLabel(priceLabel: string | null): Tier[] {
  if (!priceLabel || !priceLabel.trim()) return [newTier("", "")];
  const segments = priceLabel.split(";").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return [newTier("", "")];
  return segments.map((seg) => {
    const sep = seg.includes(" — ") ? " — " : seg.includes(" - ") ? " - " : null;
    if (!sep) {
      if (seg.startsWith("$")) return newTier("", seg.replace(/^\$/, ""));
      return newTier(seg, "");
    }
    const [rawName, rawPrice] = seg.split(sep);
    return newTier((rawName ?? "").trim(), (rawPrice ?? "").trim().replace(/^\$/, ""));
  });
}

function formatDateForInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const EVENT_TYPES = ["General Admission", "Ticketed", "Free"];

export default function EditEventScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const eventId = typeof id === "string" && id ? id : null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [eventType, setEventType] = useState("General Admission");
  const [eventTypeOptions, setEventTypeOptions] = useState<string[]>(EVENT_TYPES);
  const [performers, setPerformers] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([newTier("General Admission", "")]);
  const [busy, setBusy] = useState(false);
  const [venues, setVenues] = useState<TenantVenue[] | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) {
      setLoadError("No event selected.");
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const [tenantIds, venueList] = await Promise.all([getUserTenantIds(), getUserVenues()]);
      setVenues(venueList);
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase
        .from("events")
        .select("id, title, description, start_ts, price_label, event_type, venue_id, tenant_id")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Event not found.");
      // Defense in depth: RLS already restricts reads to the vendor's
      // tenants, but never let the form edit an event from another tenant
      // if RLS were ever loosened.
      if (typeof data.tenant_id !== "string" || !tenantIds.includes(data.tenant_id)) {
        throw new Error("Event not found.");
      }
      setTitle(typeof data.title === "string" ? data.title : "");
      setPerformers(typeof data.description === "string" ? data.description : "");
      setDate(formatDateForInput(typeof data.start_ts === "string" ? data.start_ts : null));
      const existingType = typeof data.event_type === "string" && data.event_type ? data.event_type : "General Admission";
      setEventType(existingType);
      // Keep a legacy/unknown event_type selectable instead of silently
      // overwriting it with "General Admission" on save.
      setEventTypeOptions(
        EVENT_TYPES.includes(existingType) ? EVENT_TYPES : [existingType, ...EVENT_TYPES],
      );
      setTiers(parsePriceLabel(typeof data.price_label === "string" ? data.price_label : null));
      setSelectedVenueId(typeof data.venue_id === "string" ? data.venue_id : (venueList[0]?.id ?? null));
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Could not load event.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (session) void load();
    else setLoading(false);
  }, [session, load]);

  function validateDate(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return "Enter a date & time.";
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return "Enter a valid date & time (e.g. May 24, 2026, 8:00 PM).";
    }
    return null;
  }

  function updateTier(tierId: string, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((t) => (t.id === tierId ? { ...t, ...patch } : t)));
  }

  function removeTier(tierId: string) {
    setTiers((prev) => (prev.length <= 1 ? prev : prev.filter((t) => t.id !== tierId)));
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
    if (!eventId) {
      Alert.alert("No event selected", "Go back and pick an event to edit.");
      return;
    }
    const filledTiers = tiers.filter((t) => t.name.trim() || t.price.trim());
    const priceLabel =
      filledTiers.length > 0
        ? filledTiers.map((t) => `${t.name.trim() || "Ticket"}${t.price.trim() ? ` — $${t.price.trim().replace(/^\$/, "")}` : ""}`).join("; ")
        : null;
    setBusy(true);
    try {
      // venue_id + tenant_id stay set and consistent (from the selected
      // venue). status is deliberately NOT in the payload — the existing
      // value is preserved (see the header note).
      const { error } = await supabase
        .from("events")
        .update({
          title: title.trim(),
          description: performers.trim() || null,
          start_ts: new Date(date.trim()).toISOString(),
          price_label: priceLabel,
          event_type: eventType,
          venue_id: selectedVenue.id,
          tenant_id: selectedVenue.tenant_id,
        })
        .eq("id", eventId);
      if (error) throw error;
      Alert.alert("Event saved", "Your changes were saved.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Try again.");
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
          <Text style={styles.centerTitle}>Sign in to edit events</Text>
          <Text style={styles.centerSub}>Events are saved to your account. Sign in to continue.</Text>
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
          <Text style={styles.centerTitle}>Could not load event</Text>
          <Text style={styles.centerSub}>{loadError}</Text>
          <Pressable style={styles.centerBtn} onPress={() => router.back()}>
            <Text style={styles.centerBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if ((venues ?? []).length === 0) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Set up your venue first</Text>
          <Text style={styles.centerSub}>Events belong to a venue. Set yours up, then come back to edit events.</Text>
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
          <Text style={styles.title}>Edit Event</Text>
          <View style={{ width: 24 }} />
        </View>

        <Field label="Venue">
          <View style={styles.typeRow}>
            {(venues ?? []).map((v) => (
              <Pressable
                key={v.id}
                style={[styles.typeBtn, selectedVenueId === v.id && styles.typeBtnActive]}
                onPress={() => setSelectedVenueId(v.id)}
              >
                <Text style={[styles.typeText, selectedVenueId === v.id && styles.typeTextActive]}>{v.name}</Text>
              </Pressable>
            ))}
          </View>
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
            {eventTypeOptions.map((t) => (
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

        <Pressable style={[styles.saveBtn, busy && { opacity: 0.7 }]} onPress={onSave} disabled={busy}>
          <Text style={styles.saveText}>{busy ? "Saving…" : "Save Changes"}</Text>
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
  saveBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
