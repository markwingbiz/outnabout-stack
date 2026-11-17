// Livework Dashboard — vendor dashboard (Phase 5).
//
// Premium visual rebuild (2026-11-15) to the approved mockup's
// Livework phone: wordmark header with the FOR VENUES pill, the
// venue card, three stat tiles (Verified Revenue / Events Live /
// Redemptions), the gradient Analytics & Insights banner, the
// gradient Create Event button, and Your Events cards carrying the
// real publish state. Presentation only — every data load, action
// and honest empty state below is the screen's existing behavior.
//
// Every section shows live Supabase data or an explicit empty state.
// No demo data, no fake numbers — EXCEPT the operator-only demo mode
// (lib/demo.ts): when the operator toggles "Preview demo", the whole
// dashboard swaps to a bundled, clearly-labeled sample dataset so
// Livework looks full when shown to someone. Demo mode never mixes
// with real data, never counts toward real metrics, shows $0 revenue,
// and demo rows have no Edit/Delete/publish/export. Ticket/revenue/
// attendance metrics have no backing (Livework has no ticketing) —
// those cards are omitted with an honest note, never invented numbers
// and never 0 presented as sales. Projections / Audience / Smart
// Suggestions have no backing data — honest empty states, never
// invented forecasts, demographics, or suggestions.
//
// Publish state on event cards is REAL (the event's status as read
// back from Supabase). The toggle does not flip state locally:
// publishing runs through the gated Publish flow (venue verification
// + the bownd_publish_requests outbox + bownd-sync), so the toggle
// routes there — the same reason the Publish screen is the only
// place that queues requests.
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
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Svg, { Polyline, Circle } from "react-native-svg";
import MultiLine from "../components/MultiLine";
import { useLiveworkFonts } from "../components/fonts";
import {
  fetchDashboard,
  formatMoney,
  RANGES,
  type DashboardData,
  type DashboardEvent,
  type RangeKey,
} from "../lib/data";
import {
  buildDemoDashboard,
  DEMO_REDEMPTION_COUNT,
  DEMO_VENUE_COUNT,
  isOperatorEmail,
} from "../lib/demo";
import { useAuth } from "../lib/auth";
import PushPermissionCard from "../components/PushPermissionCard";
import { supabase } from "../lib/supabase";
import { getUserTenantIds, getUserVenues, type TenantVenue } from "../lib/tenant";
import { verificationStatusOf } from "../lib/verification";

