// Bownd notification settings section — mounted in the Personal tab's
// "All" panel (plan §1.6: category toggles live in the app's settings /
// profile surface). Transactional categories are shown as always-on
// with the plan's plain-words rule; marketing categories are switches
// persisted to the push_tokens registration (via lib/push.ts).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Switch, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import {
  PUSH_CATEGORIES,
  getPushPermissionState,
  loadCategoryPrefs,
  registerPushToken,
  requestPushPermission,
  saveCategoryPref,
  type PushCategoryPrefs,
  type PushPermissionState,
} from "../../lib/push";

export default function NotificationSettings() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<PushPermissionState>("undetermined");
  const [prefs, setPrefs] = useState<PushCategoryPrefs>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [state, stored] = await Promise.all([getPushPermissionState(), loadCategoryPrefs()]);
    setPermission(state);
    setPrefs(stored);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onEnable() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await requestPushPermission();
      setPermission(next);
      if (next === "granted" && user) await registerPushToken(user.uid);
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(key: string, value: boolean) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    const next = await saveCategoryPref(key, value);
    setPrefs(next);
  }

  if (!loaded) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#6242bb" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {permission !== "granted" && (
        <View style={styles.enableRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.enableTitle}>Notifications are off</Text>
            <Text style={styles.enableSub}>
              Turn them on for ticket confirmations, event reminders and offers matched to you.
            </Text>
          </View>
          <TouchableOpacity style={styles.enableBtn} onPress={() => void onEnable()} disabled={busy}>
            <Text style={styles.enableBtnText}>{busy ? "…" : "Enable"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {PUSH_CATEGORIES.map((c, i) => (
        <View key={c.key} style={[styles.row, i === PUSH_CATEGORIES.length - 1 && styles.rowLast]}>
          <Ionicons
            name={c.locked ? "lock-closed-outline" : "notifications-outline"}
            size={18}
            color="#6242bb"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{c.label}</Text>
            <Text style={styles.rowSub}>{c.description}</Text>
          </View>
          {c.locked ? (
            <Text style={styles.alwaysOn}>Always on</Text>
          ) : (
            <Switch
              value={prefs[c.key] !== false}
              onValueChange={(v) => void onToggle(c.key, v)}
              trackColor={{ false: "#cfc9dd", true: "#6242bb" }}
            />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d5d0df",
  },
  enableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e7e3f0",
  },
  enableTitle: { fontSize: 14, fontWeight: "900", color: "#221c2a" },
  enableSub: { marginTop: 3, fontSize: 12, color: "#514a5a", fontWeight: "700", lineHeight: 16 },
  enableBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#3654b5",
  },
  enableBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e7e3f0",
  },
  rowLast: { borderBottomWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: "900", color: "#221c2a" },
  rowSub: { marginTop: 2, fontSize: 12, color: "#514a5a", fontWeight: "600", lineHeight: 16 },
  alwaysOn: { fontSize: 11, fontWeight: "900", color: "#6242bb" },
});
