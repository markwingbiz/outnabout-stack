// app/(tabs)/home.tsx
// Reference visuals (App.tsx) + real backend wiring (lib/store.ts).
// - Events + venues come from Firestore. When the Firestore catalog is
//   EMPTY (no events AND no venues), the authorized showcase fallback
//   (data/showcase.ts) is used wholesale — never mixed with real data —
//   with an honest "Showcase preview" chip. Demo listings are never
//   presented as live inventory.
// - Search filters the catalog in place (title, venue, vibe/audience
//   tags). "See all results in Events" navigates with the query prefilled.
// - Spotlight cards + Featured sections navigate to the real detail
//   screen. Venue tiles / venue row navigate to Events filtered to a venue.
// - Premium pass (2026-11-11): scene-photo cards (photo above caption),
//   icon-tile venues, Featured Playlists rail, campaign banner — see
//   app/ui/premium.tsx + data/campaigns.ts. Data flow unchanged.
// - Featured renders TWICE, exactly as the reference does: first instance
//   followed by the horizontal venue row, second instance bare.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchEvents, fetchVenues, type EventItem, type Venue } from "../../lib/store";
import { useAuth } from "../../lib/auth";
import {
  PLAYLISTS,
  getShowcaseEvents,
  getShowcaseVenues,
  resolvePlaylists,
  type Playlist,
  type ResolvedPlaylist,
  type ResolvedPlaylistItem,
} from "../../data/showcase";
import { categoryForText } from "../../lib/placeholders";
import { catalogFingerprint, fillRail } from "../../lib/randomFill";
import { getActiveCampaign } from "../../data/campaigns";
import {
  CampaignBanner,
  PlaylistRailCard,
  PointsPill,
  SceneEventCard,
  VenueTile,
  usePremiumFonts,
  venueMetaFor,
} from "../ui/premium";
import {
  BottomNav,
  HeaderAvatar,
  Search,
  Section,
  TAB_ROUTES,
  formatWhen,
  getVenueName,
  refStyles,
} from "../ui/reference";
import { premium } from "../ui/theme";

function pickFeatured(events: EventItem[]) {
  // Paid featured placement wins first; then the existing logic.
  return (
    events.find((e) => e.featured === true) ??
    events.find((e) => e.category === "featured") ??
    events[1] ??
    events[0]
  );
}

function matchesHomeSearch(e: EventItem, venueName: string, q: string) {
  if (!q) return true;
  const query = q.trim().toLowerCase();
  return (
    e.title.toLowerCase().includes(query) ||
    venueName.toLowerCase().includes(query) ||
    (e.vibeTags || []).join(" ").toLowerCase().includes(query) ||
    (e.audienceTags || []).join(" ").toLowerCase().includes(query)
  );
}

// ---------------------------------------------------------------------------
// Random fill (owner ruling, Mark 2026-11-15 20:17): "The home
// menu should be randomized to have it full until we begin to
// fill it up. Nothing should be empty if no data random fill
// within category parameters" — "Nothing should be empty ever."
//
// Home's event sections fill UP TO these display counts: the
// section's rule-based picks lead in rule order, then random
// in-parameter picks complete the rail (lib/randomFill.ts).
// Picks beyond a count are never trimmed. Fill operates on the
// real catalog only — the wholesale showcase fallback stays
// exactly as authored — and never while searching (search
// results are never padded with non-matches).
const HOME_SPOTLIGHT_TARGET = 3;
const HOME_PLAYLIST_TARGET = 6;

