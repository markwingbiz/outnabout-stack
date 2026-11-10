// Livework dashboard push-permission card — the plan §1.2 in-context
// ask for venues: shown when the vendor first reaches the dashboard with
// a created tenant and notification permission is still undetermined.
// One ask; a dismissal hides it for the session and a refusal is final
// (the Notification settings screen carries the quiet enable row).
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { THEME } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { getUserTenantIds } from "../lib/tenant";
import {
  getPushPermissionState,
  requestAndRegisterPush,
} from "../lib/push";

export default function PushPermissionCard() {
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!session || dismissed) return;
    let alive = true;
    (async () => {
      const [state, tenantIds] = await Promise.all([
        getPushPermissionState(),
        getUserTenantIds().catch(() => [] as string[]),
      ]);
      if (!alive) return;
      setTenantId(tenantIds[0] ?? null);
      // The moment requires a created tenant (plan §1.2). No tenant yet
      // means the vendor is still onboarding — no ask.
      setVisible(state === "undetermined" && tenantIds.length > 0);
    })();
    return () => {
      alive = false;
    };
  }, [session, dismissed]);

  if (!visible) return null;

  async function onEnable() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await requestAndRegisterPush(session?.user?.id ?? null, tenantId);
      if (next !== "undetermined") setVisible(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="notifications" size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Turn on notifications</Text>
        <Text style={styles.sub}>
          Get alerted when tickets sell and when a payment needs your attention.
        </Text>
        <View style={styles.btnRow}>
          <Pressable style={styles.enableBtn} onPress={() => void onEnable()} disabled={busy}>
            <Text style={styles.enableText}>{busy ? "…" : "Enable"}</Text>
          </Pressable>
          <Pressable style={styles.laterBtn} onPress={() => setDismissed(true)} disabled={busy}>
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: THEME.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: THEME.text, fontSize: 15, fontWeight: "800" },
  sub: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  enableBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  enableText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  laterBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  laterText: { color: THEME.textMuted, fontSize: 13, fontWeight: "700" },
});
