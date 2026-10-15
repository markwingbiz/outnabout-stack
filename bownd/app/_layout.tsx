// app/_layout.tsx
// Phase 6 fix: the root-level duplicate routes /events, /personal, and
// /persona are DELETED (see FIX-PLAN.md). The canonical screens live in
// the (tabs) group. This layout therefore declares only `index` (root
// redirect) and `(auth)`. The (tabs) group and the modal screens
// (detail, list, vibe, redeem, scan) are auto-registered by Expo Router
// from their files — they need no explicit Stack.Screen entries.
import React from "react";
import { Stack } from "expo-router";
import { AuthProvider } from "../lib/auth";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        {/* Root redirect -> /(tabs) */}
        <Stack.Screen name="index" />

        {/* Authentication */}
        <Stack.Screen name="(auth)" />
      </Stack>
    </AuthProvider>
  );
}
