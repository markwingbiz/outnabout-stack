// Gate for Forge screens: requires a signed-in operator session.
// - Not signed in → "Sign in to use Forge" + button to /(auth)/login.
// - Signed in but not an operator → "Forge is for operators" state.
// Never shows admin tools to other roles.
import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { useOperatorStatus } from "../lib/forge";

export default function ForgeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, user, loading: authLoading, signOut } = useAuth();
  const { isOperator, checking } = useOperatorStatus(user?.id);

  if (authLoading || checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={THEME.purpleBright} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Sign in to use Forge</Text>
        <Text style={styles.sub}>
          Forge requires an operator account. Sign in to continue.
        </Text>
        <Pressable style={styles.btn} onPress={() => router.push("/(auth)/login")}>
          <Text style={styles.btnText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  if (!isOperator) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Forge is for operators</Text>
        <Text style={styles.sub}>
          Your account does not have the forge_operator role. Ask an admin to grant it.
        </Text>
        <Pressable
          style={[styles.btn, styles.btnSecondary]}
          onPress={() => void signOut()}
        >
          <Text style={styles.btnText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center" },
  sub: { color: THEME.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  btn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  btnSecondary: { backgroundColor: "rgba(255,255,255,0.12)" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
