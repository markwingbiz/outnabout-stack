// app/(tabs)/home.tsx
// Bownd recreate — Home screen restyle (see REFERENCE-ANALYSIS.md).
// Layout + visuals use the shared design system in app/ui/recreate.tsx
// (SearchBar, SegmentedTabs, BottomNav, PhotoCard, rc/rr/rs/rtype/rshadow).
// Photo cards use gradient placeholders: the mockup's photos are baked into
// the reference JPG at low resolution and cannot be extracted, so the
// gradients stand in until real photo assets are provided. They are never
// presented as real photos.
// Behavior preserved from the previous version:
// - Home search is WIRED: typing filters spotlight/featured events and
//   venues in place (title, venue, vibe/audience tags). A "See results in
//   Events" row navigates to /(tabs)/events with the query prefilled, and
//   submitting the search does the same.
// - Photo cards navigate to the real detail screen (/detail?id=...&kind=event).
// - Venue cards navigate to /(tabs)/events filtered to that venue.
// - Events + venues come from Firestore ONLY (lib/store.ts). No bundled
//   demo fallback: an empty catalog shows "No events yet", never demo
//   events presented as real.
// - The "Featured:" heading renders ONCE (the mockup duplicates it; that
//   duplication is a mockup error and is not reproduced here). Its title is
//   the real featured event's title, never a hardcoded demo title.
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  FlatList,
  StatusBar,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";

import { fetchEvents, fetchVenues, type EventItem, type Venue } from "../../lib/store";
import {
  SearchBar,
  SegmentedTabs,
  BottomNav,
  PhotoCard,
  rc,
  rr,
  rs,
  rtype,
  rshadow,
  type TabKey,
} from "../ui/recreate";

function pickFeatured(events: EventItem[]) {
  return events.find((e) => e.category === "featured") ?? events[1] ?? events[0];
}
function getVenueNameFromEvent(e: EventItem, venues: Venue[]) {
  const v = venues.find((x) => x.id === e.venueId || x.name === e.venueId);
  return v?.name ?? (e.venueId || "Venue");
}

