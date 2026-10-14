// Livework+ Insights — Monfun lives here (Funnel + Revenue overviews,
// recreated from the supplied mockup). Values come from Supabase when
// configured, else the demo fallback in lib/data.ts.
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Sparkline from "../../components/Sparkline";
import Ring from "../../components/Ring";
import { THEME, FUNNEL_ACCENTS } from "../../lib/theme";
import {
  fetchFunnels,
  fetchRevenue,
  formatMoney,
  DEMO_RELATIONSHIP,
  type FunnelCard,
} from "../../lib/data";

function FunnelTile({ f }: { f: FunnelCard }) {
  const accent = FUNNEL_ACCENTS[f.key];
  return (
    <View style={styles.funnelTile}>
      <View style={[styles.funnelIcon, { backgroundColor: `${accent.color}26` }]}>
        <Ionicons name={accent.icon as any} size={22} color={accent.color} />
      </View>
      <Text style={styles.funnelTitle}>{f.title}</Text>
      <Text style={styles.funnelValue}>{f.value}</Text>
      <Text style={styles.funnelLabel}>{f.label}</Text>
      <View style={styles.funnelBarTrack}>
        <View style={[styles.funnelBarFill, { width: `${f.pct}%`, backgroundColor: accent.bar }]} />
      </View>
      <Text style={styles.funnelPct}>{f.pct}%</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const router = useRouter();
  const [funnels, setFunnels] = useState<FunnelCard[]>([]);
  const [revenue, setRevenue] = useState({ total: 0, changePct: 0, spark: [] as number[] });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [f, r] = await Promise.all([fetchFunnels(), fetchRevenue()]);
      if (alive) {
        setFunnels(f);
        setRevenue(r);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Funnel Overview */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Funnel Overview</Text>
              <Text style={styles.cardSub}>Track all your funnels in one place.</Text>
            </View>
            <Pressable onPress={() => {}}>
              <Text style={styles.viewAll}>View All Funnels ›</Text>
            </Pressable>
          </View>

          <View style={styles.funnelGrid}>
            {funnels.map((f) => (
              <FunnelTile key={f.key} f={f} />
            ))}
          </View>
        </View>

        {/* Revenue Overview */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Revenue Overview</Text>
              <Text style={styles.cardSub}>All revenue across your funnels.</Text>
            </View>
            <Pressable style={styles.rangeBtn} onPress={() => {}}>
              <Text style={styles.rangeText}>Last 30 Days ⌄</Text>
            </Pressable>
          </View>

          <View style={styles.revenueRow}>
            <View>
              <Text style={styles.revenueLabel}>Total Revenue</Text>
              <Text style={styles.revenueTotal}>{formatMoney(revenue.total)}</Text>
              <Text style={styles.revenueDelta}>↑ {revenue.changePct}%</Text>
              <Text style={styles.revenueDeltaSub}>vs last 30 days</Text>
            </View>
            <Sparkline points={revenue.spark.length ? revenue.spark : [1, 2, 3]} width={170} height={60} />
          </View>
        </View>

        {/* Relationship Score */}
        <View style={styles.card}>
          <View style={styles.relRow}>
            <Ring pct={85} size={84} center="8.5" sub="/10" />
            <View style={{ flex: 1 }}>
              <Text style={styles.relTitle}>Relationship Score ✨</Text>
              <Text style={styles.relSub}>
                Your overall relationship health across all connections.
              </Text>
              <View style={styles.strongBadge}>
                <Text style={styles.strongText}>{DEMO_RELATIONSHIP.strength}</Text>
              </View>
              <Text style={styles.relHint}>{DEMO_RELATIONSHIP.hint}</Text>
            </View>
            <Pressable
              style={styles.insightsBtn}
              onPress={() => router.push("/(tabs)/insights")}
            >
              <Text style={styles.insightsText}>View Insights ›</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ height: 12 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 16 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  cardSub: { color: THEME.textMuted, fontSize: 12, marginTop: 3 },
  viewAll: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
  funnelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  funnelTile: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 12,
    alignItems: "center",
  },
  funnelIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  funnelTitle: { color: "#fff", fontSize: 12, fontWeight: "800", textAlign: "center" },
  funnelValue: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 4 },
  funnelLabel: { color: THEME.textMuted, fontSize: 11, marginTop: 2 },
  funnelBarTrack: {
    marginTop: 10,
    width: "100%",
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  funnelBarFill: { height: "100%", borderRadius: 3 },
  funnelPct: { color: THEME.textMuted, fontSize: 11, fontWeight: "800", marginTop: 6 },
  rangeBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rangeText: { color: THEME.textMuted, fontSize: 11, fontWeight: "800" },
  revenueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  revenueLabel: { color: THEME.textMuted, fontSize: 12 },
  revenueTotal: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 2 },
  revenueDelta: { color: THEME.green, fontSize: 13, fontWeight: "800", marginTop: 4 },
  revenueDeltaSub: { color: THEME.textFaint, fontSize: 11 },
  relRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  relTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  relSub: { color: THEME.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },
  strongBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(139,92,246,0.25)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  strongText: { color: THEME.purpleBright, fontSize: 11, fontWeight: "900" },
  relHint: { color: THEME.textFaint, fontSize: 11, marginTop: 4 },
  insightsBtn: { alignSelf: "flex-start" },
  insightsText: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
});
