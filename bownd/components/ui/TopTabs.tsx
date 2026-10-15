// components/ui/TopTabs.tsx
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { usePathname, useRouter } from "expo-router";

type TabKey = "home" | "events" | "personal";

export default function TopTabs() {
  const router = useRouter();
  const pathname = usePathname();

  const active: TabKey =
    pathname.includes("/events") ? "events" : pathname.includes("/personal") ? "personal" : "home";

  function go(tab: TabKey) {
    if (tab === "home") router.replace("/");
    if (tab === "events") router.replace("/events");
    if (tab === "personal") router.replace("/personal");
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <Tab label="Home" isActive={active === "home"} onPress={() => go("home")} />
        <Tab label="Events" isActive={active === "events"} onPress={() => go("events")} />
        <Tab label="Personal" isActive={active === "personal"} onPress={() => go("personal")} />
      </View>
    </View>
  );
}

function Tab({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, isActive && styles.tabActive]}>
      <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
  },
  pill: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.32)",
    borderRadius: 18,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  tabText: {
    color: "rgba(50,50,50,0.70)",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: "#202020",
  },
});
