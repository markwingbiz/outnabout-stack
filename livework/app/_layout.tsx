// Livework root layout — Phase 5.
// Wraps the app in phase-a-ui <AuthProvider> and registers the (auth)
// route (phase-a-ui lib/auth.tsx + app/(auth)/login.tsx must be copied
// into the repo for this to resolve).
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
          <Stack.Screen name="index" />
          <Stack.Screen name="add-event" />
          <Stack.Screen name="(auth)" />
        </Stack>
      </>
    </AuthProvider>
  );
}
