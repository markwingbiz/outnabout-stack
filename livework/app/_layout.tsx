// Livework root layout — Phase 5 + Phase 7 Slice 1.
// Wraps the app in phase-a-ui <AuthProvider> and registers the (auth)
// route (phase-a-ui lib/auth.tsx + app/(auth)/login.tsx must be copied
// into the repo for this to resolve).
//
// Slice 1: TenantGate redirects a signed-in vendor with no tenant
// membership to /setup-venue (onboarding). It never redirects from
// /setup-venue itself or from (auth). A membership-check error does not
// redirect — the dashboard surfaces the real error instead.
//
// Slice 3: redemptions + publish screens. The gate needs no change:
// vendors without a membership are still redirected to /setup-venue
// from these screens (they are membership-only screens).
import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { THEME } from "../lib/theme";
import { AuthProvider, useAuth } from "../lib/auth";
import { getUserTenantIds } from "../lib/tenant";
import { usePushBootstrap } from "../lib/push";

// Push notifications bootstrap (push-notifications-plan.md §1.1): wires
// the foreground handler, Android channels, tap deep-link routing, and
// token registration on sign-in. Renders nothing.
function PushBootstrap() {
  const { session } = useAuth();
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setTenantId(null);
      return;
    }
    let alive = true;
    getUserTenantIds()
      .then((ids) => {
        if (alive) setTenantId(ids[0] ?? null);
      })
      .catch(() => {
        // Registration retries on the next sign-in / rotation.
      });
    return () => {
      alive = false;
    };
  }, [session]);

  usePushBootstrap(session?.user?.id ?? null, tenantId, (route) =>
    router.push(route as never),
  );
  return null;
}

function TenantGate({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || !session) return;
    if (segments[0] === "setup-venue" || segments[0] === "(auth)") return;
    let alive = true;
    getUserTenantIds()
      .then((ids) => {
        if (alive && ids.length === 0) router.replace("/setup-venue");
      })
      .catch(() => {
        // No redirect on error — the dashboard shows the real error.
      });
    return () => {
      alive = false;
    };
  }, [authLoading, session, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <PushBootstrap />
      <TenantGate>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: THEME.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="add-event" />
          <Stack.Screen name="setup-venue" />
          <Stack.Screen name="venues" />
          <Stack.Screen name="venue-form" />
          <Stack.Screen name="edit-event" />
          <Stack.Screen name="redemptions" />
          <Stack.Screen name="publish" />
          <Stack.Screen name="notification-settings" />
          <Stack.Screen name="verify-review" />
          <Stack.Screen name="(auth)" />
        </Stack>
      </TenantGate>
    </AuthProvider>
  );
}
