// Livework notification settings — per-category push toggles
// (push-notifications-plan.md §1.6). Account & billing is always on
// (transactional: verification decisions, payment failures, grace
// deadlines); the business categories are switches persisted to the
// push_tokens registration via lib/push.ts.
import React, { useCallback, useEffect, useState } from "react";
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
import { THEME } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { getUserTenantIds } from "../lib/tenant";
import {
  PUSH_CATEGORIES,
  getPushPermissionState,
  loadCategoryPrefs,
  registerPushToken,
  requestPushPermission,
  saveCategoryPref,
  type PushCategoryPrefs,
  type PushPermissionState,
} from "../lib/push";

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [permission, setPermission] = useState<PushPermissionState>("undetermined");
  const [prefs, setPrefs] = useState<PushCategoryPrefs>({});
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [state, stored, tenantIds] = await Promise.all([
      getPushPermissionState(),
      loadCategoryPrefs(),
      getUserTenantIds().catch(() => [] as string[]),
    ]);
    setPermission(state);
    setPrefs(stored);
    setTenantId(tenantIds[0] ?? null);
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
      if (next === "granted") await registerPushToken(session?.user?.id ?? null, tenantId);
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(key: string, value: boolean) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    const next = await saveCategoryPref(key, value);
    setPrefs(next);
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Notifications</Text>
          <View style={{ width: 24 }} />
        </View>

        {!loaded ? (
          <ActivityIndicator color={THEME.purple} size="large" style={{ marginTop: 32 }} />
        ) : (
          <>
            {permission !== "granted" && (
              <View style={styles.enableCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.enableTitle}>Notifications are off</Text>
                  <Text style={styles.enableSub}>
                    Turn them on so account, sales and suggestion alerts can reach this device.
                  </Text>
                </View>
                <Pressable style={styles.enableBtn} onPress={() => void onEnable()} disabled={busy}>
                  <Text style={styles.enableBtnText}>{busy ? "…" : "Enable"}</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.group}>
              {PUSH_CATEGORIES.map((c, i) => (
                <View
                  key={c.key}
                  style={[styles.row, i === PUSH_CATEGORIES.length - 1 && styles.rowLast]}
                >
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
                      trackColor={{ false: "#3B3B4D", true: THEME.purple }}
                    />
                  )}
                </View>
              ))}
            </View>
            <Text style={styles.note}>
              Category choices are saved to your notification registration on this device and are
              honored by the sender.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "900" },
  enableCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
    marginBottom: 14,
  },
  enableTitle: { color: THEME.text, fontSize: 15, fontWeight: "800" },
  enableSub: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  enableBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  enableBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  group: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  rowLast: { borderBottomWidth: 0 },
  rowTitle: { color: THEME.text, fontSize: 15, fontWeight: "800" },
  rowSub: { color: THEME.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  alwaysOn: { color: THEME.purple, fontSize: 11, fontWeight: "800" },
  note: { color: THEME.textFaint, fontSize: 12, lineHeight: 16 },
});
