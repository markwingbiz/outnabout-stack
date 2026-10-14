// Livework Dashboard — venue dashboard (recreated from the supplied
// mockup). The desktop layout is stacked vertically for phone width;
// every section and value from the mockup is preserved.
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import MultiLine from "../components/MultiLine";
import Donut from "../components/Donut";
import { THEME } from "../lib/theme";
import { fetchDashboard, DEMO, type DashboardData } from "../lib/data";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {!!action && (
          <Pressable onPress={() => {}}>
            <Text style={styles.cardAction}>{action}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<DashboardData>(DEMO);

  useEffect(() => {
    let alive = true;
    fetchDashboard().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const chartWidth = Math.max(width - 64, 240);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back, {data.userName}.</Text>
            <Text style={styles.sub}>
              Here&apos;s what&apos;s happening at {data.venueName}.
            </Text>
          </View>
          <Pressable style={styles.exportBtn} onPress={() => {}}>
            <Text style={styles.exportText}>Export</Text>
          </Pressable>
        </View>

        <View style={styles.headerRow}>
          <Pressable style={styles.rangeBtn} onPress={() => {}}>
            <Text style={styles.rangeText}>{data.rangeLabel}</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => router.push("/add-event")}>
            <Text style={styles.addText}>+ Add New Event</Text>
          </Pressable>
        </View>

        {/* KPI cards */}
        <View style={styles.kpiGrid}>
          {data.kpis.map((k) => (
            <View key={k.label} style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>{k.label}</Text>
              <Text style={styles.kpiValue}>{k.value}</Text>
              <Text style={styles.kpiDelta}>{k.delta}</Text>
            </View>
          ))}
        </View>

        {/* Event Activity */}
        <Section title="Event Activity" action="Last 7 Days">
          <View style={styles.legendRow}>
            <Text style={styles.legend}><Text style={{ color: THEME.purple }}>●</Text> Views</Text>
            <Text style={styles.legend}><Text style={{ color: THEME.blue }}>●</Text> Tickets Sold</Text>
            <Text style={styles.legend}><Text style={{ color: THEME.green }}>●</Text> Revenue</Text>
          </View>
          <MultiLine
            width={chartWidth}
            height={130}
            series={[
              { color: THEME.purple, points: data.activity.views },
              { color: THEME.blue, points: data.activity.tickets },
              { color: THEME.green, points: data.activity.revenue },
            ]}
          />
          <View style={styles.dayRow}>
            {data.activityDays.map((d) => (
              <Text key={d} style={styles.dayLabel}>{d.replace("May ", "")}</Text>
            ))}
          </View>
        </Section>

        {/* Projections */}
        <Section title="Projections" action="This Week">
          {data.projections.map((p) => (
            <View key={p.label} style={styles.projRow}>
              <Text style={styles.projLabel}>{p.label}</Text>
              <Text style={styles.projValue}>{p.value}</Text>
              <Text style={styles.projDelta}>{p.delta}</Text>
            </View>
          ))}
        </Section>

        {/* Top Performing Events */}
        <Section title="Top Performing Events" action="This Month">
          {data.topEvents.map((e) => (
            <Pressable key={e.title} style={styles.eventRow} onPress={() => {}}>
              <View style={styles.eventThumb}>
                <Ionicons name="musical-notes" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle}>{e.title}</Text>
                <Text style={styles.eventDate}>{e.date}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.eventRevenue}>{e.revenue}</Text>
                <Text style={styles.eventTickets}>{e.tickets}</Text>
              </View>
            </Pressable>
          ))}
        </Section>

        {/* Audience Insights */}
        <Section title="Audience Insights" action="This Month">
          <Text style={styles.subTitle}>Age Range</Text>
          <View style={styles.audienceRow}>
            <Donut slices={data.ageRanges} />
            <View style={{ flex: 1, gap: 6 }}>
              {data.ageRanges.map((a) => (
                <View key={a.label} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: a.color }]} />
                  <Text style={styles.legendText}>{a.label}</Text>
                  <Text style={styles.legendPct}>{a.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
          <Text style={[styles.subTitle, { marginTop: 16 }]}>Top Locations</Text>
          {data.topLocations.map((l) => (
            <View key={l.name} style={styles.locRow}>
              <Text style={styles.locName}>{l.name}</Text>
              <View style={styles.locBarTrack}>
                <View style={[styles.locBarFill, { width: `${l.pct}%` }]} />
              </View>
              <Text style={styles.locPct}>{l.pct}%</Text>
            </View>
          ))}
          <Text style={[styles.subTitle, { marginTop: 16 }]}>Top Interests</Text>
          <View style={styles.chipRow}>
            {data.topInterests.map((t) => (
              <View key={t} style={styles.chip}>
                <Text style={styles.chipText}>{t}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* Event Calendar */}
        <Section title="Event Calendar" action="View Calendar">
          {data.calendar.map((d) => (
            <View key={d.date} style={styles.calRow}>
              <View style={styles.calDay}>
                <Text style={styles.calDayLabel}>{d.day}</Text>
                <Text style={styles.calDate}>{d.date}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                {d.events.map((e) => (
                  <View key={e.title} style={styles.calEvent}>
                    <Text style={styles.calTime}>{e.time}</Text>
                    <Text style={styles.calTitle}>{e.title}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </Section>

        {/* Smart Suggestions */}
        <Section title="Smart Suggestions" action="Based on your past events">
          {data.suggestions.map((s) => (
            <View key={s} style={styles.suggRow}>
              <Ionicons name="bulb" size={18} color={THEME.orange} />
              <Text style={styles.suggText}>{s}</Text>
            </View>
          ))}
        </Section>

        {/* Recent Activity */}
        <Section title="Recent Activity">
          {data.recentActivity.map((a) => (
            <View key={a} style={styles.activityRow}>
              <View style={styles.activityDot} />
              <Text style={styles.activityText}>{a}</Text>
            </View>
          ))}
        </Section>

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 14 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  greeting: { color: "#fff", fontSize: 22, fontWeight: "900" },
  sub: { color: THEME.textMuted, fontSize: 13, marginTop: 4 },
  exportBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  exportText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  headerRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  rangeBtn: {
    flex: 1,
    backgroundColor: THEME.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  rangeText: { color: THEME.textMuted, fontSize: 13, fontWeight: "700" },
  addBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  addText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
  },
  kpiLabel: { color: THEME.textMuted, fontSize: 12, fontWeight: "700" },
  kpiValue: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 6 },
  kpiDelta: { color: THEME.green, fontSize: 11, fontWeight: "800", marginTop: 4 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  cardAction: { color: THEME.textMuted, fontSize: 12, fontWeight: "700" },
  legendRow: { flexDirection: "row", gap: 14, marginBottom: 10 },
  legend: { color: THEME.textMuted, fontSize: 11, fontWeight: "700" },
  dayRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  dayLabel: { color: THEME.textFaint, fontSize: 11, fontWeight: "700" },
  projRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  projLabel: { color: THEME.textMuted, fontSize: 13, flex: 1 },
  projValue: { color: "#fff", fontSize: 15, fontWeight: "900" },
  projDelta: { color: THEME.green, fontSize: 11, fontWeight: "800", width: 110, textAlign: "right" },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  eventThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#2B1B5E",
    alignItems: "center",
    justifyContent: "center",
  },
  eventTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  eventDate: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  eventRevenue: { color: "#fff", fontSize: 14, fontWeight: "900" },
  eventTickets: { color: THEME.textMuted, fontSize: 11, marginTop: 2 },
  subTitle: { color: "#fff", fontSize: 13, fontWeight: "800", marginBottom: 10 },
  audienceRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: THEME.textMuted, fontSize: 12, flex: 1 },
  legendPct: { color: "#fff", fontSize: 12, fontWeight: "800" },
  locRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  locName: { color: THEME.textMuted, fontSize: 12, width: 110 },
  locBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  locBarFill: { height: "100%", backgroundColor: THEME.purple, borderRadius: 3 },
  locPct: { color: "#fff", fontSize: 12, fontWeight: "800", width: 36, textAlign: "right" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "rgba(139,92,246,0.18)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: THEME.purple, fontSize: 12, fontWeight: "800" },
  calRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  calDay: { width: 40, alignItems: "center" },
  calDayLabel: { color: THEME.textMuted, fontSize: 11, fontWeight: "800" },
  calDate: { color: "#fff", fontSize: 16, fontWeight: "900" },
  calEvent: { flexDirection: "row", gap: 8, alignItems: "center" },
  calTime: { color: THEME.purple, fontSize: 12, fontWeight: "800", width: 64 },
  calTitle: { color: "#fff", fontSize: 13, fontWeight: "700" },
  suggRow: { flexDirection: "row", gap: 10, marginBottom: 10, alignItems: "flex-start" },
  suggText: { color: THEME.textMuted, fontSize: 13, flex: 1, lineHeight: 18 },
  activityRow: { flexDirection: "row", gap: 10, marginBottom: 10, alignItems: "flex-start" },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.purple,
    marginTop: 5,
  },
  activityText: { color: THEME.textMuted, fontSize: 13, flex: 1, lineHeight: 18 },
});
