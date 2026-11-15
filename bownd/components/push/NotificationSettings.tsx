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
        <ActivityIndicator color="#e8c476" />
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
            color="#e8c476"
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
              trackColor={{ false: "#271D47", true: "#4A4368" }}
              thumbColor="#ffffff"
            />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Premium dark surface (matches the Rewards panel it mounts in).
  card: {
    backgroundColor: "#171129",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  enableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  enableTitle: { fontSize: 13.5, fontWeight: "800", color: "#F5F3FB" },
  enableSub: { marginTop: 3, fontSize: 12, color: "#968FB2", fontWeight: "600", lineHeight: 16 },
  enableBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#4A4368",
  },
  enableBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  rowLast: { borderBottomWidth: 0 },
  rowTitle: { fontSize: 13.5, fontWeight: "800", color: "#F5F3FB" },
  rowSub: { marginTop: 2, fontSize: 12, color: "#968FB2", fontWeight: "600", lineHeight: 16 },
  alwaysOn: { fontSize: 11, fontWeight: "800", color: "#9DB9FF" },
});
