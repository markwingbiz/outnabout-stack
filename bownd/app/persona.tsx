// app/persona.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  savePersona,
  DEFAULT_PERSONA,
  type PersonaProfile,
} from "../lib/personaStore";
import { useAuth } from "../lib/auth";
import { syncPersona } from "../lib/store";

type Audience = "singles" | "couples" | "parents";
type Vibe = "fun" | "relaxed" | "adventurous" | "spicy" | "sporty";

export default function PersonaBuilderScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const audiences: { key: Audience; label: string; icon: any }[] = useMemo(
    () => [
      { key: "singles", label: "Singles", icon: "sparkles-outline" },
      { key: "couples", label: "Couples", icon: "heart-outline" },
      { key: "parents", label: "Parents", icon: "people-outline" },
    ],
    []
  );

  const vibes: { key: Vibe; label: string; icon: any }[] = useMemo(
    () => [
      { key: "fun", label: "Fun", icon: "happy-outline" },
      { key: "relaxed", label: "Relaxed", icon: "leaf-outline" },
      { key: "adventurous", label: "Adventurous", icon: "trail-sign-outline" },
      { key: "spicy", label: "Spicy", icon: "flame-outline" },
      { key: "sporty", label: "Sporty", icon: "football-outline" },
    ],
    []
  );

  const [persona, setPersona] = useState<PersonaProfile>(DEFAULT_PERSONA);

  async function onSave() {
    await savePersona(persona);
    // Mirror to the signed-in user's Firestore profile (local copy stays).
    if (user) {
      try {
        await syncPersona(user.uid, persona);
      } catch {}
    }
    router.back();
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#6A35FF", "#B46CFF", "#FFD57A"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.hero}
      >
        <SafeAreaView style={styles.safe}>
          <View style={styles.topRow}>
            <Pressable style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable style={styles.iconBtn} onPress={() => setPersona(DEFAULT_PERSONA)}>
              <Ionicons name="refresh-outline" size={18} color="#fff" />
            </Pressable>
          </View>

          <Text style={styles.title}>Build Your Persona</Text>
          <Text style={styles.subtitle}>
            Pick who you are today — we’ll tune the app for you.
          </Text>

          <View style={styles.pillsRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Audience: {persona.audience}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Vibe: {persona.vibe}</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Audience</Text>
          <View style={styles.grid}>
            {audiences.map((a) => {
              const active = persona.audience === a.key;
              return (
                <Pressable
                  key={a.key}
                  style={[styles.card, active && styles.cardActive]}
                  onPress={() => setPersona((p) => ({ ...p, audience: a.key }))}
                >
                  <Ionicons name={a.icon} size={18} color={active ? "#fff" : "#6A35FF"} />
                  <Text style={[styles.cardText, active && styles.cardTextActive]}>
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Vibe</Text>
          <View style={styles.grid}>
            {vibes.map((v) => {
              const active = persona.vibe === v.key;
              return (
                <Pressable
                  key={v.key}
                  style={[styles.card, active && styles.cardActive]}
                  onPress={() => setPersona((p) => ({ ...p, vibe: v.key }))}
                >
                  <Ionicons name={v.icon} size={18} color={active ? "#fff" : "#6A35FF"} />
                  <Text style={[styles.cardText, active && styles.cardTextActive]}>
                    {v.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.saveBtn} onPress={onSave}>
            <Text style={styles.saveBtnText}>Save Persona</Text>
          </Pressable>

          <View style={{ height: 18 }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0B12" },
  hero: {
    height: 250,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 6 },
  topRow: { flexDirection: "row", alignItems: "center", paddingTop: 6 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { marginTop: 14, color: "#fff", fontSize: 28, fontWeight: "900" },
  subtitle: { marginTop: 8, color: "rgba(255,255,255,0.88)", fontSize: 12, fontWeight: "700" },
  pillsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  pill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
  },
  pillText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  sheet: {
    flex: 1,
    marginTop: -26,
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
  },
  sheetContent: { paddingHorizontal: 18, paddingTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#1B1B1B", marginBottom: 10 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    width: "48%",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: "#F7F7FB",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardActive: { backgroundColor: "#6A35FF", borderColor: "rgba(0,0,0,0)" },
  cardText: { fontSize: 13, fontWeight: "900", color: "#1B1B1B" },
  cardTextActive: { color: "#fff" },

  saveBtn: {
    marginTop: 18,
    backgroundColor: "#2D6BFF",
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },
});
