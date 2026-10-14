// app/_layout.tsx
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
        {/* These are your main pages */}
        <Stack.Screen name="index" />
        <Stack.Screen name="events" />
        <Stack.Screen name="personal" />

        {/* Separate persona builder page */}
        <Stack.Screen name="persona" />

        {/* Authentication */}
        <Stack.Screen name="(auth)" />
      </Stack>
    </AuthProvider>
  );
}
