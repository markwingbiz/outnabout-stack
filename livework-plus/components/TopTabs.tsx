// Top segmented control: CONTROL / CONNECTION / DATES.
// Mirrors the tab row in the Livework+ mockups. It navigates to the
// matching bottom tab (Home / Connections / Dates).
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { THEME } from "../lib/theme";

type Tab = { key: string; label: string; icon: string; href: string };

const TABS: Tab[] = [
  { key: "control", label: "CONTROL", icon: "options-outline", href: "/(tabs)" },
  { key: "connection", label: "CONNECTION", icon: "link-outline", href: "/(tabs)/connections" },
  { key: "dates", label: "DATES", icon: "calendar-outline", href: "/(tabs)/dates" },
];

export default function TopTabs() {
  const router = useRouter();
  const pathname = usePathname();

  function isActive(t: Tab) {
    if (t.key === "control") return pathname === "/(tabs)" || pathname === "/";
    return pathname.includes(t.href.replace("/(tabs)/", ""));
  }

  return (
    <View style={styles.row}>
      {TABS.map((t) => {
        const active = isActive(t);
        return (
          <Pressable
            key={t.key}
            style={styles.item}
            onPress={() => router.replace(t.href as any)}
          >
            <Ionicons
              name={t.icon as any}
              size={18}
              color={active ? "#fff" : THEME.textFaint}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{t.label}</Text>
            {active && <View style={styles.underline} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginBottom: 18,
  },
  item: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  label: {
    color: THEME.textFaint,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  labelActive: { color: "#fff" },
  underline: {
    marginTop: 6,
    height: 3,
    width: "130%",
    borderRadius: 2,
    backgroundColor: THEME.purpleBright,
  },
});
