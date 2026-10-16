// Livework+ sign-in screen (email + password, Supabase Auth).
// No demo login, no hardcoded credentials. On success, returns to the tabs.
// Phase 8 Slice 1: sign-in ONLY. The sign-up UI was removed — Livework+
// is Mark's private command center, and open self-registration let any
// stranger create an account. Operator accounts are created in the
// Supabase dashboard. Disabling sign-ups server-side is a separate
// Supabase dashboard step (Authentication → Providers → Email → turn off
// "Allow new users to sign up") — this patch removes only the app-side
// sign-up path.
import React, { useEffect, useState } from "react";
import {
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { THEME } from "../../lib/theme";
import { useAuth } from "../../lib/auth";

export default function LoginScreen() {
  const router = useRouter();
  const { session, signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && session) router.replace("/(tabs)");
  }, [authLoading, session, router]);

  async function handleSubmit() {
    setError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Enter an email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(cleanEmail, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.title}>Livework+</Text>
        <Text style={styles.sub}>Sign in with your operator account.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={THEME.textFaint}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!submitting}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={THEME.textFaint}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!submitting}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Sign in</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 48, gap: 10 },
  title: { color: "#fff", fontSize: 30, fontWeight: "900" },
  sub: { color: THEME.textMuted, fontSize: 14, marginBottom: 14 },
  label: { color: "#fff", fontSize: 13, fontWeight: "800", marginTop: 6 },
  input: {
    color: "#fff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  error: { color: THEME.pink, fontSize: 13, lineHeight: 18, marginTop: 4 },
  submitBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
