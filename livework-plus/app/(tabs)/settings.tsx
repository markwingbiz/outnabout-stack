// Livework+ Settings (Phase 5).
// Notifications switch is persisted on-device (AsyncStorage) with an
// honest note that push is not set up yet. Account shows the real
// session (sign in / sign out). The other four rows are honestly
// disabled — their backend screens do not exist yet.
// Requires phase-a-ui Auth (<AuthProvider> in app/_layout.tsx).
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { THEME } from "../../lib/theme";
import { useAuth } from "../../lib/auth";
import { loadNotifPref, saveNotifPref } from "../../lib/local-store";

const DISABLED_ROWS = [
  { icon: "lock-closed", title: "Privacy & Safety", sub: "Control your privacy settings" },
  { icon: "eye", title: "Visibility", sub: "Control your profile visibility" },
  { icon: "color-palette", title: "Appearance", sub: "Dark theme" },
  { icon: "help-circle", title: "Help & Support", sub: "Contact support and FAQs" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { session, user, loading: authLoading, signOut } = useAuth();
  const [notifs, setNotifs] = useState(true);
  const [notifsLoaded, setNotifsLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let alive = true;
    loadNotifPref().then((v) => {
      if (alive) {
        setNotifs(v);
        setNotifsLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onToggleNotifs(value: boolean) {
    setNotifs(value);
    try {
      await saveNotifPref(value);
    } catch {
      // Preference write failed — revert the toggle so the UI never
      // claims a save that did not happen.
      setNotifs(!value);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* Notifications — preference persisted on-device; push not set up */}
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="notifications" size={20} color={THEME.purpleBright} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowSub}>Manage alerts and reminders</Text>
            </View>
            {!notifsLoaded ? (
              <ActivityIndicator color={THEME.purpleBright} />
            ) : (
              <Switch
                value={notifs}
                onValueChange={(v) => void onToggleNotifs(v)}
                trackColor={{ false: "#3B3B4D", true: THEME.purpleBright }}
              />
            )}
          </View>
        </View>
        <Text style={styles.note}>
          Push notifications are not set up yet (no notification service). This switch saves your
          preference on this device only.
        </Text>

        {/* Account — real session */}
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="person-circle" size={20} color={THEME.purpleBright} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Account</Text>
              <Text style={styles.rowSub}>
                {authLoading ? "Loading…" : session ? (user?.email ?? "Signed in") : "Not signed in"}
              </Text>
            </View>
            {session ? (
              <Pressable style={styles.accountBtn} onPress={() => void onSignOut()} disabled={signingOut}>
                <Text style={styles.accountBtnText}>{signingOut ? "Signing out…" : "Sign out"}</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.accountBtn} onPress={() => router.push("/(auth)/login")}>
                <Text style={styles.accountBtnText}>Sign in</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Disabled rows — backend screens do not exist yet */}
        <View style={styles.group}>
          {DISABLED_ROWS.map((r) => (
            <View key={r.title} style={[styles.row, styles.rowDisabled]}>
              <View style={styles.rowIcon}>
                <Ionicons name={r.icon as never} size={20} color={THEME.purpleBright} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.title}</Text>
                <Text style={styles.rowSub}>{r.sub}</Text>
              </View>
              <View style={styles.soonTag}>
                <Text style={styles.soonText}>Soon</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
            </View>
          ))}
        </View>
        <Text style={styles.note}>
          These settings need their backend screens — not yet built. They are disabled until then.
        </Text>

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
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
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
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  rowSub: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  soonTag: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  soonText: { color: THEME.textMuted, fontSize: 11, fontWeight: "800" },
  accountBtn: {
    borderWidth: 1,
    borderColor: THEME.purpleBright,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  accountBtnText: { color: THEME.purpleBright, fontWeight: "800", fontSize: 13 },
  note: { color: THEME.textFaint, fontSize: 12, lineHeight: 16, marginBottom: 16 },
  version: { color: THEME.textFaint, fontSize: 12, textAlign: "center", marginTop: 18 },
});
