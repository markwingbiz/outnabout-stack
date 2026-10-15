// Livework+ root layout — Phase 5.
// Wraps the app in phase-a-ui <AuthProvider> and registers the (auth)
// route (phase-a-ui lib/auth.tsx + app/(auth)/login.tsx must be copied
// into the repo for this to resolve). The (tabs) group picks up the
// phase-a-ui Forge tabs (forge, approvals, funnels, jobs) once they are
// copied in and registered in (tabs)/_layout.tsx (see phase-a-ui README).
import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { THEME } from "../lib/theme";
import { AuthProvider } from "../lib/auth";

export default function RootLayout() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}
