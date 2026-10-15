// Livework+ sign-in / register screen (email + password, Supabase Auth).
// No demo login, no hardcoded credentials. On success, returns to the tabs.
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
  const { session, signIn, signUp, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
      if (mode === "signin") await signIn(cleanEmail, password);
      else await signUp(cleanEmail, password);
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
        <Text style={styles.sub}>
          {mode === "signin"
            ? "Sign in with your operator account."
            : "Create your operator account."}
        </Text>

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
            <Text style={styles.submitText}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Text>
          )}
        </Pressable>

        {mode === "signup" && (
          <Text style={styles.hint}>
            If email confirmation is enabled in Supabase Auth, check your email
            to confirm your account before signing in.
          </Text>
        )}

        <Pressable
          style={styles.toggle}
          onPress={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
        >
          <Text style={styles.toggleText}>
            {mode === "signin"
              ? "Need an account? Create one ›"
              : "Already have an account? Sign in ›"}
          </Text>
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
  hint: { color: THEME.textFaint, fontSize: 12, lineHeight: 16, marginTop: 8 },
  toggle: { alignItems: "center", marginTop: 12 },
  toggleText: { color: THEME.purpleBright, fontSize: 14, fontWeight: "800" },
});
