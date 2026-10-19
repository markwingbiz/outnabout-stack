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
//   screen. Venue orbs / venue row navigate to Events filtered to a venue.
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
import { getShowcaseEvents, getShowcaseVenues, resolvePlaylists } from "../../data/showcase";
import { categoryForVenueName, resolveCardImage } from "../../lib/placeholders";
import { CardBackground } from "../../components/ui/CardBackground";
import {
  BottomNav,
  EventCard,
  Search,
  Section,
  TopTabs,
  formatWhen,
  getVenueName,
  refStyles,
} from "../ui/reference";

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


export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
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

  function go(route: string) {
    router.replace(route);
  }

  function openEvent(id: string) {
    router.push({ pathname: "/detail", params: { id, kind: "event" } });
  }

  function openVenue(id: string, name: string) {
    router.push({ pathname: "/(tabs)/events", params: { venueId: id, venue: name } });
  }

  function openSearchInEvents() {
    router.push({ pathname: "/(tabs)/events", params: { q: q.trim() } });
  }

  const nothingFound =
    !loading && qNorm.length > 0 && visibleEvents.length === 0 && visibleVenues.length === 0;

  return (
    <View style={refStyles.root}>
      <LinearGradient
        colors={["#0e0b19", "#1b132f", "#0b0915"]}
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
        <StatusBar barStyle="light-content" backgroundColor="#0e0b19" />
        <Search value={q} onChange={setQ} placeholder="Explore" />
        <TopTabs active="Home" onNavigate={go} />
        <View style={{ height: 22 }} />

        {usingDemo && !loading && (
          <View style={styles.showcaseChip}>
            <Text style={styles.showcaseChipText}>Showcase preview · Sample listings</Text>
          </View>
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
            {/* Spotlight hero cards (vertical list) */}
            {spotlightEvents.map((item) => (
              <EventCard
                key={item.id}
                title={item.title}
                venueName={getVenueName(item.venueId, effVenues)}
                label={formatWhen(item.startISO)}
                badge={item.isTest ? "Test" : "Spotlight"}
                photoUrl={item.photoUrl}
                onPress={() => openEvent(item.id)}
              />
            ))}

            {/* Featured playlists — horizontal rails (below spotlight, above Top Venues) */}
            {playlists.map((pl) => (
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
                        <EventCard
                          title={item.event.title}
                          venueName={getVenueName(item.event.venueId, effVenues)}
                          label={formatWhen(item.event.startISO)}
                          badge={item.event.isTest ? "Test" : undefined}
                          photoUrl={item.event.photoUrl}
                          onPress={() => openEvent(item.event.id)}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        key={`venue:${item.venue.id}`}
                        onPress={() => openVenue(item.venue.id, item.venue.name)}
                        activeOpacity={0.86}
                        style={styles.venueCard}
                      >
                        <CardBackground
                          source={resolveCardImage(
                            item.venue.photoUrl,
                            categoryForVenueName(item.venue.name)
                          )}
                          style={styles.venueCardBg}
                          contentStyle={styles.venueCardContent}
                        >
                          <Text style={styles.venueCardName} numberOfLines={2}>
                            {item.venue.name}
                          </Text>
                          {item.venue.isTest && (
                            <Text style={styles.testBadgeText}>Test</Text>
                          )}
                          <Text style={styles.venueCardMeta}>Tap to view</Text>
                        </CardBackground>
                      </TouchableOpacity>
                    )
                  )}
                </ScrollView>
              </View>
            ))}

            {/* Top Venues orbs (first 3 venues, name only) */}
            {topVenues.length > 0 && (
              <View>
                <Text style={styles.orbsLabel}>Top Venues</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingBottom: 10 }}
                >
                  {topVenues.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => openVenue(v.id, v.name)}
                      activeOpacity={0.86}
                      style={styles.venueCard}
                    >
                      <CardBackground
                        source={resolveCardImage(v.photoUrl, categoryForVenueName(v.name))}
                        style={styles.venueCardBg}
                        contentStyle={styles.venueCardContent}
                      >
                        <Text style={styles.venueCardName} numberOfLines={2}>
                          {v.name}
                        </Text>
                        {v.isTest && <Text style={styles.testBadgeText}>Test</Text>}
                        <Text style={styles.venueCardMeta}>Tap to view</Text>
                      </CardBackground>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

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
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => openVenue(v.id, v.name)}
                      activeOpacity={0.86}
                      style={styles.venueCard}
                    >
                      <CardBackground
                        source={resolveCardImage(v.photoUrl, categoryForVenueName(v.name))}
                        style={styles.venueCardBg}
                        contentStyle={styles.venueCardContent}
                      >
                        <Text style={styles.venueCardName} numberOfLines={2}>
                          {v.name}
                        </Text>
                        {v.isTest && <Text style={styles.testBadgeText}>Test</Text>}
                        <Text style={styles.venueCardMeta}>Tap to view</Text>
                      </CardBackground>
                    </TouchableOpacity>
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
      <View style={{ backgroundColor: "#161120", paddingBottom: insets.bottom }}>
        <BottomNav active="Home" onNavigate={go} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  orbsLabel: {
    color: "#fff",
    fontSize: 21,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 10,
  },
  showcaseChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(245,195,106,0.16)",
    borderWidth: 1,
    borderColor: "rgba(245,195,106,0.45)",
    marginBottom: 10,
  },
  showcaseChipText: {
    color: "#f5c36a",
    fontSize: 12,
    fontWeight: "900",
  },
  playlistCardWrap: {
    width: 280,
  },
  // Venue cards — same photo-card style as the Events tab Top Venues
  // rail (photo background, name, "Tap to view"). Replaces the old
  // small icon tiles.
  venueCard: {
    width: 190,
    marginRight: 12,
    marginBottom: 0,
    minHeight: 110,
    borderRadius: 17,
    overflow: "hidden",
  },
  venueCardBg: { flex: 1, borderRadius: 17 },
  venueCardContent: { padding: 13, justifyContent: "space-between" },
  venueCardName: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  venueCardMeta: {
    marginTop: 10,
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "800",
  },
  testBadgeText: {
    color: "#f5c36a",
    fontWeight: "900",
    fontSize: 11,
    marginTop: 4,
  },
});
