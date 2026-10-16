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
import { getShowcaseEvents, getShowcaseVenues, resolvePlaylists } from "../../data/showcase";
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

const VENUE_ICONS = ["wine-outline", "business-outline", "storefront-outline"] as const;

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");

  // Events + venues come from Firestore; when BOTH are empty, the
  // authorized showcase fallback is used wholesale (never mixed).
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

  function openVenue(name: string) {
    router.push({ pathname: "/(tabs)/events", params: { venue: name } });
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
                badge="Spotlight"
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
                          onPress={() => openEvent(item.event.id)}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        key={`venue:${item.venue.id}`}
                        onPress={() => openVenue(item.venue.name)}
                        style={refStyles.venueItem}
                      >
                        <LinearGradient
                          colors={["#24364b", "#100d22"]}
                          style={refStyles.venueIcon}
                        >
                          <Ionicons name="storefront-outline" size={31} color="#eee8ff" />
                        </LinearGradient>
                        <Text style={refStyles.venueName} numberOfLines={2}>
                          {item.venue.name}
                        </Text>
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
                  {topVenues.map((v, i) => (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => openVenue(v.name)}
                      style={refStyles.venueItem}
                    >
                      <LinearGradient
                        colors={
                          i === 1 ? ["#5a47a4", "#151026"] : ["#24364b", "#100d22"]
                        }
                        style={refStyles.venueIcon}
                      >
                        <Ionicons
                          name={
                            i === 0
                              ? "wine-outline"
                              : i === 1
                                ? "business-outline"
                                : "storefront-outline"
                          }
                          size={31}
                          color="#eee8ff"
                        />
                      </LinearGradient>
                      <Text style={refStyles.venueName} numberOfLines={2}>
                        {v.name}
                      </Text>
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
                  {visibleVenues.slice(0, 3).map((v, i) => (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => openVenue(v.name)}
                      style={refStyles.venueItem}
                    >
                      <LinearGradient
                        colors={
                          i === 1 ? ["#5a47a4", "#151026"] : ["#24364b", "#100d22"]
                        }
                        style={refStyles.venueIcon}
                      >
                        <Ionicons
                          name={VENUE_ICONS[i % VENUE_ICONS.length]}
                          size={31}
                          color="#eee8ff"
                        />
                      </LinearGradient>
                      <Text style={refStyles.venueName} numberOfLines={2}>
                        {v.name}
                      </Text>
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
});
