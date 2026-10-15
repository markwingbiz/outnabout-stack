import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";

function friendlyError(e: any): string {
  const code = String(e?.code ?? "");
  if (code.includes("invalid-credential") || code.includes("wrong-password"))
    return "That email / password combination doesn't match. Try again.";
  if (code.includes("user-not-found"))
    return "No account found for that email. Create one below.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("too-many-requests"))
    return "Too many attempts. Wait a moment and try again.";
  if (code.includes("network-request-failed"))
    return "No network connection. Check your connection and try again.";
  return e?.message ?? "Something went wrong. Try again.";
}

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onLogin() {
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient
        colors={["#0B0622", "#1A0B3A", "#09061A"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.wrap}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.sub}>Sign in to save favorites, earn rewards, and redeem offers.</Text>

        {!configured && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              Backend is not configured. Add the EXPO_PUBLIC_FIREBASE_* values to .env to enable sign-in.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#9A9A9A"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor="#9A9A9A"
            style={styles.input}
            secureTextEntry
            autoComplete="password"
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={[styles.btn, busy && styles.btnDim]} onPress={onLogin} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#0B0B0B" />
            ) : (
              <Text style={styles.btnText}>Sign In</Text>
            )}
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push("/(auth)/register")}>
            <Text style={styles.linkText}>
              No account yet? <Text style={styles.linkBold}>Create one</Text>
            </Text>
          </Pressable>
        </View>

        <Pressable style={styles.guest} onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.guestText}>Continue as guest</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, justifyContent: "center" },
  title: { color: "white", fontSize: 30, fontWeight: "900" },
  sub: { color: "rgba(255,255,255,0.72)", marginTop: 8, marginBottom: 20, fontSize: 15 },
  warn: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    backgroundColor: "rgba(255,180,0,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,180,0,0.35)",
  },
  warnText: { color: "#FFD57A", fontSize: 13 },
  card: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  label: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "700", marginTop: 6 },
  input: {
    marginTop: 6,
    marginBottom: 10,
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    color: "white",
    fontSize: 16,
  },
  error: { color: "#FF8A8A", marginTop: 4, marginBottom: 8, fontSize: 14 },
  btn: {
    marginTop: 10,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  btnDim: { opacity: 0.7 },
  btnText: { color: "#0B0B0B", fontWeight: "900", fontSize: 16 },
  linkRow: { marginTop: 16, alignItems: "center" },
  linkText: { color: "rgba(255,255,255,0.75)" },
  linkBold: { color: "white", fontWeight: "800" },
  guest: { marginTop: 18, alignSelf: "center", padding: 10 },
  guestText: { color: "rgba(255,255,255,0.8)", fontWeight: "700" },
});
