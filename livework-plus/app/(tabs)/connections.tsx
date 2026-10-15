// Livework+ Connections (Phase 5).
// The 3 hardcoded demo people are deleted. This tab shows an honest
// empty state until the app_users profile / connections model exists —
// no fake names, no fake scores, no dead row buttons.
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from "react-native";
import TopTabs from "../../components/TopTabs";
import { THEME } from "../../lib/theme";

export default function ConnectionsScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Connections</Text>
        </View>
        <TopTabs />
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No connections yet.</Text>
          <Text style={styles.emptySub}>
            Connections load from the app_users table once profiles exist.
            This tab shows real connections only — no demo people.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 18, paddingTop: 10 },
  header: { marginBottom: 14 },
  title: { color: "#fff", fontSize: 26, fontWeight: "900" },
  emptyBox: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 20,
  },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  emptySub: { color: THEME.textMuted, fontSize: 13, marginTop: 8, lineHeight: 18 },
});
