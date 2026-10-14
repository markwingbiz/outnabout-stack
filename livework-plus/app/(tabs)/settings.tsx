// Livework+ Settings — mirrors the "Your Settings" rows from the
// Control Center mockup, plus account rows.
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { THEME } from "../../lib/theme";

const ROWS = [
  { icon: "notifications", title: "Notifications", sub: "Manage alerts and reminders" },
  { icon: "lock-closed", title: "Privacy & Safety", sub: "Control your privacy settings" },
  { icon: "eye", title: "Visibility", sub: "Control your profile visibility" },
  { icon: "color-palette", title: "Appearance", sub: "Dark theme", badge: "Dark" },
  { icon: "person-circle", title: "Account", sub: "Email, password, and sign-in" },
  { icon: "help-circle", title: "Help & Support", sub: "Contact support and FAQs" },
];

export default function SettingsScreen() {
  const [notifs, setNotifs] = React.useState(true);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.group}>
          {ROWS.map((r) => (
            <Pressable key={r.title} style={styles.row} onPress={() => {}}>
              <View style={styles.rowIcon}>
                <Ionicons name={r.icon as any} size={20} color={THEME.purpleBright} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.title}</Text>
                <Text style={styles.rowSub}>{r.sub}</Text>
              </View>
              {r.title === "Notifications" ? (
                <Switch
                  value={notifs}
                  onValueChange={setNotifs}
                  trackColor={{ false: "#3B3B4D", true: THEME.purpleBright }}
                />
              ) : (
                <>
                  {!!r.badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{r.badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
                </>
              )}
            </Pressable>
          ))}
        </View>
        <Text style={styles.version}>Livework+ 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 18, paddingTop: 10 },
  title: { color: "#fff", fontSize: 26, fontWeight: "900", marginBottom: 16 },
  group: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
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
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  rowSub: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  badge: {
    backgroundColor: "#3B3B4D",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  version: { color: THEME.textFaint, fontSize: 12, textAlign: "center", marginTop: 18 },
});
