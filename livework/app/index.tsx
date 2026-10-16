// Livework Dashboard — venue dashboard (Phase 5).
// Every button has a real handler. Every section shows live Supabase data
// or an explicit empty state. No demo data, no fake publish/payout claims,
// no fake projections/audience numbers.
// Requires phase-a-ui Auth (<AuthProvider> in app/_layout.tsx).
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Share,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import MultiLine from "../components/MultiLine";
import { THEME } from "../lib/theme";
import {
  fetchDashboard,
  formatMoney,
  GENERAL_TIPS,
  RANGES,
  type DashboardData,
  type DashboardEvent,
  type RangeKey,
} from "../lib/data";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {!!action && (
          <Pressable onPress={onAction}>
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
  const { session, loading: authLoading } = useAuth();
  const [range, setRange] = useState<RangeKey>("7d");
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const calendarY = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const d = await fetchDashboard(range);
    setData(d);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    if (session) void refresh();
    else setLoading(false);
  }, [session, refresh]);

  async function onExport() {
    if (!data) return;
    if (data.events.length === 0 && data.verifiedRevenue === 0) {
      Alert.alert("Nothing to export yet", "No events or verified revenue in this range.");
      return;
    }
    const lines = [
      "Livework export",
      `Venue,${data.venueName}`,
      `Range,${data.rangeLabel}`,
      `Verified revenue,${data.verifiedRevenue}`,
      "",
      "Title,Date,Type,Price,Status",
      ...data.events.map((e) =>
        [e.title, e.dateLabel, e.eventType ?? "", e.priceLabel ?? "", e.status ?? ""]
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    try {
      await Share.share({ message: lines.join("\n"), title: "Livework export" });
    } catch {
      Alert.alert("Could not share", "The share sheet could not be opened. Try again.");
    }
  }

  // Delete: confirm first, then delete the vendor's own event row.
  // RLS restricts deletes to the vendor's tenants; the list only shows
  // the vendor's own events, so this can only delete their own rows.
  async function onDeleteEvent(e: DashboardEvent) {
    Alert.alert("Delete event?", `Delete "${e.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!supabase) {
            Alert.alert("Could not delete", "Supabase is not configured.");
            return;
          }
          const { error } = await supabase.from("events").delete().eq("id", e.id);
          if (error) {
            Alert.alert("Could not delete", error.message);
            return;
          }
          setExpandedId(null);
          await refresh();
        },
      },
    ]);
  }

  const chartWidth = Math.max(width - 64, 240);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={THEME.purple} size="large" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Sign in to see your dashboard</Text>
          <Text style={styles.centerSub}>Livework shows your venue's real data. Sign in to continue.</Text>
          <Pressable style={styles.centerBtn} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.centerBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back, {data?.userName ?? "there"}.</Text>
            <Text style={styles.sub}>
              Here&apos;s what&apos;s happening at {data?.venueName ?? "your venue"}.
            </Text>
          </View>
          <Pressable style={styles.exportBtn} onPress={() => void onExport()}>
            <Text style={styles.exportText}>Export</Text>
          </Pressable>
        </View>

        <View style={styles.headerRow}>
          <Pressable style={styles.rangeBtn} onPress={() => setRangePickerOpen((v) => !v)}>
            <Text style={styles.rangeText}>{data?.rangeLabel ?? "Next 7 days"}</Text>
          </Pressable>
          <Pressable style={styles.venuesBtn} onPress={() => router.push("/venues")}>
            <Text style={styles.venuesText}>My Venues</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => router.push("/add-event")}>
            <Text style={styles.addText}>+ Add New Event</Text>
          </Pressable>
        </View>

        {rangePickerOpen && (
          <View style={styles.picker}>
            {RANGES.map((r) => (
              <Pressable
                key={r.key}
                style={styles.pickerRow}
                onPress={() => {
                  setRange(r.key);
                  setRangePickerOpen(false);
                }}
              >
                <Text style={[styles.pickerText, range === r.key && styles.pickerTextActive]}>{r.label}</Text>
                {range === r.key && <Text style={styles.pickerCheck}>✓</Text>}
              </Pressable>
            ))}
          </View>
        )}

        {!!data?.error && (
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.errorText}>{data.error}</Text>
            <Pressable onPress={() => void refresh()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={THEME.purple} size="large" style={{ marginTop: 24 }} />
        ) : (
          <>
            {/* Setup — vendor has no membership or no venue yet */}
            {(data?.needsSetup || (data && !data.hasVenue)) && (
              <View style={[styles.card, styles.setupCard]}>
                <Text style={styles.setupTitle}>Set up your venue</Text>
                <Text style={styles.setupText}>
                  Your account has no venue yet. Set one up to see your events and revenue.
                </Text>
                <Pressable style={styles.setupBtn} onPress={() => router.push("/setup-venue")}>
                  <Text style={styles.setupBtnText}>Set up your venue</Text>
                </Pressable>
              </View>
            )}

            {/* KPI cards — real counts only */}
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Events</Text>
                <Text style={styles.kpiValue}>{data?.eventCount ?? 0}</Text>
                <Text style={styles.kpiDelta}>{data?.rangeLabel ?? ""}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Verified Revenue</Text>
                <Text style={styles.kpiValue}>{formatMoney(data?.verifiedRevenue ?? 0)}</Text>
                <Text style={styles.kpiDelta}>Verified only — projections never shown as earned</Text>
                {!!data?.revenueScopeNote && <Text style={styles.revenueNote}>{data.revenueScopeNote}</Text>}
              </View>
            </View>

            {/* Event Activity — real events-per-day */}
            <Section
              title="Event Activity"
              action="Last 7 Days"
              onAction={() => setRange("7d")}
            >
              <View style={styles.legendRow}>
                <Text style={styles.legend}><Text style={{ color: THEME.purple }}>●</Text> Events</Text>
              </View>
              {(data?.activityPoints ?? []).some((p) => p > 0) ? (
                <>
                  <MultiLine
                    width={chartWidth}
                    height={130}
                    series={[{ color: THEME.purple, points: data?.activityPoints ?? [] }]}
                  />
                  <View style={styles.dayRow}>
                    {(data?.activityDays ?? []).map((d) => (
                      <Text key={d} style={styles.dayLabel}>{d.replace("May ", "")}</Text>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.empty}>No events in this window.</Text>
              )}
            </Section>

            {/* Projections — no ticketing data exists, so no numbers are shown */}
            <Section title="Projections">
              <Text style={styles.empty}>Projections need historical ticket data — not available yet.</Text>
            </Section>

            {/* Your Events — real events rows, expandable */}
            <Section
              title="Your Events"
              action="This Month"
              onAction={() => setRange("month")}
            >
              {(data?.events ?? []).length === 0 ? (
                <Text style={styles.empty}>No events yet.</Text>
              ) : (
                (data?.events ?? []).map((e) => {
                  const expanded = expandedId === e.id;
                  return (
                    // Outer View (not a Pressable) so the Edit / Delete
                    // buttons below are siblings of the expand toggle,
                    // never nested inside it.
                    <View key={e.id} style={styles.eventRowWrap}>
                      <Pressable
                        style={styles.eventRow}
                        onPress={() => setExpandedId(expanded ? null : e.id)}
                      >
                        <View style={styles.eventThumb}>
                          <Ionicons name="musical-notes" size={18} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.eventTitle}>{e.title}</Text>
                          <Text style={styles.eventDate}>{e.dateLabel}</Text>
                          {expanded && (
                            <View style={{ marginTop: 6, gap: 2 }}>
                              {!!e.eventType && <Text style={styles.detailText}>Type: {e.eventType}</Text>}
                              {!!e.priceLabel && <Text style={styles.detailText}>Tickets: {e.priceLabel}</Text>}
                              {!!e.status && <Text style={styles.detailText}>Status: {e.status}</Text>}
                              {!!e.description && <Text style={styles.detailText}>{e.description}</Text>}
                            </View>
                          )}
                        </View>
                        <Ionicons
                          name={expanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={THEME.textMuted}
                        />
                      </Pressable>
                      {expanded && (
                        <View style={styles.eventActions}>
                          <Pressable
                            style={styles.actionBtn}
                            onPress={() => router.push(`/edit-event?id=${e.id}`)}
                          >
                            <Text style={styles.actionText}>Edit</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.actionBtn, styles.deleteBtn]}
                            onPress={() => void onDeleteEvent(e)}
                          >
                            <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </Section>

            {/* Audience Insights — no attendee data exists */}
            <Section title="Audience Insights" action="This Month" onAction={() => setRange("month")}>
              <Text style={styles.empty}>Audience insights need attendee data — not available yet.</Text>
            </Section>

            {/* Event Calendar — real events */}
            <View
              onLayout={(ev) => {
                calendarY.current = ev.nativeEvent.layout.y;
              }}
            >
              <Section
                title="Event Calendar"
                action="View Calendar"
                onAction={() => scrollRef.current?.scrollTo({ y: calendarY.current, animated: true })}
              >
                {(data?.calendar ?? []).length === 0 ? (
                  <Text style={styles.empty}>No events scheduled in this window.</Text>
                ) : (
                  (data?.calendar ?? []).map((d) => (
                    <View key={`${d.day}-${d.date}`} style={styles.calRow}>
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
                  ))
                )}
              </Section>
            </View>

            {/* Tips — general tips, labeled as such (not personalized) */}
            <Section title="Tips">
              <Text style={styles.tipsNote}>General tips — personalized suggestions need your event history.</Text>
              {GENERAL_TIPS.map((s) => (
                <View key={s} style={styles.suggRow}>
                  <Ionicons name="bulb" size={18} color={THEME.orange} />
                  <Text style={styles.suggText}>{s}</Text>
                </View>
              ))}
            </Section>

            {/* Latest Events — real events, no fake publish/payout claims */}
            <Section title="Latest Events">
              {(data?.latestEvents ?? []).length === 0 ? (
                <Text style={styles.empty}>No events yet.</Text>
              ) : (
                (data?.latestEvents ?? []).map((a) => (
                  <View key={a} style={styles.activityRow}>
                    <View style={styles.activityDot} />
                    <Text style={styles.activityText}>{a}</Text>
                  </View>
                ))
              )}
            </Section>
          </>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  centerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center" },
  centerSub: { color: THEME.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  centerBtn: { backgroundColor: THEME.purple, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  centerBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
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
  venuesBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  venuesText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  addBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  addText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  picker: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  pickerText: { color: THEME.textMuted, fontSize: 14, fontWeight: "700" },
  pickerTextActive: { color: "#fff" },
  pickerCheck: { color: THEME.green, fontSize: 14, fontWeight: "900" },
  errorCard: { borderColor: "rgba(236,72,153,0.5)" },
  errorText: { color: "#F9A8D4", fontSize: 13, lineHeight: 18 },
  retryText: { color: THEME.purple, fontSize: 13, fontWeight: "800", marginTop: 8 },
  empty: { color: THEME.textMuted, fontSize: 13, lineHeight: 18 },
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
  revenueNote: { color: THEME.textFaint, fontSize: 11, lineHeight: 15, marginTop: 6 },
  setupCard: { borderColor: "rgba(139,92,246,0.5)" },
  setupTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  setupText: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  setupBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 12,
  },
  setupBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },
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
  eventRowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    paddingBottom: 2,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  eventActions: { flexDirection: "row", gap: 8, paddingBottom: 10, paddingLeft: 56 },
  actionBtn: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.card,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  deleteBtn: { borderColor: "rgba(236,72,153,0.5)" },
  deleteText: { color: "#F9A8D4" },
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
  detailText: { color: THEME.textMuted, fontSize: 12, lineHeight: 16 },
  tipsNote: { color: THEME.textFaint, fontSize: 12, marginBottom: 10, lineHeight: 16 },
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
