// Livework+ Home — Control Center (Phase 5).
// Preference + settings rows are HONESTLY DISABLED: no profile settings
// backend exists yet, so they render at reduced opacity with a "Soon"
// tag and a group explanation instead of pretending to work. The fake
// badges ("Serious", "3 set", "12 set", "Current", "Dark") and the fake
// 85% Profile Strength are deleted. Avatar navigates to Settings (real).
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
import { useRouter } from "expo-router";
import TopTabs from "../../components/TopTabs";
import { THEME } from "../../lib/theme";

type Row = {
  icon: string;
  title: string;
  sub: string;
};

const PREFERENCES: Row[] = [
  { icon: "heart", title: "Relationship Goals", sub: "Define what you're looking for" },
  { icon: "person", title: "Deal Breakers", sub: "Set your must-haves" },
  { icon: "options", title: "Preferences", sub: "Customize what matters to you" },
  { icon: "location", title: "Location", sub: "Manage your location preferences" },
];

const SETTINGS: Row[] = [
  { icon: "notifications", title: "Notifications", sub: "Manage alerts and reminders" },
  { icon: "lock-closed", title: "Privacy & Safety", sub: "Control your privacy settings" },
  { icon: "eye", title: "Visibility", sub: "Control your profile visibility" },
  { icon: "color-palette", title: "Appearance", sub: "Customize your app experience" },
];

const DISABLED_NOTE =
  "Preference and settings editing needs the profile settings backend — not yet built. These rows are disabled until then.";

/** Disabled row: visibly disabled, no press handler, "Soon" tag. */
function DisabledRow({ row }: { row: Row }) {
  return (
    <View style={[styles.rowCard, styles.rowDisabled]}>
      <View style={styles.rowIcon}>
        <Ionicons name={row.icon as never} size={20} color={THEME.purpleBright} />
      </View>
      <View style={styles.rowMid}>
        <Text style={styles.rowTitle}>{row.title}</Text>
        <Text style={styles.rowSub}>{row.sub}</Text>
      </View>
      <View style={styles.soonTag}>
        <Text style={styles.soonText}>Soon</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>
            Livework<Text style={styles.logoPlus}>+</Text>
          </Text>
          <Pressable
            style={styles.avatar}
            onPress={() => router.push("/(tabs)/settings")}
            accessibilityLabel="Open Settings"
          >
            <Ionicons name="person" size={22} color="rgba(255,255,255,0.85)" />
          </Pressable>
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

        {/* Preferences — disabled until the profile settings backend exists */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.group}>
          {PREFERENCES.map((r) => (
            <DisabledRow key={r.title} row={r} />
          ))}
        </View>
        <Text style={styles.disabledNote}>{DISABLED_NOTE}</Text>

        {/* Your Settings — disabled until the settings backend exists */}
        <Text style={styles.sectionLabel}>Your Settings</Text>
        <View style={styles.group}>
          {SETTINGS.map((r) => (
            <DisabledRow key={r.title} row={r} />
          ))}
        </View>
        <Text style={styles.disabledNote}>{DISABLED_NOTE}</Text>

        {/* Profile Strength — no profile model exists, so no number is shown */}
        <View style={styles.strengthCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.strengthTitle}>Profile Strength</Text>
            <Text style={styles.strengthSub}>
              Not calculated yet. Profile strength needs the profile model (not yet built).
            </Text>
          </View>
          <View style={[styles.improveBtn, styles.improveBtnDisabled]}>
            <Text style={[styles.improveText, styles.improveTextDisabled]}>Improve</Text>
          </View>
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
    marginBottom: 8,
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
  rowDisabled: { opacity: 0.55 },
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
  soonTag: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  soonText: { color: THEME.textMuted, fontSize: 11, fontWeight: "800" },
  disabledNote: { color: THEME.textFaint, fontSize: 12, lineHeight: 16, marginBottom: 22 },
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
  improveBtn: {
    borderWidth: 1,
    borderColor: THEME.purpleBright,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  improveBtnDisabled: { opacity: 0.5 },
  improveText: { color: THEME.purpleBright, fontWeight: "800", fontSize: 13 },
  improveTextDisabled: { color: THEME.textMuted },
});
