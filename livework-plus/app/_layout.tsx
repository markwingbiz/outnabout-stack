// Livework+ root layout — Phase 5 + Phase 8 Slice 1 (auth hardening).
// Wraps the app in <AuthProvider> and registers the (auth) route.
// Phase 8 Slice 1: <AuthGate> redirects unsigned users to the login
// screen from anywhere outside the (auth) group, so the whole app
// (including the legacy Home / Connections / Dates tabs) requires a
// signed-in session. The (auth) group itself stays accessible unsigned;
// the login screen redirects signed-in users back to /(tabs), so there
// is no redirect loop: the gate only ever pushes unsigned users toward
// login, never away from it.
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { THEME } from "../lib/theme";
import { AuthProvider, useAuth } from "../lib/auth";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const inAuthGroup = segments[0] === "(auth)";

  useEffect(() => {
    if (loading) return;
    if (!session && !inAuthGroup) router.replace("/(auth)/login");
  }, [loading, session, inAuthGroup, router]);

  // While the session is resolving, show a loading screen instead of
  // flashing the tabs. While an unsigned user is being redirected,
  // render nothing so no gated tab content flashes.
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: THEME.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={THEME.purpleBright} size="large" />
      </View>
    );
  }
  if (!session && !inAuthGroup) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate>
        <>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: THEME.bg },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
          </Stack>
        </>
      </AuthGate>
    </AuthProvider>
  );
}
