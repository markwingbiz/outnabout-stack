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
  if (code.includes("email-already-in-use"))
    return "An account with that email already exists. Sign in instead.";
  if (code.includes("weak-password"))
    return "Password must be at least 6 characters.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("network-request-failed"))
    return "No network connection. Check your connection and try again.";
  return e?.message ?? "Something went wrong. Try again.";
}

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp, configured } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onRegister() {
    setError("");
    if (!email.trim() || !password) {
      setError("Enter an email and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await signUp(email, password, name);
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
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.sub}>Save favorites, earn rewards, and redeem offers across devices.</Text>

        {!configured && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              Backend is not configured. Add the EXPO_PUBLIC_FIREBASE_* values to .env to enable sign-up.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Name (optional)</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#9A9A9A"
            style={styles.input}
            autoComplete="name"
          />

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
            placeholder="At least 6 characters"
            placeholderTextColor="#9A9A9A"
            style={styles.input}
            secureTextEntry
            autoComplete="new-password"
          />

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat your password"
            placeholderTextColor="#9A9A9A"
            style={styles.input}
            secureTextEntry
            autoComplete="new-password"
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={[styles.btn, busy && styles.btnDim]} onPress={onRegister} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#0B0B0B" />
            ) : (
              <Text style={styles.btnText}>Create Account</Text>
            )}
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkBold}>Sign in</Text>
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
