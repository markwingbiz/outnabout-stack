// app/(tabs)/home.tsx
// Phase 6 fix notes (see FIX-PLAN.md):
// - Home search is WIRED: typing filters spotlight/featured events and
//   venues in place (title, venue, vibe/audience tags). A "See results in
//   Events" row navigates to /(tabs)/events with the query prefilled.
// - Spotlight / featured cards navigate to the real detail screen
//   (/detail?id=...&kind=event) instead of generically replacing to
//   /(tabs)/events and losing which event was tapped.
// - Venue orbs navigate to /(tabs)/events filtered to that venue.
// - Events + venues come from Firestore ONLY (lib/store.ts). No bundled
//   demo fallback: an empty catalog shows "No events yet", never demo
//   events presented as real.
// - Visual design is UNCHANGED: same layout, styles, and components.
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  SafeAreaView,
  TextInput,
  Pressable,
  FlatList,
  StatusBar,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { fetchEvents, fetchVenues, type EventItem, type Venue } from "../../lib/store";

type TabKey = "home" | "events" | "personal";

function pickFeatured(events: EventItem[]) {
  return events.find((e) => e.category === "featured") ?? events[1] ?? events[0];
}
function getVenueNameFromEvent(e: EventItem, venues: Venue[]) {
  const v = venues.find((x) => x.id === e.venueId || x.name === e.venueId);
  return v?.name ?? (e.venueId || "Venue");
}

