// app/(tabs)/events.tsx
// Reference visuals (App.tsx) + real backend wiring (lib/store.ts).
// - Events + venues come from Firestore. When the Firestore catalog is
//   EMPTY (no events AND no venues), the authorized showcase fallback
//   (data/showcase.ts) is used wholesale — never mixed with real data —
//   with an honest "Showcase preview" chip. Demo listings are never
//   presented as live inventory.
// - Favorite heart on every All Events row, wired to toggleFavorite().
//   The heart is a SIBLING of the card pressable so it never opens detail.
// - Accepts params { q, venue } (from Home search + venue orbs +
//   Personal favorite venues) with a visible "Venue: X" chip to clear.
// - Section chevrons collapse/expand their section.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { loadPersona, type PersonaProfile, DEFAULT_PERSONA } from "../../lib/personaStore";
import {
  fetchEvents,
  fetchVenues,
  getFavorites,
  toggleFavorite,
  type EventItem,
  type Venue,
  type FavoriteItem,
} from "../../lib/store";
import { useAuth } from "../../lib/auth";
import { getShowcaseEvents, getShowcaseVenues } from "../../data/showcase";
import {
  BottomNav,
  EventCard,
  Pill,
  Search,
  Section,
  TopTabs,
  formatWhen,
  getVenueName,
  parseISO,
  refStyles,
} from "../ui/reference";

type TimeChip = "tonight" | "tomorrow" | "weekend" | "week" | "all";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function nextSaturday(from: Date) {
  const d = new Date(from);
  const day = d.getDay();
  const diff = (6 - day + 7) % 7;
  return startOfDay(addDays(d, diff));
}
function nextSunday(from: Date) {
  const d = new Date(from);
  const day = d.getDay();
  const diff = (0 - day + 7) % 7;
  return startOfDay(addDays(d, diff));
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function inTimeWindow(e: EventItem, mode: TimeChip) {
  if (mode === "all") return true;
  const now = new Date();
  const dt = parseISO(e.startISO);
  if (!dt) return false;
  const t = dt.getTime();
  const n = now.getTime();
  if (t < n - 1000 * 60 * 60) {
    // drop events that started more than 1h ago
    return false;
  }
  if (mode === "tonight") {
    return t <= endOfDay(now).getTime();
  }
  if (mode === "tomorrow") {
    const tomorrow = addDays(now, 1);
    return t >= startOfDay(tomorrow).getTime() && t <= endOfDay(tomorrow).getTime();
  }
  if (mode === "weekend") {
    const sat = nextSaturday(now);
    const sun = nextSunday(now);
    const isWeekendNow = [0, 6].includes(now.getDay());
    if (isWeekendNow) {
      return t >= n && t <= endOfDay(nextSunday(now)).getTime();
    }
    return t >= sat.getTime() && t <= endOfDay(sun).getTime();
  }
  // week
  return t >= n && t <= addDays(now, 7).getTime();
}

function matchesSearch(e: EventItem, venueName: string, q: string) {
  if (!q.trim()) return true;
  const query = q.trim().toLowerCase();
  return (
    e.title.toLowerCase().includes(query) ||
    venueName.toLowerCase().includes(query) ||
    (e.vibeTags || []).join(" ").toLowerCase().includes(query) ||
    (e.audienceTags || []).join(" ").toLowerCase().includes(query)
  );
}

function matchesPersona(e: EventItem, persona: PersonaProfile) {
  const pAudience = persona?.audience ? [persona.audience.toLowerCase()] : [];
  const pVibes = persona?.vibe ? [persona.vibe.toLowerCase()] : [];
  const eAudience = (e.audienceTags || []).map((s) => s.toLowerCase());
  const eVibes = (e.vibeTags || []).map((s) => s.toLowerCase());
  const audienceOK = pAudience.length === 0 ? true : pAudience.some((a) => eAudience.includes(a));
  const vibeOK = pVibes.length === 0 ? true : pVibes.some((v) => eVibes.includes(v));
  return audienceOK && vibeOK;
}

// Favorite heart. Rendered as a SIBLING of the card Pressable (not
// nested inside it) so tapping the heart never also opens the detail.
function FavButton({ isFav, onToggle }: { isFav: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} hitSlop={8} style={styles.favBtn}>
      <Ionicons name={isFav ? "heart" : "heart-outline"} size={20} color="#fff" />
    </TouchableOpacity>
  );
}