/** Split a venue name across two balanced lines for the small venue cards. */
function venueLabel(name: string) {
  const words = name.split(" ");
  if (words.length < 2) return name;
  const mid = Math.ceil(words.length / 2);
  return words.slice(0, mid).join(" ") + "\n" + words.slice(mid).join(" ");
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

/** Badge text computed from the event's REAL data: "Tonight" when the real
 *  start time falls on today, otherwise the real vibe/audience tags, with
 *  the real category as a last resort. Never hardcoded per event. */
function badgeForEvent(e: EventItem): string {
  const start = new Date(e.startISO);
  const now = new Date();
  const isToday =
    !Number.isNaN(start.getTime()) &&
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();
  if (isToday) return "★ Tonight";
  const tags = [...(e.vibeTags || []), ...(e.audienceTags || [])].filter(Boolean);
  if (tags.length > 0) return "★ " + tags.slice(0, 2).join(" | ");
  if (e.category === "featured") return "★ Featured";
  if (e.category === "spotlight") return "★ Spotlight";
  return "★ Event";
}

// Gradient placeholders for photo cards (see header note: not real photos).
const HERO_GRADIENTS: [string, string][] = [
  ["#7C3AED", "#1E1B4B"],
  ["#4F46E5", "#0E7490"],
  ["#A855F7", "#312E81"],
];
const VENUE_GRADIENTS: [string, string][] = [
  ["#3B82F6", "#1E3A8A"],
  ["#0EA5A5", "#134E4A"],
  ["#A855F7", "#4C1D95"],
];

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("home");

  // Events + venues come from Firestore only (no bundled demo fallback).
  const [events, setEvents] = useState<EventItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchEvents(), fetchVenues()])
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
  }, []);

  const qNorm = q.trim().toLowerCase();

  // Search filters the catalog in place (events + venues).
  const visibleEvents = useMemo(
    () => events.filter((e) => matchesHomeSearch(e, getVenueNameFromEvent(e, venues), qNorm)),
    [events, venues, qNorm]
  );

  const visibleVenues = useMemo(
    () => (qNorm ? venues.filter((v) => v.name.toLowerCase().includes(qNorm)) : venues),
    [venues, qNorm]
  );

  const spotlightEvents = useMemo(
    () => visibleEvents.filter((e) => e.category === "spotlight"),
    [visibleEvents]
  );

  // all featured events
  const featuredEvents = useMemo(
    () => visibleEvents.filter((e) => e.category === "featured"),
    [visibleEvents]
  );

  // Stacked hero cards: up to 3 real events, spotlight first then featured,
  // deduplicated. Falls back to the first real visible events when nothing
  // is tagged spotlight/featured. Never invents filler cards.
  const heroEvents = useMemo(() => {
    const picked: EventItem[] = [];
    const seen = new Set<string>();
    for (const e of [...spotlightEvents, ...featuredEvents]) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        picked.push(e);
      }
    }
    if (picked.length > 0) return picked.slice(0, 3);
    return visibleEvents.slice(0, 3);
  }, [spotlightEvents, featuredEvents, visibleEvents]);

  // keep your single "featured" for the header row text
  const featured = useMemo(() => pickFeatured(visibleEvents), [visibleEvents]);

  const topVenues = useMemo(() => visibleVenues.slice(0, 3), [visibleVenues]);

  function go(tab: TabKey) {
    setActiveTab(tab);
    router.replace(`/(tabs)/${tab}`);
  }

  function openEvent(id: string) {
    router.push({ pathname: "/detail", params: { id, kind: "event" } });
  }

  function openVenue(name: string) {
    router.push({ pathname: "/(tabs)/events", params: { venue: name } });
  }

  function openSearchInEvents() {
    router.push({ pathname: "/(tabs)/events", params: { q: q.trim() } });
  }

  const nothingFound = !loading && qNorm.length > 0 && visibleEvents.length === 0 && visibleVenues.length === 0;

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <SafeAreaView style={styles.safe}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search */}
          <SearchBar
            value={q}
            onChangeText={setQ}
            placeholder="Explore"
            onSubmit={openSearchInEvents}
          />

          {/* Top tabs */}
          <View style={styles.tabsWrap}>
            <SegmentedTabs active={activeTab} onSelect={go} />
          </View>

          {/* See full search results in Events (only while searching) */}
          {!!qNorm && (
            <Pressable onPress={openSearchInEvents} style={styles.seeResultsRow}>
              <Text style={styles.seeResultsText}>See all results in Events</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}

          {loading ? (
            <Text style={styles.emptyText}>Loading…</Text>
          ) : events.length === 0 ? (
            <Text style={styles.emptyText}>No events yet — check back soon.</Text>
          ) : nothingFound ? (
            <Text style={styles.emptyText}>No matches for “{q.trim()}”.</Text>
          ) : (
            <>
              {/* Stacked full-width photo cards (up to 3 real events) */}
              <View style={styles.heroList}>
                {heroEvents.map((item, index) => (
                  <PhotoCard
                    key={item.id}
                    title={item.title}
                    subtitle={getVenueNameFromEvent(item, venues)}
                    badge={badgeForEvent(item)}
                    gradient={HERO_GRADIENTS[index % HERO_GRADIENTS.length]}
                    height={190}
                    onPress={() => openEvent(item.id)}
                  />
                ))}
              </View>

              {/* Featured header row — rendered ONCE (mockup duplicates it) */}
              {featured && (
                <Pressable onPress={() => router.replace("/(tabs)/events")} style={styles.featureHeader}>
                  <Text numberOfLines={1} style={styles.featureHeaderText}>
                    Featured: {featured.title}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}

              {/* Top Venues (only when venues exist) */}
              {topVenues.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Top Venues:</Text>

                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={topVenues}
                    keyExtractor={(v, i) => String(v?.id ?? v?.name ?? i)}
                    contentContainerStyle={styles.venuesRow}
                    renderItem={({ item, index }) => {
                      const name = item?.name || "Venue";
                      const label = venueLabel(name);
                      return (
                        <View style={styles.venueCardWrap}>
                          <PhotoCard
                            title={label}
                            gradient={VENUE_GRADIENTS[index % VENUE_GRADIENTS.length]}
                            height={120}
                            onPress={() => openVenue(name)}
                          />
                        </View>
                      );
                    }}
                  />
                </>
              )}
            </>
          )}

          {/* bottom breathing room */}
          <View style={{ height: 26 }} />
        </ScrollView>

        <BottomNav active={activeTab} onSelect={go} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: rc.bg },
  safe: { flex: 1 },

  content: {
    paddingTop: rs.sm,
    paddingHorizontal: rs.page,
    paddingBottom: rs.lg,
  },

  tabsWrap: {
    marginTop: rs.md,
    marginBottom: rs.lg,
  },

  // "See all results in Events" row (only while searching)
  seeResultsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    marginBottom: 6,
  },
  seeResultsText: {
    color: rc.text,
    fontWeight: "800",
    fontSize: 14,
  },
  chevron: {
    color: rc.muted,
    fontSize: 20,
    fontWeight: "700",
    marginTop: -2,
  },

  emptyText: {
    marginTop: 24,
    color: rc.muted,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },

  // Stacked full-width photo cards
  heroList: {
    gap: rs.md,
  },

  // Featured header row — rendered ONCE
  featureHeader: {
    marginTop: rs.lg,
    marginBottom: rs.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: rc.border,
  },
  featureHeaderText: {
    flex: 1,
    color: rc.text,
    fontWeight: "800",
    fontSize: 18,
    lineHeight: 24,
  },

  sectionLabel: {
    marginTop: rs.sm,
    marginBottom: rs.sm,
    color: rc.text,
    ...rtype.section,
  },

  venuesRow: {
    paddingBottom: 12,
    gap: rs.page,
  },
  venueCardWrap: {
    width: 160,
    borderRadius: rr.card,
    ...rshadow.card,
  },
});
