// Livework — Analytics & Insights (venue CRM spec §6/§6.1/§6.2, Phase 1).
//
// Every number on this screen is computed from data Livework already
// loads: the venue's own events (fetchDashboard), its venue_redemptions
// rows (same tenant-scoped query as the Redemptions screen), and the
// dashboard's verified revenue figure (always $0 until real payments
// exist — see lib/data.ts; never a sum of tracking rows).
//
// Metrics that need data Bownd does not collect yet (ticket money
// before Stripe, perk claims, scanner demand aggregates, venue-set
// goals) render as labeled empty states with NO numbers — never
// samples, never estimates. Demo mode is dashboard-scoped and never
// feeds this screen: it shows real data or honest empties only.
//
// Listing views, saves and the visibility funnel ARE measured now:
// Bownd emits first-party signals into `app_events` (bownd/lib/
// analytics.ts), a nightly rollup aggregates them per venue into
// `analytics_daily`, and this screen reads both — tenant-scoped, as
// the signed-in user — so the numbers below are the venue's own.
// Until a venue's first rolled-up day exists, those rows stay in the
// honest-empty card instead of showing zeros as if they were data.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { getUserTenantIds, getUserVenues } from "../lib/tenant";
import {
  fetchDashboard,
  formatMoney,
  RANGES,
  type DashboardData,
  type RangeKey,
} from "../lib/data";
import MultiLine from "../components/MultiLine";

// Premium accent (brochure gold) — local because lib/theme.ts is
// shared and off-limits for this pass.
const GOLD = "#E8C476";
const GOLD_DIM = "rgba(232,196,118,0.16)";
const BAR_TRACK = "rgba(255,255,255,0.08)";

type RedemptionLite = {
  id: string;
  eventId: string | null;
  atMillis: number | null;
};

