// Livework Dashboard — vendor dashboard (Phase 5), rebuilt to the
// reference dashboard LAYOUT (desktop reference adapted to mobile:
// same sections stacked vertically, no desktop sidebar, existing
// mobile navigation kept).
//
// Every section shows live Supabase data or an explicit empty state.
// No demo data, no fake numbers. The reference's figures (28 events,
// 1,243 tickets, $23,892 revenue, $34.50 avg ticket, 89% attendance,
// Brickhouse / Brooklyn / Alex Thompson, Indie Fridays $4,560, …)
// are MOCKUP and are never shown. Ticket/revenue/attendance metrics
// have no backing (Livework has no ticketing) — those cards are
// omitted with an honest note, never invented numbers and never 0
// presented as sales. Projections / Audience / Smart Suggestions
// have no backing data — honest empty states, never invented
// forecasts, demographics, or suggestions.
//
// Requires phase-a-ui Auth (<AuthProvider> in app/_layout.tsx).
import React, { useCallback, useEffect, useState } from "react";
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
  RANGES,
  type DashboardData,
  type DashboardEvent,
  type RangeKey,
} from "../lib/data";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { getUserTenantIds, getUserVenues } from "../lib/tenant";

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
  // Independent per-section ranges: Event Activity and Top Performing
  // Events each track their own window. Their chips set ONLY their own
  // state — they never touch the global dashboard range, and neither
  // section follows the other. The global range keeps driving the rest
  // of the dashboard (stat cards, calendar, Recent Activity, export).
  const [activityRange, setActivityRange] = useState<RangeKey>("7d");
  const [topRange, setTopRange] = useState<RangeKey>("7d");
  const [activityData, setActivityData] = useState<DashboardData | null>(null);
  const [topData, setTopData] = useState<DashboardData | null>(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [venueCount, setVenueCount] = useState<number | null>(null);
  const [redemptionCount, setRedemptionCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const d = await fetchDashboard(range);
    setData(d);
    // Venue + redemption counts: real rows only, same queries the
    // Venues / Redemptions screens use. Failures leave the count
    // unknown ("—") instead of inventing a number.
    try {
      const venues = await getUserVenues();
      setVenueCount(venues.length);
    } catch {
      setVenueCount(null);
    }
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      const tenantIds = await getUserTenantIds();
      if (tenantIds.length === 0) {
        setRedemptionCount(0);
      } else {
        const { count, error } = await supabase
          .from("venue_redemptions")
          .select("id", { count: "exact", head: true })
          .in("tenant_id", tenantIds);
        if (error) throw error;
        setRedemptionCount(count ?? 0);
      }
    } catch {
      setRedemptionCount(null);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    if (session) void refresh();
    else setLoading(false);
  }, [session, refresh]);

  // Per-section fetches: each section reuses fetchDashboard with its OWN
  // range and renders only its own fields, so the sections are truly
  // independent of each other and of the global range.
  const refreshActivity = useCallback(async () => {
    const d = await fetchDashboard(activityRange);
    setActivityData(d);
  }, [activityRange]);

  const refreshTop = useCallback(async () => {
    const d = await fetchDashboard(topRange);
    setTopData(d);
  }, [topRange]);

  useEffect(() => {
    if (session) void refreshActivity();
  }, [session, refreshActivity]);

  useEffect(() => {
    if (session) void refreshTop();
  }, [session, refreshTop]);

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
          // Delete affects the global dashboard AND both independent
          // sections, so refetch all three.
          await refresh();
          await refreshTop();
          await refreshActivity();
        },
      },
    ]);
  }

  const chartWidth = Math.max(width - 64, 240);

  // A trend line needs at least 2 non-zero buckets — a single event draws
  // a misleading steep line, so that case gets an honest sparse-data state.
  // The chart reads ONLY the section's own fetch (activityData), never
  // the global dashboard data.
  const activityPoints = activityData?.activityPoints ?? [];
  const activityNonZero = activityPoints.filter((p) => p > 0).length;

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
        </View>

        {/* Slice 3: redemptions + publish outbox links. */}
        <View style={styles.headerRow}>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/redemptions")}>
            <Text style={styles.linkText}>Redemptions</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/publish")}>
            <Text style={styles.linkText}>Publish to Bownd</Text>
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

            {/* Stat cards — real vendor metrics only. Tickets Sold /
                Avg. Ticket Price / Attendance Rate are NOT shown:
                Livework has no ticketing, so those numbers do not
                exist. Showing 0 would misread as "no sales". */}
            <View style={styles.kpiGrid}>
              <Pressable style={styles.kpiCard} onPress={() => router.push("/venues")}>
                <View style={styles.kpiTop}>
                  <Text style={styles.kpiLabel}>Total Events</Text>
                  <Ionicons name="calendar" size={16} color={THEME.purple} />
                </View>
                <Text style={styles.kpiValue}>{data?.eventCount ?? 0}</Text>
                <Text style={styles.kpiDelta}>{data?.rangeLabel ?? ""}</Text>
              </Pressable>
              <Pressable style={styles.kpiCard} onPress={() => router.push("/venues")}>
                <View style={styles.kpiTop}>
                  <Text style={styles.kpiLabel}>Venues</Text>
                  <Ionicons name="business" size={16} color={THEME.blue} />
                </View>
                <Text style={styles.kpiValue}>{venueCount ?? "—"}</Text>
                <Text style={styles.kpiDelta}>Your venues</Text>
              </Pressable>
              <Pressable style={styles.kpiCard} onPress={() => router.push("/redemptions")}>
                <View style={styles.kpiTop}>
                  <Text style={styles.kpiLabel}>Redemptions</Text>
                  <Ionicons name="ticket" size={16} color={THEME.green} />
                </View>
                <Text style={styles.kpiValue}>{redemptionCount ?? "—"}</Text>
                <Text style={styles.kpiDelta}>Bownd redemptions</Text>
              </Pressable>
              <View style={styles.kpiCard}>
                <View style={styles.kpiTop}>
                  <Text style={styles.kpiLabel}>Verified Revenue</Text>
                  <Ionicons name="cash" size={16} color={THEME.orange} />
                </View>
                <Text style={styles.kpiValue}>{formatMoney(data?.verifiedRevenue ?? 0)}</Text>
                <Text style={styles.kpiDelta}>Verified only — projections never shown as earned</Text>
                {!!data?.revenueScopeNote && <Text style={styles.revenueNote}>{data.revenueScopeNote}</Text>}
              </View>
            </View>
            <Text style={styles.notTrackedNote}>
              Tickets sold, average ticket price, and attendance rate aren&apos;t tracked —
              Livework has no ticketing yet.
            </Text>

            {/* Event Activity — upcoming events per bucket in THIS
                section's own window. The chips set ONLY activityRange:
                they never touch the global dashboard range or the Top
                Performing Events window, and the chips always show this
                section's own active range. Previously both sections'
                chips drove the shared range, so changing one moved
                the other and the whole dashboard. */}
            <Section title="Event Activity">
              <View style={styles.rangeChipRow}>
                {RANGES.map((r) => (
                  <Pressable
                    key={r.key}
                    style={[styles.rangeChip, activityRange === r.key && styles.rangeChipActive]}
                    onPress={() => setActivityRange(r.key)}
                  >
                    <Text
                      style={[
                        styles.rangeChipText,
                        activityRange === r.key && styles.rangeChipTextActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.sectionNote}>
                Upcoming events in this section&apos;s window.
              </Text>
              <View style={styles.legendRow}>
                <Text style={styles.legend}><Text style={{ color: THEME.purple }}>●</Text> Events</Text>
              </View>
              {activityData === null ? (
                <ActivityIndicator color={THEME.purple} style={{ marginVertical: 12 }} />
              ) : !!activityData.error ? (
                <View>
                  <Text style={styles.errorText}>{activityData.error}</Text>
                  <Pressable onPress={() => void refreshActivity()}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : activityNonZero >= 2 ? (
                <>
                  <MultiLine
                    width={chartWidth}
                    height={130}
                    series={[{ color: THEME.purple, points: activityPoints }]}
                  />
                  <View style={styles.dayRow}>
                    {(activityData?.activityDays ?? []).map((d) => (
                      <Text key={d} style={styles.dayLabel}>{d.replace("May ", "")}</Text>
                    ))}
                  </View>
                </>
              ) : activityNonZero === 1 ? (
                <Text style={styles.empty}>
                  Not enough data for a trend — one event in this window.
                </Text>
              ) : (
                <Text style={styles.empty}>No events in this window.</Text>
              )}
            </Section>

            {/* Top Performing Events — the vendor's real events.
                No ticket/revenue data exists, so "top" cannot be
                ranked by performance: rows are soonest first, with
                real fields only (title, date, type, price, status).
                Edit / Delete work exactly as before. The list follows
                THIS section's own window (topData) via its own chips —
                it never touches the global range or the Event
                Activity window. */}
            <Section title="Top Performing Events">
              <View style={styles.rangeChipRow}>
                {RANGES.map((r) => (
                  <Pressable
                    key={r.key}
                    style={[styles.rangeChip, topRange === r.key && styles.rangeChipActive]}
                    onPress={() => setTopRange(r.key)}
                  >
                    <Text
                      style={[
                        styles.rangeChipText,
                        topRange === r.key && styles.rangeChipTextActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.sectionNote}>
                Your events, soonest first — performance ranking needs ticket data.
              </Text>
              {topData === null ? (
                <ActivityIndicator color={THEME.purple} style={{ marginVertical: 12 }} />
              ) : !!topData.error ? (
                <View>
                  <Text style={styles.errorText}>{topData.error}</Text>
                  <Pressable onPress={() => void refreshTop()}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : (topData?.events ?? []).length === 0 ? (
                <Text style={styles.empty}>No events yet.</Text>
              ) : (
                (topData?.events ?? []).map((e) => {
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

            {/* Event Calendar — real events. No "View Calendar" button:
                there is no separate calendar screen, and the calendar
                section is already on this screen — a button that scrolls
                to itself was a dead control. */}
            <Section title="Event Calendar">
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

            {/* Add New Event — opens the EXISTING create-event flow.
                The form itself is unchanged (same fields/behavior);
                this panel is the prominent entry point. */}
            <View style={styles.addEventCard}>
              <View style={styles.addEventHeader}>
                <Text style={styles.cardTitle}>Add New Event</Text>
                <Pressable onPress={() => router.push("/add-event")}>
                  <Ionicons name="add-circle" size={26} color={THEME.purple} />
                </Pressable>
              </View>
              <Text style={styles.addEventField}>Event Title</Text>
              <Text style={styles.addEventField}>Date &amp; Time</Text>
              <Text style={styles.addEventField}>Event Type</Text>
              <Text style={styles.addEventField}>Ticket Type &amp; Price</Text>
              <Pressable style={styles.createBtn} onPress={() => router.push("/add-event")}>
                <Text style={styles.createBtnText}>Create Event</Text>
              </Pressable>
              <Text style={styles.addEventNote}>Opens the full event form.</Text>
            </View>

            {/* Get more exposure — featured placement has no billing
                yet, so Boost is disabled with the reason, never sold. */}
            <View style={styles.boostCard}>
              <Text style={styles.boostTitle}>Get more exposure</Text>
              <Text style={styles.boostText}>Boost your events and reach more fans.</Text>
              <Pressable style={[styles.boostBtn, styles.boostBtnDisabled]} disabled>
                <Text style={styles.boostBtnText}>Boost Event</Text>
              </Pressable>
              <Text style={styles.boostReason}>
                Featured placement is coming soon — no billing yet, so boosting isn&apos;t available.
              </Text>
            </View>

            {/* Projections — no ticketing data exists, so no numbers are shown */}
            <Section title="Projections">
              <Text style={styles.empty}>Projections need historical ticket data — not available yet.</Text>
            </Section>

            {/* Audience Insights — no attendee data exists, so this is
                an honest empty state with no range to select: the
                old hardcoded "This Month" header action silently
                forced the whole dashboard to month, so it was
                removed rather than left lying about a window. */}
            <Section title="Audience Insights">
              <Text style={styles.empty}>Audience insights need attendee data — not available yet.</Text>
            </Section>

            {/* Smart Suggestions — no backing data exists, so no
                suggestions are invented. (The old general-tips list
                contained invented figures and was removed.) */}
            <Section title="Smart Suggestions">
              <Text style={styles.empty}>
                Smart suggestions need your event history and audience data — not available yet.
              </Text>
            </Section>

            {/* Recent Activity — real events, no fake publish/payout claims */}
            <Section title="Recent Activity">
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
  linkBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  linkText: { color: "#fff", fontWeight: "800", fontSize: 13 },
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
  kpiTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kpiLabel: { color: THEME.textMuted, fontSize: 12, fontWeight: "700" },
  kpiValue: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 6 },
  kpiDelta: { color: THEME.green, fontSize: 11, fontWeight: "800", marginTop: 4 },
  revenueNote: { color: THEME.textFaint, fontSize: 11, lineHeight: 15, marginTop: 6 },
  notTrackedNote: { color: THEME.textFaint, fontSize: 11, lineHeight: 15 },
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
  sectionNote: { color: THEME.textFaint, fontSize: 12, lineHeight: 16, marginBottom: 10 },
  legendRow: { flexDirection: "row", gap: 14, marginBottom: 10 },
  legend: { color: THEME.textMuted, fontSize: 11, fontWeight: "700" },
  rangeChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  rangeChip: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rangeChipActive: { borderColor: THEME.purple, backgroundColor: "rgba(139,92,246,0.18)" },
  rangeChipText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  rangeChipTextActive: { color: "#fff" },
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
  addEventCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
    gap: 10,
  },
  addEventHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addEventField: { color: THEME.textMuted, fontSize: 13 },
  createBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  createBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  addEventNote: { color: THEME.textFaint, fontSize: 11 },
  boostCard: {
    backgroundColor: "#1D1533",
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.4)",
    padding: 16,
    gap: 8,
  },
  boostTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  boostText: { color: THEME.textMuted, fontSize: 13, lineHeight: 18 },
  boostBtn: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 4,
  },
  boostBtnDisabled: { backgroundColor: THEME.cardBorder, opacity: 0.6 },
  boostBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  boostReason: { color: THEME.textMuted, fontSize: 12, lineHeight: 16 },
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
