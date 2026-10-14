// Livework+ Home — Control Center (recreated from the supplied mockup).
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
import Ring from "../../components/Ring";
import { THEME } from "../../lib/theme";

type Row = {
  icon: string;
  title: string;
  sub: string;
  badge?: string;
  badgeColor?: string;
};

const PREFERENCES: Row[] = [
  { icon: "heart", title: "Relationship Goals", sub: "Define what you're looking for", badge: "Serious", badgeColor: "#8B5CF6" },
  { icon: "person", title: "Deal Breakers", sub: "Set your must-haves", badge: "3 set", badgeColor: "#38BDF8" },
  { icon: "options", title: "Preferences", sub: "Customize what matters to you", badge: "12 set", badgeColor: "#38BDF8" },
  { icon: "location", title: "Location", sub: "Manage your location preferences", badge: "Current", badgeColor: "#34D399" },
];

const SETTINGS: Row[] = [
  { icon: "notifications", title: "Notifications", sub: "Manage alerts and reminders" },
  { icon: "lock-closed", title: "Privacy & Safety", sub: "Control your privacy settings" },
  { icon: "eye", title: "Visibility", sub: "Control your profile visibility" },
  { icon: "color-palette", title: "Appearance", sub: "Customize your app experience", badge: "Dark 🌙", badgeColor: "#3B3B4D" },
];

function RowCard({ row }: { row: Row }) {
  return (
    <Pressable style={styles.rowCard} onPress={() => {}}>
      <View style={styles.rowIcon}>
        <Ionicons name={row.icon as any} size={20} color={THEME.purpleBright} />
      </View>
      <View style={styles.rowMid}>
        <Text style={styles.rowTitle}>{row.title}</Text>
        <Text style={styles.rowSub}>{row.sub}</Text>
      </View>
      {!!row.badge && (
        <View style={[styles.badge, { backgroundColor: row.badgeColor ?? "#8B5CF6" }]}>
          <Text style={styles.badgeText}>{row.badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
    </Pressable>
  );
}

export default function HomeScreen() {
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

        {/* Control Center hero */}
        <LinearGradient
          colors={["#2B1B5E", "#1A1038", "#14102A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Control Center</Text>
            <Text style={styles.heroSub}>
              Manage your preferences and set the foundation for great connections.
            </Text>
          </View>
          <View style={styles.shield}>
            <Ionicons name="shield-checkmark" size={44} color={THEME.purpleBright} />
          </View>
        </LinearGradient>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.group}>
          {PREFERENCES.map((r) => (
            <RowCard key={r.title} row={r} />
          ))}
        </View>

        {/* Your Settings */}
        <Text style={styles.sectionLabel}>Your Settings</Text>
        <View style={styles.group}>
          {SETTINGS.map((r) => (
            <RowCard key={r.title} row={r} />
          ))}
        </View>

        {/* Profile Strength */}
        <View style={styles.strengthCard}>
          <Ring pct={85} size={76} center="85%" />
          <View style={{ flex: 1 }}>
            <Text style={styles.strengthTitle}>Profile Strength ✨</Text>
            <Text style={styles.strengthSub}>
              Complete your profile to get better matches
            </Text>
            <View style={styles.strengthBar}>
              <View style={[styles.strengthFill, { width: "85%" }]} />
            </View>
          </View>
          <Pressable style={styles.improveBtn} onPress={() => {}}>
            <Text style={styles.improveText}>Improve</Text>
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
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  heroSub: { color: THEME.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  shield: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(168,85,247,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.4)",
  },
  sectionLabel: { color: "#fff", fontSize: 15, fontWeight: "800", marginBottom: 10 },
  group: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
    marginBottom: 22,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(168,85,247,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1 },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  rowSub: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  strengthCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  strengthTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  strengthSub: { color: THEME.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },
  strengthBar: {
    marginTop: 10,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  strengthFill: { height: "100%", backgroundColor: THEME.purpleBright, borderRadius: 3 },
  improveBtn: {
    borderWidth: 1,
    borderColor: THEME.purpleBright,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  improveText: { color: THEME.purpleBright, fontWeight: "800", fontSize: 13 },
});