// Premium palette (brochure plum/gold) — local to this screen because
// lib/theme.ts (THEME) is shared by every Livework screen and is
// off-limits for this pass; analytics.tsx set the same precedent.
const PLUM = {
  bg: "#0A0616",
  surface: "#171129",
  surface2: "#1E1733",
  surface3: "#271D47",
  line: "rgba(232,196,118,0.14)",
  lineSoft: "rgba(255,255,255,0.07)",
  line2: "rgba(255,255,255,0.12)",
  ink: "#F5F3FB",
  ink2: "#C8C3DC",
  muted: "#968FB2",
  faint: "rgba(255,255,255,0.38)",
  gold: "#E8C476",
  goldSoft: "rgba(232,196,118,0.13)",
  goldBorder: "rgba(232,196,118,0.40)",
  green: "#3DDC97",
  link: "#9DB9FF",
  gradient: ["#2F6BFF", "#5B34E0", "#7A2BD0"] as const,
  // Venue avatar / event thumb gradient (mockup .lw-venue-ico, 135deg)
  duoGradient: ["#6D28D9", "#2F6BFF"] as const,
  // Screen background: plum depth over the mockup's #0d0a1c base.
  screenGradient: ["#1E1338", "#0D0A1C", "#0A0616"] as const,
  chartLine: "#A678F0",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

// Real publish state from the event's status (the only status
// Livework itself writes is "draft"; published/spotlight arrive via
// bownd-sync once a queued publish lands in Bownd).
function publishState(e: DashboardEvent): { live: boolean; spotlight: boolean } {
  const s = (e.status ?? "").toLowerCase();
  return {
    live: s.includes("publish") || s.includes("spotlight"),
    spotlight: s.includes("spotlight"),
  };
}

function PublishToggle({ live, onPress }: { live: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[styles.toggle, live ? styles.toggleOn : styles.toggleOff]}
      accessibilityRole="switch"
      accessibilityState={{ checked: live }}
    >
      <View style={[styles.toggleKnob, live ? styles.toggleKnobOn : styles.toggleKnobOff]} />
    </Pressable>
  );
}

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
  const fonts = useLiveworkFonts();
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, fonts.display]}>{title}</Text>
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
  const fonts = useLiveworkFonts();
  const { width } = useWindowDimensions();
  const { session, loading: authLoading } = useAuth();
  const [range, setRange] = useState<RangeKey>("7d");
  // Independent per-section ranges: Event Activity and Your Events
  // each track their own window. Their chips set ONLY their own
  // state — they never touch the global dashboard range, and neither
  // section follows the other. The global range keeps driving the
  // rest of the dashboard (stat cards, calendar, Recent Activity,
  // export).
  const [activityRange, setActivityRange] = useState<RangeKey>("7d");
  const [topRange, setTopRange] = useState<RangeKey>("7d");
  const [activityData, setActivityData] = useState<DashboardData | null>(null);
  const [topData, setTopData] = useState<DashboardData | null>(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [venueCount, setVenueCount] = useState<number | null>(null);
  const [primaryVenue, setPrimaryVenue] = useState<TenantVenue | null>(null);
  const [redemptionCount, setRedemptionCount] = useState<number | null>(null);
  // Demo mode: operator-only showcase view (lib/demo.ts). Session-only
  // state — every fresh open starts on REAL data. While demo is on, no
  // Supabase queries run and nothing on screen is real data.
  const [demoOn, setDemoOn] = useState(false);
  const isOperator = isOperatorEmail(session?.user?.email ?? null);

  const refresh = useCallback(async () => {
    setLoading(true);
    if (demoOn) {
      // Demo: bundled sample dataset only — no Supabase reads, no real
      // rows. Counts are the demo constants, never real metrics.
      const userName = session?.user?.email?.split("@")[0] ?? "there";
      setData(buildDemoDashboard(range, userName));
      setVenueCount(DEMO_VENUE_COUNT);
      setPrimaryVenue(null);
      setRedemptionCount(DEMO_REDEMPTION_COUNT);
      setLoading(false);
      return;
    }
    const d = await fetchDashboard(range);
    setData(d);
    // Venue + redemption counts: real rows only, same queries the
    // Venues / Redemptions screens use. Failures leave the count
    // unknown ("—") instead of inventing a number. The primary venue
    // (venues[0], the same venue fetchDashboard names) feeds the
    // venue card.
    try {
      const venues = await getUserVenues();
      setVenueCount(venues.length);
      setPrimaryVenue(venues[0] ?? null);
    } catch {
      setVenueCount(null);
      setPrimaryVenue(null);
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
  }, [range, demoOn, session?.user?.email]);

  useEffect(() => {
    if (session) void refresh();
    else setLoading(false);
  }, [session, refresh]);

  // Per-section fetches: each section reuses fetchDashboard with its OWN
  // range and renders only its own fields, so the sections are truly
  // independent of each other and of the global range. In demo mode the
  // sections use the same bundled sample dataset.
  const refreshActivity = useCallback(async () => {
    if (demoOn) {
      setActivityData(buildDemoDashboard(activityRange, session?.user?.email?.split("@")[0] ?? "there"));
      return;
    }
    const d = await fetchDashboard(activityRange);
    setActivityData(d);
  }, [activityRange, demoOn, session?.user?.email]);

  const refreshTop = useCallback(async () => {
    if (demoOn) {
      setTopData(buildDemoDashboard(topRange, session?.user?.email?.split("@")[0] ?? "there"));
      return;
    }
    const d = await fetchDashboard(topRange);
    setTopData(d);
  }, [topRange, demoOn, session?.user?.email]);

  useEffect(() => {
    if (session) void refreshActivity();
  }, [session, refreshActivity]);

  useEffect(() => {
    if (session) void refreshTop();
  }, [session, refreshTop]);

  async function onExport() {
    if (!data) return;
    // Demo data must never leave the app as if it were real: exporting
    // sample rows could be mistaken for a real export.
    if (demoOn) {
      Alert.alert("Demo data can't be exported", "Switch back to your real data to export.");
      return;
    }
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
  async function onDeleteEvent(e: Pick<DashboardEvent, "id" | "title">) {
    // Defense in depth: demo rows have no Delete button, but a delete
    // call for a demo id must never reach Supabase.
    if (demoOn || e.id.startsWith("demo-")) {
      Alert.alert("Sample event", "Demo data can't be deleted.");
      return;
    }
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

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  // Events Live tile: real publish state across the dashboard's own
  // fetched events (same rows the lists below render).
  const eventsLive = (data?.events ?? []).filter((e) => publishState(e).live).length;

  const venueDisplayName = primaryVenue?.name ?? data?.venueName ?? "Your venue";
  const venueVerified =
    primaryVenue !== null && verificationStatusOf(primaryVenue) === "verified";
  const venueSub = primaryVenue
    ? [primaryVenue.address, primaryVenue.city, primaryVenue.state]
        .filter(Boolean)
        .join(" · ") || "Kansas City"
    : demoOn
      ? "Sample venue — demo data"
      : "Kansas City";

  if (authLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={PLUM.gold} size="large" style={{ marginTop: 40 }} />
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
      <LinearGradient
        colors={[...PLUM.screenGradient]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header — the mockup's Livework top: green live dot +
            wordmark + FOR VENUES pill, greeting sub, bell. */}
        <View style={styles.lwTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.wordmarkRow}>
              <View style={styles.liveDot} />
              <Text style={[styles.wordmark, fonts.display]}>livework</Text>
              <View style={styles.forVenuesPill}>
                <Text style={styles.forVenuesText}>FOR VENUES</Text>
              </View>
            </View>
            <Text style={styles.lwSub}>{greeting} · Your venue at a glance</Text>
          </View>
          <Pressable
            style={styles.bellBtn}
            onPress={() => router.push("/notification-settings")}
            accessibilityLabel="Notification settings"
          >
            <Ionicons name="notifications-outline" size={18} color={PLUM.ink2} />
          </Pressable>
        </View>

        {/* Create Event — the mockup's gradient CTA, kept at the top
            where the dashboard always had its prominent create entry
            point (buried mid-scroll was a findability bug). Opens the
            existing add-event form; in demo mode it still creates a
            REAL event in the form — the demo banner below explains
            the dashboard data is sample. */}
        <View>
          <Pressable onPress={() => router.push("/add-event")}>
            <LinearGradient
              colors={[...PLUM.gradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.createBtn}
            >
              <Text style={[styles.createBtnText, fonts.display]}>+ Create Event</Text>
            </LinearGradient>
          </Pressable>
          <Text style={styles.createNote}>
            Drafts stay private until you publish to Bownd.
          </Text>
        </View>

        {/* Push permission — the plan §1.2 in-context ask; the card
            renders only for a vendor with a tenant who hasn't decided. */}
        <PushPermissionCard />

        {/* Operator-only demo toggle. While demo is on, the whole
            dashboard shows the bundled sample dataset (lib/demo.ts)
            — no real queries run and nothing on screen is real. */}
        {isOperator && (
          <Pressable
            style={[styles.demoToggleBtn, demoOn && styles.demoToggleBtnActive]}
            onPress={() => setDemoOn((v) => !v)}
          >
            <Text style={styles.demoToggleText}>
              {demoOn ? "Exit demo — back to real data" : "Preview demo"}
            </Text>
          </Pressable>
        )}

        {/* DEMO banner — always visible while demo is on so sample data
            can never be mistaken for real data. */}
        {demoOn && (
          <View style={styles.demoBanner}>
            <Text style={styles.demoBannerTitle}>DEMO — sample data, not real</Text>
            <Text style={styles.demoBannerText}>
              Nothing here is your real venue data. Demo events can&apos;t be edited,
              deleted, published, or exported, and demo revenue is never earnings.
            </Text>
          </View>
        )}

        {/* Utility row: dashboard range + export + venues. */}
        <View style={styles.headerRow}>
          <Pressable style={styles.rangeBtn} onPress={() => setRangePickerOpen((v) => !v)}>
            <Text style={styles.rangeText}>{data?.rangeLabel ?? "Next 7 days"}</Text>
          </Pressable>
          <Pressable style={styles.venuesBtn} onPress={() => void onExport()}>
            <Text style={styles.venuesText}>Export</Text>
          </Pressable>
          <Pressable style={styles.venuesBtn} onPress={() => router.push("/venues")}>
            <Text style={styles.venuesText}>My Venues{venueCount !== null ? ` (${venueCount})` : ""}</Text>
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

        {/* Quick links (the bell above also reaches notification
            settings, the mockup's bell target). */}
        <View style={styles.headerRow}>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/redemptions")}>
            <Text style={styles.linkText}>Redemptions</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/publish")}>
            <Text style={styles.linkText}>Publish to Bownd</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/analytics")}>
            <Text style={styles.linkText}>Analytics</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/notification-settings")}>
            <Text style={styles.linkText}>Notifications</Text>
          </Pressable>
        </View>

        {!!data?.error && (
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.errorText}>{data.error}</Text>
            <Pressable onPress={() => void refresh()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={PLUM.gold} size="large" style={{ marginTop: 24 }} />
        ) : (
          <>
            {/* Setup — vendor has no membership or no venue yet */}
            {(data?.needsSetup || (data && !data.hasVenue)) && (
              <View style={[styles.card, styles.setupCard]}>
                <Text style={[styles.setupTitle, fonts.display]}>Set up your venue</Text>
                <Text style={styles.setupText}>
                  Your account has no venue yet. Set one up to see your events and revenue.
                </Text>
                <Pressable style={styles.setupBtn} onPress={() => router.push("/setup-venue")}>
                  <Text style={styles.setupBtnText}>Set up your venue</Text>
                </Pressable>
              </View>
            )}

            {/* Venue card — the mockup's venue row: gradient initials
                avatar, name + Verified badge, address line. */}
            {!!data?.hasVenue && (
              <Pressable style={styles.venueCard} onPress={() => router.push("/venues")}>
                <LinearGradient
                  colors={[...PLUM.duoGradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.venueAvatar}
                >
                  <Text style={[styles.venueInitials, fonts.display]}>
                    {initialsOf(venueDisplayName)}
                  </Text>
                </LinearGradient>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.venueNameRow}>
                    <Text style={[styles.venueName, fonts.bodyExtraBold]} numberOfLines={1}>
                      {venueDisplayName}
                    </Text>
                    {venueVerified && (
                      <View style={styles.verifiedBadge}>
                        <Text style={styles.verifiedText}>✓ Verified</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.venueSub} numberOfLines={1}>
                    {venueSub}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={PLUM.muted} />
              </Pressable>
            )}

            {/* Stat tiles — the mockup's three: Verified Revenue
                (gold), Events Live, Redemptions. Real data only:
                tickets sold / avg. ticket / attendance are NOT shown
                because Livework has no ticketing (see the note). */}
            <View style={styles.statRow}>
              <View style={[styles.statTile, { flex: 1.3 }]}>
                <Text style={styles.statLabel}>Verified Revenue</Text>
                <Text style={[styles.statValue, fonts.display, { color: PLUM.gold }]}>
                  {formatMoney(data?.verifiedRevenue ?? 0)}
                </Text>
                <Text style={styles.statSmall}>Verified only</Text>
              </View>
              <View style={[styles.statTile, { flex: 0.85 }]}>
                <Text style={styles.statLabel}>Events Live</Text>
                <Text style={[styles.statValue, fonts.display]}>{eventsLive}</Text>
                <Text style={styles.statSmall}>On Bownd</Text>
              </View>
              <Pressable
                style={[styles.statTile, { flex: 0.95 }]}
                onPress={() => router.push("/redemptions")}
              >
                <Text style={styles.statLabel}>Redemptions</Text>
                <Text style={[styles.statValue, fonts.display]}>{redemptionCount ?? "—"}</Text>
                <Text style={styles.statSmall}>All time</Text>
              </Pressable>
            </View>
            {!!data?.revenueScopeNote && (
              <Text style={styles.revenueNote}>{data.revenueScopeNote}</Text>
            )}
            <Text style={styles.notTrackedNote}>
              Tickets sold, average ticket price, and attendance rate aren&apos;t tracked —
              Livework has no ticketing yet.
            </Text>

            {/* Analytics & Insights banner — the mockup's gradient
                charted-results card, linking to the analytics screen. */}
            <Pressable onPress={() => router.push("/analytics")}>
              <LinearGradient
                colors={["#1D1440", "#140E2A"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.insBanner}
              >
                {/* The mockup's banner carries a gold sparkline, not
                    an icon box. */}
                <Svg width={52} height={30} viewBox="0 0 52 30" style={{ flexShrink: 0 }}>
                  <Polyline
                    points="2,24 12,20 22,21 32,14 42,10 50,4"
                    fill="none"
                    stroke={PLUM.gold}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Circle cx={50} cy={4} r={3} fill={PLUM.gold} />
                </Svg>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.insTitle, fonts.displayBold]}>
                    Analytics &amp; Insights — your results, charted
                  </Text>
                  <Text style={styles.insSub}>
                    Check-ins, busiest nights, returning guests, demand ahead. Every
                    chart ends in a decision.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={PLUM.gold} />
              </LinearGradient>
            </Pressable>


            {/* Event Activity — upcoming events per bucket in THIS
                section's own window (activityData). The chips set ONLY
                activityRange: they never touch the global dashboard
                range or the Your Events window. Loading, error and
                sparse-data states are the section's originals. */}
            <Section title="Event Activity">
              <View style={styles.rangeChipRow}>
                {RANGES.map((r) => (
                  <Pressable
                    key={r.key}
                    style={[styles.rangeChip, activityRange === r.key && styles.rangeChipActive]}
                    onPress={() => setActivityRange(r.key)}
                  >
                    <Text style={[styles.rangeChipText, activityRange === r.key && styles.rangeChipTextActive]}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.sectionNote}>
                Upcoming events in this section&apos;s window.
              </Text>
              <View style={styles.legendRow}>
                <View style={styles.legend}>
                  <View style={[styles.activityDot, { backgroundColor: PLUM.chartLine }]} />
                  <Text style={styles.legendText}>Events</Text>
                </View>
              </View>
              {activityData === null ? (
                <ActivityIndicator color={PLUM.gold} style={{ marginVertical: 12 }} />
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
                    series={[{ color: PLUM.chartLine, points: activityPoints }]}
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

            {/* Your Events — the mockup's event cards: gradient thumb,
                real publish status chip, and the Publish-to-Bownd row
                whose toggle reflects the event's real status and opens
                the gated Publish flow (it never flips state locally).
                Events come from the section's own fetch (topData). */}
            <Section title="Your Events">
              <View style={styles.rangeChipRow}>
                {RANGES.map((r) => (
                  <Pressable
                    key={r.key}
                    style={[styles.rangeChip, topRange === r.key && styles.rangeChipActive]}
                    onPress={() => setTopRange(r.key)}
                  >
                    <Text style={[styles.rangeChipText, topRange === r.key && styles.rangeChipTextActive]}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.sectionNote}>
                Your events, soonest first — performance ranking needs ticket data.
              </Text>
              {topData === null ? (
                <ActivityIndicator color={PLUM.gold} style={{ marginVertical: 12 }} />
              ) : !!topData.error ? (
                <View>
                  <Text style={styles.errorText}>{topData.error}</Text>
                  <Pressable onPress={() => void refreshTop()}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : (topData?.events ?? []).length === 0 ? (
                <View>
                  <Text style={styles.empty}>No events yet.</Text>
                  <Text style={styles.sectionNote}>
                    Events outside this window are hidden — switch to All upcoming to see them.
                  </Text>
                </View>
              ) : (
                (topData?.events ?? []).map((e) => {
                  const ps = publishState(e);
                  const expanded = expandedId === e.id;
                  return (
                    <View key={e.id} style={styles.evCard}>
                      <Pressable
                        style={styles.evMain}
                        onPress={() => setExpandedId(expanded ? null : e.id)}
                      >
                        <LinearGradient
                          colors={[...PLUM.duoGradient]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.evThumb}
                        >
                          <Ionicons name="musical-notes" size={20} color="#fff" />
                        </LinearGradient>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.evTitle, fonts.displayBold]}>{e.title}</Text>
                          <Text style={styles.evMeta}>
                            {e.dateLabel}
                            {e.eventType ? ` · ${e.eventType}` : ""}
                          </Text>
                          <View style={styles.chipRow}>
                            {ps.live ? (
                              <View style={[styles.chip, styles.chipPub]}>
                                <Text style={[styles.chipText, { color: PLUM.green }]}>
                                  ● Published on Bownd
                                </Text>
                              </View>
                            ) : (
                              <View style={[styles.chip, styles.chipDraft]}>
                                <Text style={[styles.chipText, { color: PLUM.ink2 }]}>
                                  {e.status === "draft" || !e.status
                                    ? "Draft · Not published"
                                    : e.status}
                                </Text>
                              </View>
                            )}
                            {ps.spotlight && (
                              <View style={[styles.chip, styles.chipSpot]}>
                                <Text style={[styles.chipText, { color: PLUM.gold }]}>
                                  ★ Spotlight
                                </Text>
                              </View>
                            )}
                            {!!e.priceLabel && (
                              <Text style={styles.evPrice}>{e.priceLabel}</Text>
                            )}
                          </View>
                          {expanded && (
                            <View>
                              {!!e.eventType && (
                                <Text style={styles.detailText}>Type: {e.eventType}</Text>
                              )}
                              {!!e.priceLabel && (
                                <Text style={styles.detailText}>Tickets: {e.priceLabel}</Text>
                              )}
                              {!!e.status && (
                                <Text style={styles.detailText}>Status: {e.status}</Text>
                              )}
                              {!!e.description && (
                                <Text style={styles.detailText}>{e.description}</Text>
                              )}
                            </View>
                          )}
                        </View>
                        <Ionicons
                          name={expanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={PLUM.muted}
                        />
                      </Pressable>
                      {!demoOn && (
                        <View style={styles.pubRow}>
                          <Text style={styles.pubLabel}>Publish to Bownd</Text>
                          <PublishToggle
                            live={ps.live}
                            onPress={() => router.push("/publish")}
                          />
                          <Text
                            style={[styles.pubState, ps.live && { color: PLUM.green }]}
                          >
                            {ps.live ? "Live" : "Off"}
                          </Text>
                        </View>
                      )}
                      {demoOn ? (
                        <View style={styles.eventActions}>
                          <Text style={styles.sampleBadge}>Sample</Text>
                        </View>
                      ) : (
                        <View style={styles.eventActions}>
                          <Pressable
                            style={styles.actionBtn}
                            onPress={() => router.push(`/edit-event?id=${e.id}`)}
                          >
                            <Text style={styles.actionText}>Edit</Text>
                          </Pressable>
                          <Pressable
                            style={styles.deleteBtn}
                            onPress={() => void onDeleteEvent(e)}
                          >
                            <Text style={styles.deleteText}>Delete</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </Section>

            {/* Event Calendar — real events (CalendarDay: day label +
                date number; rows carry time + title only). No "View
                Calendar" button: there is no separate calendar screen.
                Rows keep the same Edit / Delete as the event list;
                demo rows get a Sample badge instead. */}
            <Section title="Event Calendar">
              {(data?.calendar ?? []).length === 0 ? (
                <Text style={styles.empty}>No events scheduled in this window.</Text>
              ) : (
                (data?.calendar ?? []).map((d) => (
                  <View key={`${d.day}-${d.date}`} style={styles.calRow}>
                    <View style={styles.calDay}>
                      <Text style={styles.calDayLabel}>{d.day}</Text>
                      <Text style={styles.calDateNum}>{d.date}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      {d.events.map((e) => (
                        <View key={e.id} style={styles.calEventWrap}>
                          <View style={styles.calEvent}>
                            <Text style={styles.calTime}>{e.time}</Text>
                            <Text style={styles.calTitle}>{e.title}</Text>
                          </View>
                          {demoOn ? (
                            <View style={styles.calActions}>
                              <Text style={styles.sampleBadge}>Sample</Text>
                            </View>
                          ) : (
                            <View style={styles.calActions}>
                              <Pressable onPress={() => router.push(`/edit-event?id=${e.id}`)}>
                                <Text style={styles.calActionText}>Edit</Text>
                              </Pressable>
                              <Pressable onPress={() => void onDeleteEvent(e)}>
                                <Text style={[styles.calActionText, styles.calDeleteText]}>
                                  Delete
                                </Text>
                              </Pressable>
                            </View>
                          )}
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
                <Text style={[styles.cardTitle, fonts.display]}>Add New Event</Text>
                <Pressable onPress={() => router.push("/add-event")}>
                  <Ionicons name="add-circle" size={26} color={PLUM.gold} />
                </Pressable>
              </View>
              <Text style={styles.addEventField}>Event Title</Text>
              <Text style={styles.addEventField}>Date &amp; Time</Text>
              <Text style={styles.addEventField}>Event Type</Text>
              <Text style={styles.addEventField}>Ticket Type &amp; Price</Text>
              <Pressable onPress={() => router.push("/add-event")}>
                <LinearGradient
                  colors={[...PLUM.gradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.addCreateBtn}
                >
                  <Text style={[styles.createBtnText, fonts.display]}>Create Event</Text>
                </LinearGradient>
              </Pressable>
              <Text style={styles.addEventNote}>Opens the full event form.</Text>
            </View>

            {/* Get more exposure — featured placement has no billing
                yet, so Boost is disabled with the reason, never sold. */}
            <View style={[styles.card, styles.boostCard]}>
              <Text style={[styles.boostTitle, fonts.display]}>Get more exposure</Text>
              <Text style={styles.boostText}>Boost your events and reach more fans.</Text>
              <Pressable
                style={[styles.boostBtn, styles.boostBtnDisabled]}
                disabled
                accessibilityState={{ disabled: true }}
              >
                <Text style={styles.boostBtnText}>Boost Event</Text>
              </Pressable>
              <Text style={styles.boostReason}>
                Featured placement is coming soon — no billing yet, so boosting isn&apos;t
                available.
              </Text>
            </View>

            {/* Projections — no ticketing data exists, so no numbers are shown */}
            <Section title="Projections">
              <Text style={styles.empty}>
                Projections need historical ticket data — not available yet.
              </Text>
            </Section>

            {/* Audience Insights — no attendee data exists, so this is
                an honest empty state with no range to select. */}
            <Section title="Audience Insights">
              <Text style={styles.empty}>
                Audience insights need attendee data — not available yet.
              </Text>
            </Section>

            {/* Smart Suggestions — no backing data exists, so no
                suggestions are invented. */}
            <Section title="Smart Suggestions">
              <Text style={styles.empty}>
                Smart suggestions need your event history and audience data — not
                available yet.
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PLUM.bg },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 10 },
  centerTitle: { color: PLUM.ink, fontSize: 20, fontWeight: "800" },
  centerSub: { color: PLUM.muted, fontSize: 14, lineHeight: 20 },
  centerBtn: {
    marginTop: 10,
    backgroundColor: "#5B34E0",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  centerBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Header (mockup wordmark row)
  lwTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  wordmarkRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  liveDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: PLUM.green },
  wordmark: { color: PLUM.ink, fontSize: 26, fontWeight: "800", letterSpacing: -0.8 },
  forVenuesPill: {
    backgroundColor: "rgba(47,107,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(47,107,255,0.35)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  forVenuesText: { color: PLUM.link, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  lwSub: { color: PLUM.muted, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: PLUM.surface2,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  // Venue card
  venueCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: PLUM.surface,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    borderRadius: 16,
    padding: 13,
  },
  venueAvatar: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  venueInitials: { color: "#fff", fontWeight: "800", fontSize: 14 },
  venueNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  venueName: { color: PLUM.ink, fontWeight: "800", fontSize: 14.5, flexShrink: 1 },
  // Mockup .lw-verified: a SOLID green pill with dark text.
  verifiedBadge: {
    backgroundColor: PLUM.green,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  verifiedText: { color: "#07130D", fontSize: 10, fontWeight: "800" },
  venueSub: { color: PLUM.muted, fontSize: 11.5, fontWeight: "600", marginTop: 3 },

  // Stat tiles
  statRow: { flexDirection: "row", gap: 9 },
  statTile: {
    backgroundColor: PLUM.surface,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    borderRadius: 14,
    padding: 11,
  },
  statLabel: {
    color: PLUM.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  statValue: { color: PLUM.ink, fontSize: 19, fontWeight: "800", marginTop: 6 },
  statSmall: { color: PLUM.muted, fontSize: 10.5, fontWeight: "700", marginTop: 4 },
  revenueNote: { color: PLUM.muted, fontSize: 11, marginTop: -6 },
  notTrackedNote: { color: PLUM.faint, fontSize: 11, marginTop: -6 },

  // Analytics banner
  insBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(232,196,118,0.42)",
    borderRadius: 16,
    padding: 13,
  },
  insTitle: { color: PLUM.ink, fontWeight: "800", fontSize: 14.5 },
  insSub: { color: PLUM.ink2, fontSize: 11.5, lineHeight: 16, marginTop: 3 },

  // Create button — mockup .lw-create: radius 15, violet glow shadow.
  createBtn: {
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: "#5B34E0",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  createBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  createNote: { color: PLUM.muted, fontSize: 11.5, textAlign: "center", marginTop: 8 },

  // Utility rows + picker
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rangeBtn: {
    backgroundColor: PLUM.surface2,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rangeText: { color: PLUM.ink, fontWeight: "700", fontSize: 13 },
  venuesBtn: {
    backgroundColor: PLUM.surface2,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  venuesText: { color: PLUM.ink, fontWeight: "700", fontSize: 13 },
  linkBtn: {
    backgroundColor: PLUM.surface2,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  linkText: { color: PLUM.link, fontWeight: "700", fontSize: 12 },
  picker: {
    backgroundColor: PLUM.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    overflow: "hidden",
  },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PLUM.lineSoft,
  },
  pickerText: { color: PLUM.ink2, fontSize: 14 },
  pickerTextActive: { color: PLUM.ink, fontWeight: "700" },
  pickerCheck: { color: PLUM.gold, fontWeight: "800" },

  // Cards / sections
  card: {
    backgroundColor: PLUM.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardTitle: { color: PLUM.ink, fontSize: 17, fontWeight: "800" },
  cardAction: { color: PLUM.link, fontSize: 12.5, fontWeight: "700" },
  sectionNote: { color: PLUM.muted, fontSize: 12, marginBottom: 8 },
  empty: { color: PLUM.muted, fontSize: 13, lineHeight: 19 },

  errorCard: { borderColor: "rgba(244,114,182,0.4)" },
  errorText: { color: "#F9A8D4", fontSize: 13, lineHeight: 18 },
  retryText: { color: PLUM.gold, fontWeight: "800", marginTop: 8 },

  setupCard: { borderColor: PLUM.goldBorder },
  setupTitle: { color: PLUM.ink, fontSize: 17, fontWeight: "800" },
  setupText: { color: PLUM.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  setupBtn: {
    marginTop: 12,
    backgroundColor: "#5B34E0",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  setupBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // Range chips (per-section)
  rangeChipRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  rangeChip: {
    borderWidth: 1,
    borderColor: PLUM.line2,
    backgroundColor: PLUM.surface2,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  // Mockup .lw-term.on: violet ring on surface3.
  rangeChipActive: { borderColor: "#6D28D9", backgroundColor: PLUM.surface3 },
  rangeChipText: { color: PLUM.muted, fontSize: 11, fontWeight: "700" },
  rangeChipTextActive: { color: PLUM.ink },

  legendRow: { flexDirection: "row", gap: 16, marginBottom: 10 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { color: PLUM.muted, fontSize: 11, fontWeight: "700" },
  dayRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  dayLabel: { color: PLUM.faint, fontSize: 11, fontWeight: "700" },

  // Your Events cards
  evCard: {
    backgroundColor: PLUM.surface,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    borderRadius: 16,
    padding: 11,
    marginBottom: 10,
  },
  evMain: { flexDirection: "row", gap: 11, alignItems: "flex-start" },
  evThumb: {
    width: 58,
    height: 58,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  evTitle: { color: PLUM.ink, fontWeight: "700", fontSize: 14 },
  evMeta: { color: PLUM.muted, fontSize: 11.5, marginTop: 2 },
  evPrice: { color: PLUM.ink2, fontSize: 11.5, fontWeight: "700" },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 7 },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  chipPub: { backgroundColor: "rgba(61,220,151,0.10)", borderColor: "rgba(61,220,151,0.30)" },
  chipDraft: { backgroundColor: PLUM.surface3, borderColor: PLUM.line2 },
  chipSpot: { backgroundColor: PLUM.goldSoft, borderColor: PLUM.goldBorder },
  chipText: { fontSize: 10, fontWeight: "800" },
  detailText: { color: PLUM.ink2, fontSize: 12.5, lineHeight: 18, marginTop: 6 },

  pubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: PLUM.lineSoft,
    marginTop: 10,
    paddingTop: 10,
  },
  pubLabel: { color: PLUM.ink2, fontSize: 11.5, fontWeight: "800", flex: 1 },
  pubState: { color: PLUM.muted, fontSize: 11.5, fontWeight: "700" },
  toggle: { width: 38, height: 22, borderRadius: 999, justifyContent: "center" },
  toggleOn: { backgroundColor: PLUM.green },
  toggleOff: { backgroundColor: PLUM.surface3 },
  toggleKnob: { width: 16, height: 16, borderRadius: 999, backgroundColor: "#fff", position: "absolute" },
  toggleKnobOn: { right: 3 },
  toggleKnobOff: { left: 3 },

  eventActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: {
    backgroundColor: PLUM.surface3,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionText: { color: PLUM.ink, fontSize: 12.5, fontWeight: "700" },
  deleteBtn: {
    backgroundColor: "rgba(244,114,182,0.12)",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  deleteText: { color: "#F9A8D4", fontSize: 12.5, fontWeight: "700" },
  sampleBadge: { color: PLUM.gold, fontSize: 12, fontWeight: "900" },

  // Calendar (real CalendarDay shape: day label + date number block)
  calRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: PLUM.lineSoft,
  },
  calDay: { width: 40, alignItems: "center" },
  calDayLabel: { color: PLUM.muted, fontSize: 11, fontWeight: "800" },
  calDateNum: { color: PLUM.ink, fontSize: 16, fontWeight: "900" },
  calEventWrap: { gap: 2 },
  calEvent: { flexDirection: "row", gap: 8, alignItems: "center" },
  calTime: { color: PLUM.gold, fontSize: 12, fontWeight: "800", width: 64 },
  calTitle: { color: PLUM.ink, fontSize: 13, fontWeight: "700" },
  calActions: { flexDirection: "row", gap: 12, paddingLeft: 72 },
  calActionText: { color: PLUM.link, fontSize: 12, fontWeight: "800" },
  calDeleteText: { color: "#F9A8D4" },

  // Add New Event entry panel
  addEventCard: {
    backgroundColor: PLUM.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PLUM.lineSoft,
    padding: 14,
    gap: 10,
  },
  addEventHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addEventField: { color: PLUM.muted, fontSize: 13 },
  addCreateBtn: { borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  addEventNote: { color: PLUM.faint, fontSize: 11 },

  // Boost (disabled, honest)
  boostCard: { borderColor: PLUM.goldBorder },
  boostTitle: { color: PLUM.ink, fontSize: 17, fontWeight: "800" },
  boostText: { color: PLUM.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  boostBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  boostBtnDisabled: { backgroundColor: PLUM.surface3, opacity: 0.6 },
  boostBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  boostReason: { color: PLUM.muted, fontSize: 12, lineHeight: 16, marginTop: 8 },

  // Recent activity
  activityRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  activityDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: PLUM.gold,
    marginTop: 6,
  },
  activityText: { color: PLUM.ink2, fontSize: 13, lineHeight: 18, flex: 1 },

  // Demo mode
  demoToggleBtn: {
    borderWidth: 1,
    borderColor: PLUM.goldBorder,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  demoToggleBtnActive: { backgroundColor: PLUM.goldSoft },
  demoToggleText: { color: PLUM.gold, fontWeight: "800", fontSize: 13 },
  demoBanner: {
    backgroundColor: PLUM.goldSoft,
    borderWidth: 1,
    borderColor: PLUM.goldBorder,
    borderRadius: 14,
    padding: 12,
  },
  demoBannerTitle: { color: PLUM.gold, fontWeight: "800", fontSize: 13 },
  demoBannerText: { color: PLUM.ink2, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