function startMs(e: EventItem): number {
  const t = new Date(e.startISO).getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

// The app's standard week window (the span the Events rails
// use): from an hour ago through seven days out.
function inWeekWindow(e: EventItem, now: Date): boolean {
  const t = startMs(e);
  const n = now.getTime();
  return t >= n - 3600_000 && t <= n + 7 * 86400_000;
}

// The app's own keyword classifier (the same one the Events
// category bar uses, via placeholders.ts): an event's category
// from its title + tags.
function classifierCategory(e: EventItem) {
  return categoryForText(e.title, ...(e.vibeTags || []), ...(e.audienceTags || []));
}

// Fill tiers for one Home playlist, in widening order. Tier 1
// is the playlist's own match predicate — resolvePlaylists
// already exhausts it into the picks, so it normally adds
// nothing; it is listed so the parameter order is explicit.
// Tier 2 is the section's category within the week window:
// the classifier category for Date Night / Family Fun; for
// Tonight in KC — a time section — the window itself widens
// from today to the week. Tier 3, where a section declares
// one, is the rest of the week window: the last resort before
// a rail may stay short, per "nothing should be empty ever."
function playlistFillTiers(def: Playlist, catalog: EventItem[], now: Date): EventItem[][] {
  const week = catalog.filter((e) => inWeekWindow(e, now));
  const tier1 = catalog.filter((e) => def.match(e, ""));
  if (def.id === "tonight-in-kc") {
    return [tier1, week];
  }
  if (def.id === "date-night") {
    const cats = new Set(["nightlife", "food", "music"]);
    return [tier1, week.filter((e) => cats.has(classifierCategory(e))), week];
  }
  if (def.id === "family-fun") {
    return [tier1, week.filter((e) => classifierCategory(e) === "family"), week];
  }
  return [tier1, week];
}


export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const fonts = usePremiumFonts();
  const [q, setQ] = useState("");

  // Events + venues come from Firestore; when BOTH are empty, the
  // authorized showcase fallback is used wholesale (never mixed).
  const [events, setEvents] = useState<EventItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    // Pass the viewer's email so operator-only test items are visible
    // only to the operator (store.ts filters for everyone else).
    Promise.all([fetchEvents(user?.email ?? null), fetchVenues(user?.email ?? null)])
      .then(([rows, venueRows]) => {
        if (!alive) return;
        setEvents(rows);
        setVenues(venueRows);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.email]);

  const qNorm = q.trim().toLowerCase();

  // Wholesale showcase fallback: demo only when the real catalog is
  // completely empty. Never mixed with real data.
  // Home's catalog is the full live event list, discovered
  // (web-sourced) events included (owner ruling, Mark 2026-11-15:
  // "the app should never be empty" — with a discovered-only
  // catalog, excluding them starved every Home rail). Discovered
  // events still render as link-out listings, never as Bownd
  // inventory.
  const usingDemo = events.length === 0 && venues.length === 0;
  const effEvents = usingDemo ? getShowcaseEvents() : events;
  const effVenues = usingDemo ? getShowcaseVenues() : venues;

  const visibleEvents = useMemo(
    () => effEvents.filter((e) => matchesHomeSearch(e, getVenueName(e.venueId, effVenues), qNorm)),
    [effEvents, effVenues, qNorm]
  );

  const visibleVenues = useMemo(
    () => (qNorm ? effVenues.filter((v) => v.name.toLowerCase().includes(qNorm)) : effVenues),
    [effVenues, qNorm]
  );

  const spotlightEvents = useMemo(
    () => visibleEvents.filter((e) => e.category === "spotlight"),
    [visibleEvents]
  );

  const featured = useMemo(() => pickFeatured(visibleEvents), [visibleEvents]);

  const topVenues = useMemo(() => visibleVenues.slice(0, 3), [visibleVenues]);

  const playlists = useMemo(
    () => resolvePlaylists(effEvents, effVenues),
    [effEvents, effVenues]
  );

  // Random fill (owner ruling, Mark 2026-11-15 20:17 — see the
  // helpers above): on the real catalog, Home's event sections
  // are topped up to their display counts so no rail renders
  // short — or missing entirely, the way resolvePlaylists drops
  // a zero-match playlist — while the catalog has events to
  // offer. Sections fill in render order (Spotlight heroes,
  // then Tonight in KC, Date Night, Family Fun) sharing one
  // `used` set, so an event repeats across sections only when
  // the catalog forces it. Until real programming (venue-
  // submitted / featured content) fills these sections through
  // the rule-based picks, the random fill stands in; the picks
  // always lead and are never displaced.
  const filledHome = useMemo(() => {
    if (usingDemo || qNorm) return null;
    const now = new Date();
    const seedKey = catalogFingerprint(effEvents);
    // Every section's rule picks are reserved in `used` up
    // front: a section's random fill may borrow an event
    // another section picked (or already shows) only when the
    // catalog leaves it no unused event at all.
    const used = new Set<string>();
    const spotPicks = effEvents.filter((e) => e.category === "spotlight");
    for (const e of spotPicks) used.add(e.id);
    for (const pl of playlists) {
      for (const item of pl.items) {
        if (item.kind === "event") used.add(item.event.id);
      }
    }

    const spotlight = fillRail(
      spotPicks,
      [
        effEvents.filter((e) => e.category === "spotlight"),
        effEvents.filter((e) => inWeekWindow(e, now)),
      ],
      HOME_SPOTLIGHT_TARGET,
      `home-spotlight|${seedKey}`,
      used,
    );

    const resolvedById = new Map(playlists.map((p) => [p.id, p]));
    const filledPlaylists: ResolvedPlaylist[] = [];
    for (const def of PLAYLISTS) {
      const baseItems = resolvedById.get(def.id)?.items ?? [];
      const venueCount = baseItems.filter((i) => i.kind === "venue").length;
      const eventPicks = baseItems
        .filter((i): i is Extract<ResolvedPlaylistItem, { kind: "event" }> => i.kind === "event")
        .map((i) => i.event);
      const filledEvents = fillRail(
        eventPicks,
        playlistFillTiers(def, effEvents, now),
        Math.max(0, HOME_PLAYLIST_TARGET - venueCount),
        `home-playlist-${def.id}|${seedKey}`,
        used,
      );
      const pickIds = new Set(eventPicks.map((e) => e.id));
      const items: ResolvedPlaylistItem[] = [
        ...baseItems,
        ...filledEvents
          .filter((e) => !pickIds.has(e.id))
          .map((event) => ({ kind: "event", event }) as ResolvedPlaylistItem),
      ];
      // A playlist only renders once it has items — with a
      // non-empty catalog the fill guarantees that; with a
      // genuinely empty one the section stays absent rather
      // than rendering a fabricated rail.
      if (items.length > 0) {
        filledPlaylists.push({
          id: def.id,
          title: def.title,
          subtitle: def.subtitle,
          featured: def.featured === true,
          items,
        });
      }
    }
    // Any resolved playlist without a PLAYLISTS def keeps its
    // rule-based items untouched (none exist today —
    // resolvePlaylists only resolves PLAYLISTS defs).
    for (const pl of playlists) {
      if (!PLAYLISTS.some((d) => d.id === pl.id)) filledPlaylists.push(pl);
    }
    return { spotlight, playlists: filledPlaylists };
  }, [usingDemo, qNorm, effEvents, playlists]);

  const shownPlaylists = filledHome?.playlists ?? playlists;
  const shownSpotlight = filledHome?.spotlight ?? spotlightEvents;

  // Featured Playlists rail (premium pass): only playlists carrying
  // the optional `featured` flag (default false) render here.
  const featuredPlaylists = useMemo(
    () => shownPlaylists.filter((p) => p.featured === true),
    [shownPlaylists]
  );

  // Campaign slot (premium pass): the active campaign from
  // data/campaigns.ts renders a Home banner. Config-driven — when NYE
  // ends, the next campaign takes the slot with no code change.
  const activeCampaign = useMemo(() => getActiveCampaign(), []);

  // Points pill: the mockup header carries the pill as part of its
  // shape, so it renders with the REAL profile balance — including a
  // real 0 ("★ 0 pts · $0.00"). The value always comes from the
  // signed-in profile (guests have no profile, so 0); nothing is
  // invented, the pill is simply never hidden.
  const pillPoints = profile?.points ?? 0;

  // Header avatar initial: the account's real initial (profile name,
  // auth name, or email), never a stock letter.
  const avatarInitial = useMemo(() => {
    const raw = (profile?.displayName || user?.displayName || user?.email || "").trim();
    const ch = raw.replace(/^[^A-Za-z0-9]+/, "").charAt(0);
    return ch ? ch.toUpperCase() : null;
  }, [profile?.displayName, user?.displayName, user?.email]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  // Home section order (fixed): Showcase spotlight cards, Tonight in KC,
  // Top Venues, Date Night, Family Fun, Featured. Playlists are looked up
  // by id so the order holds even if resolvePlaylists returns them in a
  // different order; any future playlist not in this order renders after
  // Family Fun, before Featured.
  const playlistById = useMemo(
    () => new Map(shownPlaylists.map((p) => [p.id, p])),
    [shownPlaylists]
  );
  const otherPlaylists = useMemo(
    () =>
      shownPlaylists.filter(
        (p) => p.id !== "tonight-in-kc" && p.id !== "date-night" && p.id !== "family-fun"
      ),
    [shownPlaylists]
  );

  function renderPlaylist(pl: ResolvedPlaylist | undefined) {
    if (!pl) return null;
    return (
      <View key={pl.id}>
        <Section title={pl.title} subtitle={pl.subtitle} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 10 }}
        >
          {pl.items.map((item) =>
            item.kind === "event" ? (
              <View key={`event:${item.event.id}`} style={styles.playlistCardWrap}>
                <SceneEventCard
                  title={item.event.title}
                  venueName={getVenueName(item.event.venueId, effVenues)}
                  whenLabel={formatWhen(item.event.startISO)}
                  badge={item.event.isTest ? "Test" : undefined}
                  priceLabel={item.event.priceLabel || undefined}
                  photoUrl={item.event.photoUrl}
                  onPress={() => openEvent(item.event.id)}
                />
              </View>
            ) : (
              <VenueTile
                key={`venue:${item.venue.id}`}
                name={item.venue.name}
                meta={venueMetaFor(item.venue.name)}
                photoUrl={item.venue.photoUrl}
                verified={item.venue.verified}
                isTest={item.venue.isTest}
                featured={item.venue.featured}
                onPress={() => openVenue(item.venue.id, item.venue.name)}
                style={{ marginRight: 12 }}
              />
            )
          )}
        </ScrollView>
      </View>
    );
  }

  function go(route: string) {
    router.replace(route);
  }

  function openEvent(id: string) {
    router.push({ pathname: "/detail", params: { id, kind: "event" } });
  }

  function openVenue(id: string, _name: string) {
    // Venue tiles open the venue PAGE (detail.tsx kind=venue), which
    // lists that venue's upcoming events.
    router.push({ pathname: "/detail", params: { id, kind: "venue" } });
  }

  function openSearchInEvents() {
    router.push({ pathname: "/(tabs)/events", params: { q: q.trim() } });
  }

  const nothingFound =
    !loading && qNorm.length > 0 && visibleEvents.length === 0 && visibleVenues.length === 0;

  return (
    <View style={refStyles.root}>
      <LinearGradient
        colors={[...premium.screenGradient]}
        locations={[...premium.screenGradientLocations]}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          refStyles.scroll,
          { paddingTop: 16 + insets.top, paddingBottom: 70 + insets.bottom + 16 },
        ]}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0A0616" />
        {/* Premium header (mockup .app-head): greeting eyebrow +
            headline + points pill on the left, gradient avatar
            circle on the right. No top tab row — the mockup has none. */}
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headHi, fonts.bodyBold]}>{greeting} · Kansas City</Text>
            <Text style={[styles.headTitle, fonts.display]}>Find what&apos;s happening</Text>
            <TouchableOpacity
              onPress={() => go(TAB_ROUTES.Rewards)}
              activeOpacity={0.85}
              style={{ marginTop: 9, alignSelf: "flex-start" }}
            >
              <PointsPill points={pillPoints} />
            </TouchableOpacity>
          </View>
          <HeaderAvatar initial={avatarInitial} onPress={() => go(TAB_ROUTES.Rewards)} />
        </View>
        <Search value={q} onChange={setQ} placeholder="Search events, venues, neighborhoods" />
        <View style={{ height: 8 }} />

        {usingDemo && !loading && (
          <View style={styles.showcaseChip}>
            <Text style={styles.showcaseChipText}>Showcase preview · Sample listings</Text>
          </View>
        )}

        {/* Campaign slot banner (config-driven, data/campaigns.ts) */}
        {activeCampaign && !qNorm && (
          <CampaignBanner
            presenter={activeCampaign.presenter}
            name={activeCampaign.name}
            datesLabel={activeCampaign.datesLabel}
            gradient={activeCampaign.gradient}
            onPress={() =>
              router.push({
                pathname: "/detail",
                params: { id: activeCampaign.id, kind: "campaign" },
              })
            }
          />
        )}

        {!!qNorm && (
          <TouchableOpacity onPress={openSearchInEvents} style={styles.seeResultsRow}>
            <Text style={styles.seeResultsText}>See all results in Events</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        )}

        {loading ? (
          <Text style={styles.emptyText}>Loading…</Text>
        ) : effEvents.length === 0 ? (
          <Text style={styles.emptyText}>No events yet — check back soon.</Text>
        ) : nothingFound ? (
          <Text style={styles.emptyText}>No matches for “{q.trim()}”.</Text>
        ) : (
          <>
            {/* Showcase — spotlight hero cards (vertical list), first section.
                Premium anatomy: scene photo crop above the caption. */}
            {shownSpotlight.map((item) => (
              <SceneEventCard
                key={item.id}
                title={item.title}
                venueName={getVenueName(item.venueId, effVenues)}
                whenLabel={formatWhen(item.startISO)}
                badge={item.isTest ? "Test" : "Spotlight"}
                priceLabel={item.priceLabel || undefined}
                photoUrl={item.photoUrl}
                onPress={() => openEvent(item.id)}
              />
            ))}

            {/* Featured Playlists rail — playlists carrying the optional
                `featured` flag (default false). Tapping a card opens the
                Events tab (the app has no playlist detail screen). */}
            {featuredPlaylists.length > 0 && !qNorm && (
              <View>
                <Section title="Featured Playlists" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingBottom: 10 }}
                >
                  {featuredPlaylists.map((pl, i) => {
                    const first = pl.items[0];
                    const cover = first
                      ? first.kind === "event"
                        ? first.event.photoUrl
                        : first.venue.photoUrl
                      : undefined;
                    return (
                      <PlaylistRailCard
                        key={pl.id}
                        title={pl.title}
                        subtitle={pl.subtitle}
                        itemCount={pl.items.length}
                        coverPhotoUrl={cover}
                        tag={i === 0 ? "Featured" : "Curated"}
                        tagGold={i === 0}
                        onPress={() => router.replace("/(tabs)/events")}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Home order: Showcase (spotlight) → Tonight in KC → Top Venues
                → Date Night → Family Fun → Featured. */}
            {renderPlaylist(playlistById.get("tonight-in-kc"))}

            {/* Top Venues — premium icon tiles (v1 venue language:
                icon on solid color + name; a real photoUrl still wins) */}
            {topVenues.length > 0 && (
              <View>
                <Section title="Top Venues" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingBottom: 10 }}
                >
                  {topVenues.map((v) => (
                    <VenueTile
                      key={v.id}
                      name={v.name}
                      meta={venueMetaFor(v.name)}
                      photoUrl={v.photoUrl}
                      verified={v.verified}
                      isTest={v.isTest}
                      featured={v.featured}
                      onPress={() => openVenue(v.id, v.name)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {renderPlaylist(playlistById.get("date-night"))}
            {renderPlaylist(playlistById.get("family-fun"))}
            {otherPlaylists.map((pl) => renderPlaylist(pl))}

            {/* Featured — rendered TWICE, exactly as the reference does. */}
            {featured && (
              <>
                <Section
                  title="Featured:"
                  subtitle={featured.title}
                  onPress={() => router.replace("/(tabs)/events")}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingBottom: 10 }}
                >
                  {visibleVenues.slice(0, 3).map((v) => (
                    <VenueTile
                      key={v.id}
                      name={v.name}
                      meta={venueMetaFor(v.name)}
                      photoUrl={v.photoUrl}
                      verified={v.verified}
                      isTest={v.isTest}
                      featured={v.featured}
                      onPress={() => openVenue(v.id, v.name)}
                    />
                  ))}
                </ScrollView>
                <Section
                  title="Featured:"
                  subtitle={featured.title}
                  onPress={() => router.replace("/(tabs)/events")}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
      <View style={{ backgroundColor: "#0F0A1F", paddingBottom: insets.bottom }}>
        <BottomNav active="Home" onNavigate={go} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
    marginBottom: 14,
  },
  headHi: { color: premium.muted, fontSize: 12.5, fontWeight: "700" },
  headTitle: { color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 2 },
  seeResultsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    marginBottom: 6,
  },
  seeResultsText: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 14,
  },
  emptyText: {
    marginTop: 24,
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  showcaseChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(232,196,118,0.13)",
    borderWidth: 1,
    borderColor: "rgba(232,196,118,0.40)",
    marginBottom: 10,
  },
  showcaseChipText: {
    color: "#e8c476",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  playlistCardWrap: {
    width: 280,
  },
});
