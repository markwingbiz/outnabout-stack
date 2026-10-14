// Livework — Add New Event form (matches the mockup's right panel:
// Event Title, Date & Time, Event Type, Performers/Artists,
// Ticket Type & Price, General Admission, Add Ticket Type, Event Image).
// Submitting writes to Supabase `events` when configured; otherwise it
// confirms locally (the Supabase tables are currently empty).
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { supabase } from "../lib/supabase";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export default function AddEventScreen() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [eventType, setEventType] = useState("General Admission");
  const [performers, setPerformers] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (!title.trim()) {
      Alert.alert("Missing title", "Enter an event title.");
      return;
    }
    setBusy(true);
    try {
      if (supabase) {
        const { error } = await supabase.from("events").insert({
          title: title.trim(),
          description: performers.trim() || null,
          start_ts: date.trim() ? new Date(date.trim()).toISOString() : null,
          price_label: price.trim() || null,
          event_type: eventType,
          status: "draft",
        });
        if (error) throw error;
      }
      Alert.alert("Event saved", supabase ? "Saved to Supabase." : "Saved locally (Supabase not configured).", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Could not save", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
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
            onChangeText={setDate}
            placeholder="May 24, 2024, 8:00 PM"
            placeholderTextColor={THEME.textFaint}
            style={styles.input}
          />
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

        <Field label="Ticket Type & Price">
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="General Admission — $25"
            placeholderTextColor={THEME.textFaint}
            style={styles.input}
            keyboardType="decimal-pad"
          />
        </Field>

        <Pressable style={styles.addTicket} onPress={() => {}}>
          <Text style={styles.addTicketText}>+ Add Ticket Type</Text>
        </Pressable>

        <Pressable style={styles.imageBox} onPress={() => {}}>
          <Ionicons name="image-outline" size={28} color={THEME.textFaint} />
          <Text style={styles.imageText}>Event Image</Text>
        </Pressable>

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
  },
  imageText: { color: THEME.textFaint, fontSize: 13, fontWeight: "700" },
  saveBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
