// Livework+ Connections — themed connection list.
// (Not shown in the supplied mockups; kept minimal and in-theme so the
// Connections tab works. Replace with the user's design when provided.)
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TopTabs from "../../components/TopTabs";
import { THEME } from "../../lib/theme";

const DEMO = [
  { name: "Alex Morgan", detail: "Shared 12 connections", score: "8.9" },
  { name: "Jordan Lee", detail: "Shared 8 connections", score: "8.2" },
  { name: "Sam Rivera", detail: "Shared 5 connections", score: "7.8" },
];

export default function ConnectionsScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Connections</Text>
        </View>
        <TopTabs />
        <View style={styles.group}>
          {DEMO.map((c) => (
            <Pressable key={c.name} style={styles.row} onPress={() => {}}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color="rgba(255,255,255,0.85)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.detail}>{c.detail}</Text>
              </View>
              <Text style={styles.score}>{c.score}</Text>
              <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          Connect Supabase to load real connections from the app_users table.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 18, paddingTop: 10 },
  header: { marginBottom: 14 },
  title: { color: "#fff", fontSize: 26, fontWeight: "900" },
  group: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#3B2A63",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: "#fff", fontSize: 15, fontWeight: "800" },
  detail: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  score: { color: THEME.purpleBright, fontSize: 15, fontWeight: "900" },
  hint: { color: THEME.textFaint, fontSize: 12, marginTop: 14, textAlign: "center" },
});
