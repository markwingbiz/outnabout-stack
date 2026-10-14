// Livework+ Dates — Date Planning (recreated from the supplied mockup).
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import TopTabs from "../../components/TopTabs";
import { THEME } from "../../lib/theme";

type Idea = { icon: string; title: string; sub: string; tint: string };

const IDEAS: Idea[] = [
  { icon: "restaurant", title: "Dinner and walk", sub: "Enjoy a great meal and a scenic stroll.", tint: "#8B5CF6" },
  { icon: "cafe", title: "Coffee and bookstore", sub: "Good coffee, great books, better conversation.", tint: "#38BDF8" },
  { icon: "film", title: "At-home movie night", sub: "Pick a classic, make snacks, and unwind together.", tint: "#F59E0B" },
];

type Action = { icon: string; title: string; sub: string; tint: string };

const ACTIONS: Action[] = [
  { icon: "calendar", title: "Schedule Date", sub: "Pick a time that works", tint: "#8B5CF6" },
  { icon: "bookmark", title: "Save Idea", sub: "Keep for later", tint: "#EC4899" },
  { icon: "wallet", title: "Set Budget", sub: "Plan with clarity", tint: "#38BDF8" },
  { icon: "list", title: "View Saved", sub: "See your ideas", tint: "#34D399" },
];

export default function DatesScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>
            Livework<Text style={styles.logoPlus}>+</Text>
          </Text>
          <View style={styles.avatar}>
            <Ionicons name="person" size={22} color="rgba(255,255,255,0.85)" />
          </View>
        </View>

        <TopTabs />

        {/* Date Planning hero */}
        <LinearGradient
          colors={["#2B1B5E", "#1A1038", "#14102A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Date Planning</Text>
            <Text style={styles.heroSub}>Curated ideas for meaningful connections</Text>
          </View>
          <View style={styles.heartWrap}>
            <Ionicons name="heart" size={36} color="#EC4899" />
          </View>
        </LinearGradient>

        {/* Date ideas */}
        <View style={styles.group}>
          {IDEAS.map((idea) => (
            <Pressable key={idea.title} style={styles.ideaRow} onPress={() => {}}>
              <View style={styles.ideaPhoto}>
                <Ionicons name={idea.icon as any} size={26} color="#fff" />
              </View>
              <View style={[styles.ideaIcon, { backgroundColor: `${idea.tint}30` }]}>
                <Ionicons name={idea.icon as any} size={22} color={idea.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ideaTitle}>{idea.title}</Text>
                <Text style={styles.ideaSub}>{idea.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
            </Pressable>
          ))}
        </View>

        {/* Date Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Date Actions</Text>
          <Text style={styles.cardSub}>Turn ideas into plans</Text>
          <View style={styles.actionGrid}>
            {ACTIONS.map((a) => (
              <Pressable key={a.title} style={styles.actionBtn} onPress={() => {}}>
                <View style={[styles.actionIcon, { backgroundColor: `${a.tint}30` }]}>
                  <Ionicons name={a.icon as any} size={22} color={a.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>{a.title}</Text>
                  <Text style={styles.actionSub}>{a.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={THEME.textFaint} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recommended */}
        <View style={styles.recoCard}>
          <View style={styles.recoPhoto}>
            <Ionicons name="business" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recoLabel}>Recommended for you</Text>
            <Text style={styles.recoTitle}>Rooftop dinner with city view</Text>
          </View>
          <Pressable style={styles.viewBtn} onPress={() => {}}>
            <Text style={styles.viewText}>View</Text>
          </Pressable>
        </View>

        <View style={{ height: 12 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  logo: { color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  logoPlus: { color: THEME.purpleBright },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#3B2A63",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(168,85,247,0.5)",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: THEME.radius,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  heroSub: { color: THEME.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  heartWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(236,72,153,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.4)",
  },
  group: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
    marginBottom: 16,
  },
  ideaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  ideaPhoto: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: "#3B2A63",
    alignItems: "center",
    justifyContent: "center",
  },
  ideaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  ideaTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  ideaSub: { color: THEME.textMuted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  cardSub: { color: THEME.textMuted, fontSize: 12, marginTop: 3, marginBottom: 14 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionBtn: {
    width: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(139,92,246,0.12)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.25)",
    padding: 12,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  actionSub: { color: THEME.textMuted, fontSize: 11, marginTop: 2 },
  recoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 12,
  },
  recoPhoto: {
    width: 72,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#3B2A63",
    alignItems: "center",
    justifyContent: "center",
  },
  recoLabel: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
  recoTitle: { color: "#fff", fontSize: 14, fontWeight: "800", marginTop: 3 },
  viewBtn: {
    borderWidth: 1,
    borderColor: THEME.purpleBright,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewText: { color: THEME.purpleBright, fontWeight: "800", fontSize: 13 },
});
