import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { THEME } from "../lib/theme";

export default function RootLayout() {
  return (
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
      </Stack>
    </>
  );
}
