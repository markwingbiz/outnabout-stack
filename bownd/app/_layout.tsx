// app/_layout.tsx
// Phase 6 fix: the root-level duplicate routes /events, /personal, and
// /persona are DELETED (see FIX-PLAN.md). The canonical screens live in
// the (tabs) group. This layout therefore declares only `index` (root
// redirect) and `(auth)`. The (tabs) group and the modal screens
// (detail, list, vibe, redeem, scan) are auto-registered by Expo Router
// from their files — they need no explicit Stack.Screen entries.
import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "../lib/auth";
import { usePushBootstrap } from "../lib/push";

// Splash minimum display (owner requirement, 2026-11-14): the splash must
// stay visible for at least 2 full seconds. Hold it at module scope, then
// hide it from RootLayout once the layout has mounted AND 2000ms have
// elapsed since JS start (the native splash shows from process start, so
// on-device visibility is always >= 2s).
SplashScreen.preventAutoHideAsync().catch(() => {});
const SPLASH_STARTED_AT = Date.now();
const SPLASH_MIN_MS = 2000;

// Push notifications bootstrap (push-notifications-plan.md §1.1): wires
// the foreground handler, Android channels, tap deep-link routing, and
// token registration on sign-in. Renders nothing.
function PushBootstrap() {
  const { user } = useAuth();
  const router = useRouter();
  usePushBootstrap(user?.uid ?? null, (route) => router.push(route as never));
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    const remaining = Math.max(0, SPLASH_MIN_MS - (Date.now() - SPLASH_STARTED_AT));
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, remaining);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthProvider>
      <PushBootstrap />
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