function titleToTwoLines(title: string) {
  // Helps mimic the mock’s bigger “headline” look without overflowing.
  const parts = title.split(":");
  if (parts.length >= 2) {
    const left = parts[0].trim() + ":";
    const right = parts.slice(1).join(":").trim();
    return { line1: left, line2: right };
  }
  const words = title.split(" ");
  if (words.length <= 3) return { line1: title, line2: "" };
  const mid = Math.ceil(words.length / 2);
  return { line1: words.slice(0, mid).join(" "), line2: words.slice(mid).join(" ") };
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

  // ✅ Spotlight events list for horizontal scroll
  const spotlightEvents = useMemo(
    () => visibleEvents.filter((e) => e.category === "spotlight"),
    [visibleEvents]
  );

  // keep your single "featured" for the header row text (unchanged UI)
  const featured = useMemo(() => pickFeatured(visibleEvents), [visibleEvents]);

  const topVenues = useMemo(() => visibleVenues.slice(0, 3), [visibleVenues]);

  // all featured events for the vertical menu
  const featuredEvents = useMemo(
    () => visibleEvents.filter((e) => e.category === "featured"),
    [visibleEvents]
  );

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
    <ImageBackground
      source={require("../../assets/backgrounds/home-bg.jpg")}
      resizeMode="cover"
      style={styles.bg}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Dark vignette like the mock */}
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.55)",
          "rgba(0,0,0,0.35)",
          "rgba(0,0,0,0.55)",
        ]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.75)" />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Explore"
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={openSearchInEvents}
            />
          </View>

          {/* See full search results in Events (only while searching) */}
          {!!qNorm && (
            <Pressable onPress={openSearchInEvents} style={styles.seeResultsRow}>
              <Text style={styles.seeResultsText}>See all results in Events</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.75)" />
            </Pressable>
          )}

          {/* Top tabs pill group */}
          <View style={styles.tabsPill}>
            {(["home", "events", "personal"] as TabKey[]).map((t) => {
              const active = activeTab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => go(t)}
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loading ? (
            <Text style={styles.emptyText}>Loading…</Text>
          ) : events.length === 0 ? (
            <Text style={styles.emptyText}>No events yet — check back soon.</Text>
          ) : nothingFound ? (
            <Text style={styles.emptyText}>No matches for “{q.trim()}”.</Text>
          ) : (
            <>
              {/* Spotlight list (vertical stack, like the mock) */}
              <View style={styles.spotlightListWrap}>
                {spotlightEvents.map((item) => {
                  const venue = getVenueNameFromEvent(item, venues);
                  const t = titleToTwoLines(item.title);

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => openEvent(item.id)}
                      style={[styles.cardOuter, styles.spotlightCardOuter]}
                    >
                        <ImageBackground
                          source={require("../../assets/backgrounds/home-bg.jpg")}
                          resizeMode="cover"
                          style={styles.heroCard}
                          imageStyle={styles.heroImageStyle}
                        >
                          <LinearGradient
                            colors={["rgba(0,0,0,0.10)", "rgba(0,0,0,0.65)"]}
                            style={StyleSheet.absoluteFill}
                          />

                          <View style={styles.heroTextWrap}>
                            <Text style={styles.heroTitle}>
                              {t.line1}
                              {!!t.line2 ? "\n" : ""}
                              {!!t.line2 ? t.line2 : ""}
                            </Text>

                            <Text numberOfLines={1} style={styles.heroSub}>
                              {venue} - Spotlight
                            </Text>

                            <View style={styles.heroMetaRow}>
                              <Text style={styles.heroStar}>★</Text>
                              <Text style={styles.heroMeta}>Tonight</Text>
                            </View>
                          </View>
                        </ImageBackground>
                      </Pressable>
                    );
                })}
              </View>

              {/* Top Venues (only when venues exist) */}
              {topVenues.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Top Venues:</Text>

                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={topVenues}
                    keyExtractor={(v, i) => String((v as any)?.id ?? (v as any)?.name ?? i)}
                    contentContainerStyle={styles.venuesRow}
                    renderItem={({ item, index }) => {
                      const name = (item as any)?.name ?? "Venue";
                      const icon =
                        index === 0 ? "wine-outline" : index === 1 ? "triangle-outline" : "business-outline";

                      return (
                        <Pressable onPress={() => openVenue(name)} style={styles.venueItem}>
                          <LinearGradient
                            colors={
                              index === 0
                                ? ["rgba(60,120,255,0.50)", "rgba(40,60,130,0.45)"]
                                : index === 1
                                ? ["rgba(80,220,210,0.40)", "rgba(50,120,140,0.40)"]
                                : ["rgba(170,120,255,0.45)", "rgba(90,60,170,0.40)"]
                            }
                            style={styles.venueOrb}
                          >
                            <Ionicons name={icon as any} size={22} color="rgba(255,255,255,0.90)" />
                          </LinearGradient>

                          <Text numberOfLines={1} style={styles.venueName}>
                            {name}
                          </Text>
                        </Pressable>
                      );
                    }}
                  />
                </>
              )}

              {/* Featured header row (UNCHANGED UI) */}
              {featured && (
                <Pressable onPress={() => router.replace("/(tabs)/events")} style={styles.featureHeader}>
                  <Text style={styles.featureHeaderLeft}>Featured:</Text>
                  <Text numberOfLines={1} style={styles.featureHeaderRight}>
                    {featured.title}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.65)" />
                </Pressable>
              )}

              {/* Featured vertical menu (UNCHANGED) */}
              <View style={styles.featureMenuWrap}>
                <FlatList
                  data={featuredEvents}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={true}
                  nestedScrollEnabled={true}
                  contentContainerStyle={styles.featureMenuContent}
                  renderItem={({ item }) => {
                    const venue = getVenueNameFromEvent(item, venues);

                    return (
                      <Pressable onPress={() => openEvent(item.id)} style={styles.cardOuter}>
                        <ImageBackground
                          source={require("../../assets/backgrounds/home-bg.jpg")}
                          resizeMode="cover"
                          style={styles.featureCard}
                          imageStyle={styles.featureImageStyle}
                        >
                          <LinearGradient
                            colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.70)"]}
                            style={StyleSheet.absoluteFill}
                          />

                          <View style={styles.featureBottomRow}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                              <Text numberOfLines={1} style={styles.featureTitle}>
                                {item.title}
                              </Text>
                              <Text numberOfLines={1} style={styles.featureSub}>
                                {venue}
                              </Text>
                            </View>

                            <View style={styles.badge}>
                              <Text style={styles.badgeText}>FEATURED</Text>
                            </View>
                          </View>
                        </ImageBackground>
                      </Pressable>
                    );
                  }}
                />
              </View>
            </>
          )}

          {/* bottom breathing room so it “moves” like the mock */}
          <View style={{ height: 26 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },

  content: {
    paddingTop: Platform.select({ ios: 6, android: 12 }),
    paddingHorizontal: 18,
    paddingBottom: 28,
  },

  // Search (dark glass)
  searchWrap: {
    height: 52,
    borderRadius: 22,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "rgba(255,255,255,0.92)",
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

  // Tabs group (single pill container like the mock)
  tabsPill: {
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    padding: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  tabText: {
    color: "rgba(255,255,255,0.70)",
    fontWeight: "800",
    fontSize: 14,
  },
  tabTextActive: {
    color: "rgba(255,255,255,0.95)",
  },

  // Cards
  cardOuter: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  // Spotlight vertical list (stacked full-width cards, like the mock)
  spotlightListWrap: {
    gap: 14,
  },
  spotlightCardOuter: {
    width: "100%",
  },

  heroCard: {
    height: 190,
    borderRadius: 22,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  heroImageStyle: {
    borderRadius: 22,
  },
  heroTextWrap: {
    padding: 16,
  },
  heroTitle: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 30,
  },
  heroSub: {
    marginTop: 8,
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    fontWeight: "700",
  },
  heroMetaRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroStar: {
    color: "rgba(255,215,140,0.95)",
    fontSize: 16,
    marginTop: -1,
  },
  heroMeta: {
    color: "rgba(255,255,255,0.90)",
    fontWeight: "900",
    fontSize: 15,
  },

  sectionLabel: {
    marginTop: 16,
    marginBottom: 10,
    color: "rgba(255,255,255,0.88)",
    fontSize: 18,
    fontWeight: "900",
  },

  venuesRow: {
    paddingBottom: 12,
    gap: 18,
  },
  venueItem: {
    width: 110,
    alignItems: "center",
  },
  venueOrb: {
    width: 84,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  venueName: {
    marginTop: 10,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },

  featureHeader: {
    marginTop: 4,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  featureHeaderLeft: {
    color: "rgba(255,255,255,0.90)",
    fontWeight: "900",
    fontSize: 18,
  },
  featureHeaderRight: {
    flex: 1,
    color: "rgba(255,255,255,0.70)",
    fontWeight: "800",
    fontSize: 16,
  },

  // Vertical menu container
  featureMenuWrap: {
    height: 340,
  },
  featureMenuContent: {
    gap: 12,
    paddingBottom: 6,
  },

  featureCard: {
    height: 155,
    borderRadius: 22,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  featureImageStyle: {
    borderRadius: 22,
  },
  featureBottomRow: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  featureTitle: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "900",
    fontSize: 20,
  },
  featureSub: {
    marginTop: 4,
    color: "rgba(255,255,255,0.72)",
    fontWeight: "700",
    fontSize: 13,
  },

  badge: {
    backgroundColor: "rgba(255,255,255,0.88)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  badgeText: {
    color: "rgba(0,0,0,0.85)",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
  },
});