export default function EventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; venue?: string }>();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [venueFilter, setVenueFilter] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaProfile>(DEFAULT_PERSONA);
  const [timeChip, setTimeChip] = useState<TimeChip>("tonight");
  const [personalizedOn, setPersonalizedOn] = useState<boolean>(false);

  // Collapsible sections (chevrons toggle these)
  const [tailoredOpen, setTailoredOpen] = useState(true);
  const [spotlightOpen, setSpotlightOpen] = useState(true);
  const [venuesOpen, setVenuesOpen] = useState(true);

  // Favorites (Set of `kind:id`)
  const [favKeys, setFavKeys] = useState<Set<string>>(new Set());

  // Persona + favorites refresh whenever the screen gains focus
  // (persona may have changed on the picker; favorites may have
  // changed on Detail / Personal).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadPersona()
        .then((p) => {
          if (alive) setPersona(p || DEFAULT_PERSONA);
        })
        .catch(() => {
          if (alive) setPersona(DEFAULT_PERSONA);
        });
      getFavorites(user?.uid ?? null)
        .then((favs) => {
          if (alive) setFavKeys(new Set(favs.map((f) => `${f.kind}:${f.id}`)));
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [user?.uid])
  );

  // Events + venues come from Firestore; when BOTH are empty, the
  // authorized showcase fallback is used wholesale (never mixed).
  const [events, setEvents] = useState<EventItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchEvents(), fetchVenues()]).then(([rows, venueRows]) => {
      if (alive) {
        setEvents(rows);
        setVenues(venueRows);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Wholesale showcase fallback: demo only when the real catalog is
  // completely empty. Never mixed with real data.
  const usingDemo = events.length === 0 && venues.length === 0;
  const effEvents = usingDemo ? getShowcaseEvents() : events;
  const effVenues = usingDemo ? getShowcaseVenues() : venues;

  // Incoming params (Home search, venue orbs, Personal favorites).
  useEffect(() => {
    if (typeof params.q === "string" && params.q.trim()) setQuery(params.q);
    if (typeof params.venue === "string" && params.venue.trim()) setVenueFilter(params.venue);
  }, [params.q, params.venue]);

  function go(route: string) {
    router.replace(route);
  }

  function openEvent(id: string) {
    router.push({ pathname: "/detail", params: { id, kind: "event" } });
  }

  function openVenue(name: string) {
    setVenueFilter(name);
  }

  async function onToggleFav(item: EventItem) {
    const fav: FavoriteItem = {
      id: item.id,
      kind: "event",
      title: item.title,
      subtitle: getVenueName(item.venueId, effVenues),
      when: formatWhen(item.startISO),
    };
    try {
      const nowFav = await toggleFavorite(user?.uid ?? null, fav);
      setFavKeys((prev) => {
        const next = new Set(prev);
        if (nowFav) next.add(`event:${item.id}`);
        else next.delete(`event:${item.id}`);
        return next;
      });
    } catch {
      Alert.alert("Could not save favorite", "Try again.");
    }
  }

  const spotlight = useMemo(() => {
    return effEvents
      .filter((e) => e.category === "spotlight")
      .filter((e) => inTimeWindow(e, "week"))
      .slice(0, 10);
  }, [effEvents]);

  const tailored = useMemo(() => {
    return effEvents
      .filter((e) => inTimeWindow(e, "week"))
      .filter((e) => matchesPersona(e, persona))
      .slice(0, 10);
  }, [persona, effEvents]);

  const topVenues = useMemo(() => {
    return effVenues.map((v) => v.name).slice(0, 10);
  }, [effVenues]);

  const allEvents = useMemo(() => {
    const base = effEvents
      .filter((e) => inTimeWindow(e, timeChip))
      .filter((e) => matchesSearch(e, getVenueName(e.venueId, effVenues), query))
      .filter((e) =>
        venueFilter
          ? getVenueName(e.venueId, effVenues).toLowerCase() === venueFilter.toLowerCase() ||
            e.venueId.toLowerCase() === venueFilter.toLowerCase()
          : true
      );
    const personaFiltered = personalizedOn ? base.filter((e) => matchesPersona(e, persona)) : base;
    return [...personaFiltered].sort((a, b) => {
      const da = parseISO(a.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseISO(b.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [persona, personalizedOn, query, timeChip, effEvents, venueFilter, effVenues]);

  const headerSubtitle = useMemo(() => {
    const city = "Kansas City";
    const timeLabel =
      timeChip === "all"
        ? "All"
        : timeChip === "week"
          ? "This Week"
          : timeChip === "weekend"
            ? "Weekend"
            : timeChip === "tomorrow"
              ? "Tomorrow"
              : "Tonight";
    const mode = personalizedOn ? "Personalized" : "All events";
    return `${timeLabel} · ${city} · ${mode}`;
  }, [personalizedOn, timeChip]);

  return (
    <View style={refStyles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          refStyles.scroll,
          { paddingTop: 16 + insets.top, paddingBottom: 70 + insets.bottom + 16 },
        ]}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0e0b19" />
        <Search value={query} onChange={setQuery} placeholder="Explore events, venues, vibes..." />
        <TopTabs active="Events" onNavigate={go} />

        <Text style={refStyles.pageTitle}>Events</Text>
        <Text style={refStyles.subtitle}>{headerSubtitle}</Text>

        {usingDemo && (
          <View style={styles.showcaseChip}>
            <Text style={styles.showcaseChipText}>Showcase preview · Sample listings</Text>
          </View>
        )}

        {/* ONE filter row: time chips + All */}
        <View style={refStyles.filterWrap}>
          <Pill label="Tonight" active={timeChip === "tonight"} onPress={() => setTimeChip("tonight")} />
          <Pill label="Tomorrow" active={timeChip === "tomorrow"} onPress={() => setTimeChip("tomorrow")} />
          <Pill label="Weekend" active={timeChip === "weekend"} onPress={() => setTimeChip("weekend")} />
          <Pill label="This Week" active={timeChip === "week"} onPress={() => setTimeChip("week")} />
          <Pill label="All" active={timeChip === "all"} onPress={() => setTimeChip("all")} />
        </View>

        {/* Personalized | All + Change persona (right-aligned) */}
        <View style={[refStyles.filterWrap, { alignItems: "center" }]}>
          <Pill label="Personalized" active={personalizedOn} onPress={() => setPersonalizedOn(true)} />
          <Pill label="All" active={!personalizedOn} onPress={() => setPersonalizedOn(false)} />
          <View style={{ marginLeft: "auto" }}>
            <Pill label="Change persona" onPress={() => router.push("/(tabs)/persona")} />
          </View>
        </View>

        {/* Venue filter chip */}
        {!!venueFilter && (
          <View style={styles.venueFilterRow}>
            <Text style={styles.venueFilterText} numberOfLines={1}>
              Venue: {venueFilter}
            </Text>
            <TouchableOpacity
              onPress={() => setVenueFilter(null)}
              hitSlop={8}
              style={styles.venueFilterClear}
            >
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.75)" />
              <Text style={styles.venueFilterClearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tailored For You — horizontal rail (ignores search/timeChip) */}
        <Section
          title="Tailored For You"
          subtitle="Based on your persona"
          onPress={() => setTailoredOpen((v) => !v)}
        />
        {tailoredOpen && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {tailored.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => openEvent(item.id)}
                activeOpacity={0.86}
                style={[refStyles.tailored, styles.tailoredCard]}
              >
                <Text style={refStyles.micro}>{formatWhen(item.startISO)}</Text>
                <Text style={refStyles.tailoredTitle} numberOfLines={3}>
                  {item.title}
                </Text>
                <Text style={refStyles.muted}>{getVenueName(item.venueId, effVenues)}</Text>
                <View style={refStyles.tagRow}>
                  {uniq([...(item.vibeTags || []), ...(item.audienceTags || [])])
                    .slice(0, 3)
                    .map((t) => (
                      <View key={`${item.id}_${t}`} style={refStyles.tag}>
                        <Text style={refStyles.tagText}>{t}</Text>
                      </View>
                    ))}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Spotlight Events — vertical compact cards */}
        <Section
          title="Spotlight Events"
          subtitle="Hand-picked experiences"
          onPress={() => setSpotlightOpen((v) => !v)}
        />
        {spotlightOpen &&
          spotlight.map((item) => (
            <EventCard
              key={item.id}
              title={item.title}
              venueName={getVenueName(item.venueId, effVenues)}
              label={formatWhen(item.startISO)}
              compact
              onPress={() => openEvent(item.id)}
            />
          ))}

        {/* Top Venues rail */}
        <Section
          title="Top Venues"
          subtitle="Great places right now"
          onPress={() => setVenuesOpen((v) => !v)}
        />
        {venuesOpen && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {topVenues.map((name) => (
              <TouchableOpacity
                key={name}
                onPress={() => openVenue(name)}
                activeOpacity={0.86}
                style={[refStyles.tailored, styles.venueRailCard]}
              >
                <Text style={styles.venueRailName} numberOfLines={2}>
                  {name}
                </Text>
                <Text style={styles.venueRailMeta}>Tap to view</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* All Events list */}
        <Section title="All Events" subtitle="Full list" />
        {allEvents.length === 0 ? (
          <Text style={styles.emptyText}>
            {effEvents.length === 0
              ? "No events yet — check back soon."
              : "No events match your filters."}
          </Text>
        ) : (
          allEvents.map((item) => (
            <View key={item.id} style={styles.bigRow}>
              <TouchableOpacity onPress={() => openEvent(item.id)} style={StyleSheet.absoluteFill} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bigWhen}>{formatWhen(item.startISO)}</Text>
                <Text style={styles.bigTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.bigVenue} numberOfLines={1}>
                  {getVenueName(item.venueId, effVenues)}
                </Text>
                <View style={[refStyles.tagRow, { flexWrap: "wrap" }]}>
                  {uniq([...(item.vibeTags || []), ...(item.audienceTags || [])])
                    .slice(0, 4)
                    .map((t) => (
                      <View key={`${item.id}_big_${t}`} style={refStyles.tag}>
                        <Text style={refStyles.tagText}>{t}</Text>
                      </View>
                    ))}
                </View>
              </View>
              <View style={styles.bigRight}>
                <Text style={styles.priceText}>{item.priceLabel || ""}</Text>
                <Text style={styles.moreText}>View</Text>
              </View>
              <FavButton
                isFav={favKeys.has(`event:${item.id}`)}
                onToggle={() => onToggleFav(item)}
              />
            </View>
          ))
        )}
      </ScrollView>
      <View style={{ backgroundColor: "#161120", paddingBottom: insets.bottom }}>
        <BottomNav active="Events" onNavigate={go} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  venueFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 12,
  },
  venueFilterText: {
    flex: 1,
    color: "rgba(255,255,255,0.90)",
    fontWeight: "800",
    fontSize: 13,
  },
  venueFilterClear: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  venueFilterClearText: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "900",
    fontSize: 13,
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
  emptyText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontWeight: "800",
    paddingTop: 12,
  },
  tailoredCard: {
    width: 280,
    marginRight: 12,
    marginBottom: 0,
  },
  venueRailCard: {
    width: 190,
    marginRight: 12,
    marginBottom: 0,
    justifyContent: "space-between",
    minHeight: 110,
  },
  venueRailName: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  venueRailMeta: {
    marginTop: 10,
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "800",
  },
  favBtn: {
    position: "absolute",
    top: 8,
    right: 10,
    padding: 4,
  },
  bigRow: {
    borderRadius: 18,
    overflow: "hidden",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.20)",
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  bigWhen: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
    fontWeight: "900",
  },
  bigTitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.96)",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  bigVenue: {
    marginTop: 6,
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
    fontWeight: "800",
  },
  bigRight: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    minWidth: 56,
    gap: 8,
  },
  priceText: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "900",
    fontSize: 12,
  },
  moreText: {
    color: "rgba(255,255,255,0.90)",
    fontWeight: "900",
    fontSize: 12,
  },
});