// First-party Bownd curiosity, last 30 days: totals from the nightly
// analytics_daily rollup; per-event views/saves from the raw
// app_events stream (the rollup is per-venue, not per-event).
type CuriosityData = {
  views: number;
  venueViews: number;
  saves: number;
  checkouts: number;
  perEvent: { eventId: string; views: number; saves: number }[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function statusBucket(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("spotlight")) return "Spotlight";
  if (s.includes("publish")) return "Published";
  if (s.includes("draft")) return "Draft";
  const raw = (status ?? "").trim();
  return raw.length > 0 ? raw : "Unspecified";
}

const STATUS_ORDER = ["Published", "Spotlight", "Draft"];
const STATUS_COLORS: Record<string, string> = {
  Published: GOLD,
  Spotlight: THEME.purple,
  Draft: THEME.blue,
};

function BarRow({
  label,
  value,
  max,
  color,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  detail?: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.barValue}>
          {value}
          {detail ? `  ·  ${detail}` : ""}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<DashboardData | null>(null);
  const [range, setRange] = useState<RangeKey>("30d");
  const [redemptions, setRedemptions] = useState<RedemptionLite[] | null>(null);
  const [curiosity, setCuriosity] = useState<CuriosityData | null>(null);
  const [eventTitles, setEventTitles] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      const [all, tenantIds] = await Promise.all([fetchDashboard("all"), getUserTenantIds()]);
      if (all.error) throw new Error(all.error);
      setDash(all);
      if (tenantIds.length === 0) {
        setRedemptions([]);
        setEventTitles(new Map());
        setCuriosity(null);
        return;
      }
      const [eventsRes, redemptionsRes] = await Promise.all([
        supabase.from("events").select("id, title").in("tenant_id", tenantIds),
        supabase
          .from("venue_redemptions")
          .select("id, event_id, metadata, created_at")
          .in("tenant_id", tenantIds)
          .order("created_at", { ascending: false }),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (redemptionsRes.error) throw redemptionsRes.error;
      const map = new Map<string, string>();
      for (const row of (eventsRes.data ?? []) as Record<string, unknown>[]) {
        if (typeof row.id === "string" && typeof row.title === "string") {
          map.set(row.id, row.title);
        }
      }
      setEventTitles(map);
      setRedemptions(
        ((redemptionsRes.data ?? []) as Record<string, unknown>[]).map((row) => {
          const meta = asRecord(row.metadata);
          const redeemedAt = meta ? meta.redeemed_at : null;
          const created = asString(row.created_at);
          return {
            id: String(row.id ?? ""),
            eventId: asString(row.event_id),
            atMillis:
              typeof redeemedAt === "number" && Number.isFinite(redeemedAt)
                ? redeemedAt
                : created
                  ? Date.parse(created) || null
                  : null,
          };
        }),
      );
      // Curiosity (views/saves/funnel): the venue's own Bownd signals,
      // last 30 days. Totals come from the nightly analytics_daily
      // rollup; per-event views/saves come from raw app_events (the
      // rollup is per-venue). RLS scopes both to this user's venues;
      // the venue filter here is the same scoping, stated explicitly.
      const venues = await getUserVenues();
      const venueIds = venues.map((v) => v.id);
      if (venueIds.length === 0) {
        setCuriosity(null);
      } else {
        const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const [dailyRes, rawRes] = await Promise.all([
          supabase
            .from("analytics_daily")
            .select("metric_key, metric_value")
            .in("venue_id", venueIds)
            .gte("date", new Date(sinceMs).toISOString().slice(0, 10)),
          supabase
            .from("app_events")
            .select("event_name, event_id")
            .in("venue_id", venueIds)
            .in("event_name", ["event_view", "event_save"])
            .gte("ts", new Date(sinceMs).toISOString())
            .limit(10000),
        ]);
        if (dailyRes.error) throw dailyRes.error;
        if (rawRes.error) throw rawRes.error;
        const totals: CuriosityData = {
          views: 0,
          venueViews: 0,
          saves: 0,
          checkouts: 0,
          perEvent: [],
        };
        for (const row of (dailyRes.data ?? []) as Record<string, unknown>[]) {
          const value =
            typeof row.metric_value === "number" && Number.isFinite(row.metric_value)
              ? row.metric_value
              : 0;
          if (row.metric_key === "event_view") totals.views += value;
          else if (row.metric_key === "venue_view") totals.venueViews += value;
          else if (row.metric_key === "event_save") totals.saves += value;
          else if (row.metric_key === "checkout_started") totals.checkouts += value;
        }
        const perEventMap = new Map<string, { eventId: string; views: number; saves: number }>();
        for (const row of (rawRes.data ?? []) as Record<string, unknown>[]) {
          const eventId = asString(row.event_id);
          if (!eventId) continue;
          const entry =
            perEventMap.get(eventId) ?? { eventId, views: 0, saves: 0 };
          if (row.event_name === "event_view") entry.views += 1;
          else if (row.event_name === "event_save") entry.saves += 1;
          perEventMap.set(eventId, entry);
        }
        totals.perEvent = [...perEventMap.values()];
        setCuriosity(totals);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load your analytics.");
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  useFocusEffect(
    useCallback(() => {
      if (session) void load();
    }, [session, load]),
  );

  // Events-over-time follows its own range, like the dashboard's
  // per-section ranges.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchDashboard(range)
      .then((d) => {
        if (alive && !d.error) setActivity(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session, range]);

  // --- Derived charts (real data only) -------------------------------------

  const statusBars = useMemo(() => {
    if (!dash) return { rows: [] as { label: string; value: number }[], total: 0, drafts: 0 };
    const counts = new Map<string, number>();
    for (const e of dash.events) {
      const b = statusBucket(e.status);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    const labels = [
      ...STATUS_ORDER.filter((l) => counts.has(l)),
      ...[...counts.keys()].filter((l) => !STATUS_ORDER.includes(l)).sort(),
    ];
    return {
      rows: labels.map((label) => ({ label, value: counts.get(label) ?? 0 })),
      total: dash.events.length,
      drafts: counts.get("Draft") ?? 0,
    };
  }, [dash]);

  const weeklyTrend = useMemo(() => {
    if (!redemptions || redemptions.length === 0) return [];
    const now = Date.now();
    const buckets: { label: string; value: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = now - (w + 1) * 7 * 24 * 60 * 60 * 1000;
      const end = now - w * 7 * 24 * 60 * 60 * 1000;
      const label = new Date(start).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      buckets.push({
        label: `Week of ${label}`,
        value: redemptions.filter(
          (r) => r.atMillis !== null && r.atMillis >= start && r.atMillis < end,
        ).length,
      });
    }
    return buckets;
  }, [redemptions]);

  const perEvent = useMemo(() => {
    if (!redemptions) return { rows: [] as { label: string; value: number }[], unlinked: 0 };
    const counts = new Map<string, number>();
    let unlinked = 0;
    for (const r of redemptions) {
      if (r.eventId) counts.set(r.eventId, (counts.get(r.eventId) ?? 0) + 1);
      else unlinked += 1;
    }
    const rows = [...counts.entries()]
      .map(([id, value]) => ({ label: eventTitles.get(id) ?? "Event not in current list", value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    return { rows, unlinked };
  }, [redemptions, eventTitles]);

  const presence = useMemo(() => {
    if (!dash) return [];
    return dash.events.slice(0, 8).map((e) => {
      const bucket = statusBucket(e.status);
      const where =
        bucket === "Draft"
          ? "Not published — only you can see it"
          : bucket === "Spotlight"
            ? "Live in Bownd — Events list · Spotlight · your venue page"
            : bucket === "Published"
              ? "Live in Bownd — Events list · your venue page"
              : `${bucket} — visibility follows this status`;
      return { id: e.id, title: e.title, dateLabel: e.dateLabel, where };
    });
  }, [dash]);

  // Curiosity paired with door results: events members saved but
  // haven't redeemed yet. Real rows on both sides only — an event
  // needs at least 3 saves before it reads as a signal, not noise.
  const savedNotRedeemed = useMemo(() => {
    if (!curiosity) return [];
    const redeemedByEvent = new Map<string, number>();
    for (const r of redemptions ?? []) {
      if (r.eventId) {
        redeemedByEvent.set(r.eventId, (redeemedByEvent.get(r.eventId) ?? 0) + 1);
      }
    }
    return curiosity.perEvent
      .filter((p) => p.saves >= 3 && (redeemedByEvent.get(p.eventId) ?? 0) === 0)
      .sort((a, b) => b.saves - a.saves)
      .slice(0, 3)
      .map((p) => ({
        eventId: p.eventId,
        title: eventTitles.get(p.eventId) ?? "Event not in current list",
        saves: p.saves,
        views: p.views,
      }));
  }, [curiosity, redemptions, eventTitles]);

  // --- States ---------------------------------------------------------------

  if (authLoading || (session && dash === null && !error)) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Sign in to see your analytics</Text>
          <Text style={styles.centerSub}>
            Analytics belong to your account. Sign in to continue.
          </Text>
          <Pressable style={styles.centerBtn} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.centerBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !dash) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Could not load your analytics</Text>
          <Text style={styles.centerSub}>{error ?? "Something went wrong."}</Text>
          <Pressable style={styles.centerBtn} onPress={() => void load()}>
            <Text style={styles.centerBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (dash.needsSetup) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Set up your venue first</Text>
          <Text style={styles.centerSub}>
            Analytics chart your venue's events and redemptions. Set up your venue and the
            charts start with your real data — nothing estimated.
          </Text>
          <Pressable style={styles.centerBtn} onPress={() => router.push("/setup-venue")}>
            <Text style={styles.centerBtnText}>Set up your venue</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const activityPoints = activity?.activityPoints ?? [];
  const activityTotal = activityPoints.reduce((a, b) => a + b, 0);
  const redemptionTotal = redemptions?.length ?? 0;
  const hasCuriosity = Boolean(
    curiosity &&
      curiosity.views + curiosity.venueViews + curiosity.saves + curiosity.checkouts > 0,
  );
  const funnelMax = curiosity
    ? Math.max(curiosity.views, curiosity.venueViews, curiosity.saves, curiosity.checkouts, 1)
    : 1;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Analytics & Insights</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.intro}>
          Your results, charted. Every number here comes from your own events and
          redemptions in Livework — anything Bownd doesn't measure yet says so instead of
          guessing.
        </Text>

        {/* Verified revenue — computed exactly as the dashboard computes
            it ($0.00 until real payments exist). */}
        <View style={styles.card}>
          <SectionTitle>Verified revenue</SectionTitle>
          <Text style={styles.bigMoney}>{formatMoney(dash.verifiedRevenue)}</Text>
          {!!dash.revenueScopeNote && <Text style={styles.note}>{dash.revenueScopeNote}</Text>}
          <Text style={styles.note}>
            Ticket money appears here once payments launch — Livework has no ticketing
            until then, so there is nothing to estimate.
          </Text>
        </View>

        {/* Events by status */}
        <View style={styles.card}>
          <SectionTitle>Your events by status</SectionTitle>
          {statusBars.total === 0 ? (
            <>
              <Text style={styles.emptyText}>No events yet.</Text>
              <Text style={styles.note}>
                Create your first event and it shows up here — and in Bownd once published.
              </Text>
              <Pressable style={styles.actionBtn} onPress={() => router.push("/add-event")}>
                <Text style={styles.actionBtnText}>Create Event</Text>
              </Pressable>
            </>
          ) : (
            <>
              {statusBars.rows.map((r) => (
                <BarRow
                  key={r.label}
                  label={r.label}
                  value={r.value}
                  max={statusBars.total}
                  color={STATUS_COLORS[r.label] ?? THEME.green}
                  detail={`${Math.round((r.value / statusBars.total) * 100)}% of ${statusBars.total}`}
                />
              ))}
              {statusBars.drafts > 0 ? (
                <>
                  <Text style={styles.takeaway}>
                    {statusBars.drafts} draft{statusBars.drafts === 1 ? " isn't" : "s aren't"}{" "}
                    visible in Bownd yet — publishing puts them in front of customers.
                  </Text>
                  <Pressable style={styles.actionBtn} onPress={() => router.push("/publish")}>
                    <Text style={styles.actionBtnText}>Review publishing</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.takeaway}>Everything you've created is live in Bownd.</Text>
              )}
            </>
          )}
        </View>

        {/* Events over time */}
        <View style={styles.card}>
          <SectionTitle>Events over time</SectionTitle>
          <View style={styles.chips}>
            {RANGES.map((r) => (
              <Pressable
                key={r.key}
                style={[styles.chip, range === r.key && styles.chipActive]}
                onPress={() => setRange(r.key)}
              >
                <Text style={[styles.chipText, range === r.key && styles.chipTextActive]}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {activityTotal === 0 ? (
            <>
              <Text style={styles.emptyText}>No events scheduled in this range.</Text>
              <Text style={styles.note}>
                Add an event to fill the calendar — published events are what customers see
                in Bownd.
              </Text>
              <Pressable style={styles.actionBtn} onPress={() => router.push("/add-event")}>
                <Text style={styles.actionBtnText}>Create Event</Text>
              </Pressable>
            </>
          ) : (
            <>
              <MultiLine
                series={[{ color: GOLD, points: activityPoints }]}
                width={320}
                height={110}
              />
              <Text style={styles.note}>
                {activityTotal} event{activityTotal === 1 ? "" : "s"} ·{" "}
                {activity?.rangeLabel ?? ""}
                {activity?.activityDays?.length
                  ? ` · ${activity.activityDays[0]} – ${activity.activityDays[activity.activityDays.length - 1]}`
                  : ""}
              </Text>
            </>
          )}
        </View>

        {/* Redemptions */}
        <View style={styles.card}>
          <SectionTitle>Redemptions</SectionTitle>
          {redemptionTotal === 0 ? (
            <>
              <Text style={styles.emptyText}>No redemptions yet.</Text>
              <Text style={styles.note}>
                Redemptions appear here once Bownd sync is live. Bownd customers redeem
                offers in the Bownd app; those redemptions flow back to your venues.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.bigMoney}>{redemptionTotal}</Text>
              <Text style={styles.note}>Total redemptions recorded for your venues.</Text>
              <Text style={styles.subTitle}>Last 8 weeks</Text>
              {weeklyTrend.map((b) => (
                <BarRow
                  key={b.label}
                  label={b.label}
                  value={b.value}
                  max={Math.max(...weeklyTrend.map((x) => x.value), 1)}
                  color={GOLD}
                />
              ))}
              {perEvent.rows.length > 0 && (
                <>
                  <Text style={styles.subTitle}>By event</Text>
                  {perEvent.rows.map((r) => (
                    <BarRow
                      key={r.label}
                      label={r.label}
                      value={r.value}
                      max={Math.max(...perEvent.rows.map((x) => x.value), 1)}
                      color={THEME.purple}
                    />
                  ))}
                </>
              )}
              {perEvent.unlinked > 0 && (
                <Text style={styles.note}>
                  {perEvent.unlinked} redemption{perEvent.unlinked === 1 ? " isn't" : "s aren't"}{" "}
                  linked to a specific event yet — they count in your total above, and link
                  up as the Bownd sync mapping catches up.
                </Text>
              )}
              <Pressable style={styles.actionBtn} onPress={() => router.push("/redemptions")}>
                <Text style={styles.actionBtnText}>See all redemptions</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Presence — what customers see (spec §6.1, Phase 1) */}
        <View style={styles.card}>
          <SectionTitle>Where your listings show</SectionTitle>
          {presence.length === 0 ? (
            <Text style={styles.note}>
              Nothing to show yet — your published events will list their Bownd placement
              here.
            </Text>
          ) : (
            <>
              {presence.map((p) => (
                <View key={p.id} style={styles.presenceRow}>
                  <Text style={styles.presenceTitle} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={styles.presenceMeta}>
                    {p.dateLabel} · {p.where}
                  </Text>
                </View>
              ))}
              {dash.events.length > presence.length && (
                <Text style={styles.note}>
                  Showing {presence.length} of {dash.events.length} events.
                </Text>
              )}
            </>
          )}
        </View>

        {/* Views, saves & funnel — Bownd's first-party signals for this
            venue (app_events, rolled up nightly into analytics_daily).
            Renders only when real rows exist; before that, these rows
            live in the honest-empty card below. */}
        {hasCuriosity && curiosity && (
          <View style={styles.card}>
            <SectionTitle>Views, saves & funnel</SectionTitle>
            <BarRow label="Event page views" value={curiosity.views} max={funnelMax} color={GOLD} />
            <BarRow
              label="Venue page views"
              value={curiosity.venueViews}
              max={funnelMax}
              color={THEME.purple}
            />
            <BarRow label="Saves" value={curiosity.saves} max={funnelMax} color={THEME.blue} />
            <BarRow
              label="Checkout starts"
              value={curiosity.checkouts}
              max={funnelMax}
              color={THEME.green}
            />
            {curiosity.views > 0 && (
              <Text style={styles.takeaway}>
                {Math.round((curiosity.saves / curiosity.views) * 100)}% of event views became
                saves
                {curiosity.saves > 0
                  ? ` · ${Math.round((curiosity.checkouts / curiosity.saves) * 100)}% of saves reached checkout`
                  : ""}
                .
              </Text>
            )}
            {savedNotRedeemed.length > 0 && (
              <>
                <Text style={styles.subTitle}>Saved, but not through the door yet</Text>
                {savedNotRedeemed.map((p) => (
                  <View key={p.eventId} style={styles.presenceRow}>
                    <Text style={styles.presenceTitle} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Text style={styles.presenceMeta}>
                      {p.saves} saves · {p.views} views · no redemptions recorded yet
                    </Text>
                  </View>
                ))}
                <Text style={styles.takeaway}>
                  The interest is real — it just hasn't converted. A reminder to the members
                  who saved these, or a featured slot while interest is warm, is how venues
                  usually close this gap.
                </Text>
              </>
            )}
            <Text style={styles.note}>
              Measured in the Bownd app over the last 30 days; totals roll up nightly.
            </Text>
          </View>
        )}

        {/* Honest empty states — measured later, never estimated */}
        <View style={styles.card}>
          <SectionTitle>Not measured yet — on purpose</SectionTitle>
          {[
            ...(hasCuriosity
              ? []
              : [
                  {
                    name: "Listing views & saves",
                    why: "Bownd now records listing views and saves in the app. Your numbers appear here once the updated Bownd app is live and a nightly rollup has run — until then this stays empty rather than estimated.",
                  },
                  {
                    name: "Visibility funnel",
                    why: "Views → saves → checkout starts lights up with that same tracking. No step of the funnel is estimated.",
                  },
                ]),
            {
              name: "Ticket sales",
              why: "Ticket money appears here once payments launch — there is no ticketing to chart before then.",
            },
            {
              name: "Perk performance",
              why: "Member perk claims chart here once claims are recorded at the door.",
            },
            {
              name: "Demand calendar",
              why: "Scanner-validated demand by date joins your calendar once scanner aggregates are connected here.",
            },
            {
              name: "Goal tracker",
              why: "Monthly targets you set yourself — events and redemptions first, revenue once payments launch.",
            },
          ].map((row) => (
            <View key={row.name} style={styles.presenceRow}>
              <Text style={styles.presenceTitle}>{row.name}</Text>
              <Text style={styles.presenceMeta}>{row.why}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: THEME.text, fontSize: 20, fontWeight: "800" },
  intro: { color: THEME.textMuted, fontSize: 13, lineHeight: 19 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  centerTitle: { color: THEME.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  centerSub: { color: THEME.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  centerBtn: {
    marginTop: 8,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 22,
  },
  centerBtnText: { color: "#171129", fontSize: 14, fontWeight: "800" },
  card: {
    backgroundColor: THEME.card,
    borderColor: THEME.cardBorder,
    borderWidth: 1,
    borderRadius: THEME.radius,
    padding: 16,
  },
  sectionTitle: { color: THEME.text, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  subTitle: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  bigMoney: { color: GOLD, fontSize: 30, fontWeight: "800", marginBottom: 6 },
  note: { color: THEME.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  emptyText: { color: THEME.text, fontSize: 14, fontWeight: "700" },
  takeaway: { color: THEME.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  barRow: { marginBottom: 10 },
  barHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 5,
    gap: 10,
  },
  barLabel: { color: THEME.text, fontSize: 13, fontWeight: "600", flex: 1 },
  barValue: { color: THEME.textMuted, fontSize: 12, fontWeight: "700" },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: BAR_TRACK,
    overflow: "hidden",
  },
  barFill: { height: 8, borderRadius: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "transparent",
  },
  chipActive: { backgroundColor: GOLD_DIM, borderColor: GOLD },
  chipText: { color: THEME.textMuted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: GOLD },
  actionBtn: {
    alignSelf: "flex-start",
    marginTop: 12,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  actionBtnText: { color: "#171129", fontSize: 13, fontWeight: "800" },
  presenceRow: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: THEME.cardBorder,
  },
  presenceTitle: { color: THEME.text, fontSize: 13.5, fontWeight: "700" },
  presenceMeta: { color: THEME.textMuted, fontSize: 12, marginTop: 3, lineHeight: 16 },
});
