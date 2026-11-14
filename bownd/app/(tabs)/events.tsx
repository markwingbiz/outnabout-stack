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
  Linking,
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
import { categoryForText } from "../../lib/placeholders";
import { SceneEventCard, VenueTile, usePremiumFonts, venueMetaFor } from "../ui/premium";
import {
  BottomNav,
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

// Category chips (premium pass, from the approved mockup): All, Music,
// Nightlife, Food & Drink, Holiday, Family. An event's category comes
// from the app's own keyword categorization of its title + tags, with
// holiday detected first (NYE/Christmas titles often categorize as
// nightlife/music otherwise). Events outside these buckets (arts,
// default) appear under "All".
type CategoryChip = "all" | "music" | "nightlife" | "food" | "holiday" | "family";

const CATEGORY_CHIPS: Array<{ key: CategoryChip; label: string }> = [
  { key: "all", label: "All" },
  { key: "music", label: "Music" },
  { key: "nightlife", label: "Nightlife" },
  { key: "food", label: "Food & Drink" },
  { key: "holiday", label: "Holiday" },
  { key: "family", label: "Family" },
];

function eventCategoryKey(e: EventItem): string {
  const hay = [e.title, ...(e.vibeTags || []), ...(e.audienceTags || [])]
    .join(" ")
    .toLowerCase();
  if (/(holiday|nye|new year|christmas|xmas)/.test(hay)) return "holiday";
  return categoryForText(e.title, ...(e.vibeTags || []), ...(e.audienceTags || []));
}

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
function matchesVenueFilter(
  e: EventItem,
  venueId: string | null,
  venueName: string | null,
  venues: Venue[]
): boolean {
  if (!venueId && !venueName) return true;
  // Exact id match first: the id is unambiguous even when two venues
  // share a name or the event carries a legacy venue name.
  if (venueId && e.venueId.toLowerCase() === venueId.toLowerCase()) return true;
  if (venueName) {
    const want = venueName.toLowerCase();
    if (getVenueName(e.venueId, venues).toLowerCase() === want) return true;
    if (e.venueId.toLowerCase() === want) return true;
  }
  return false;
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
// Premium pass: it floats on the card photo's top-right corner via
// SceneEventCard's accessory slot.
function FavButton({ isFav, onToggle }: { isFav: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} hitSlop={8} style={styles.favBtn}>
      <Ionicons
        name={isFav ? "heart" : "heart-outline"}
        size={19}
        color={isFav ? "#ff5c8a" : "#fff"}
      />
    </TouchableOpacity>
  );
}

export default function EventsScreen() {
  const router = useRouter();
  const fonts = usePremiumFonts();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; venue?: string; venueId?: string }>();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [venueFilter, setVenueFilter] = useState<string | null>(null);
  const [venueIdFilter, setVenueIdFilter] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaProfile>(DEFAULT_PERSONA);
  const [timeChip, setTimeChip] = useState<TimeChip>("tonight");
  const [categoryFilter, setCategoryFilter] = useState<CategoryChip>("all");
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
    // Pass the viewer's email so operator-only test items are visible
    // only to the operator (store.ts filters for everyone else).
    Promise.all([fetchEvents(user?.email ?? null), fetchVenues(user?.email ?? null)]).then(([rows, venueRows]) => {
      if (alive) {
        setEvents(rows);
        setVenues(venueRows);
      }
    });
    return () => {
      alive = false;
    };
  }, [user?.email]);

  // Wholesale showcase fallback: demo only when the real catalog is
  // completely empty. Never mixed with real data.
  const usingDemo = events.length === 0 && venues.length === 0;
  const effEvents = usingDemo ? getShowcaseEvents() : events;
  const effVenues = usingDemo ? getShowcaseVenues() : venues;

  // Incoming params (Home search, venue cards, Personal favorites,
  // detail "See venue events"). Venue navigation passes the venue's
  // Firestore id + display name. Arriving with a venue filter resets
  // the time chip to "all": the user asked for THIS venue's events,
  // and the tonight chip would otherwise zero the list ("No events
  // match your filters") even when the venue has events this week.
  useEffect(() => {
    if (typeof params.q === "string" && params.q.trim()) setQuery(params.q);
    if (typeof params.venue === "string" && params.venue.trim()) {
      setVenueFilter(params.venue);
      setTimeChip("all");
    }
    if (typeof params.venueId === "string" && params.venueId.trim())
      setVenueIdFilter(params.venueId);
  }, [params.q, params.venue, params.venueId]);

  function go(route: string) {
    router.replace(route);
  }

  function openEvent(id: string) {
    router.push({ pathname: "/detail", params: { id, kind: "event" } });
  }

  // Discovered (web-sourced) events are LINK-OUT ONLY: tapping the card
  // opens the event at its source in the browser. Bownd never tickets,
  // sells, or redeems them, so they never enter the in-app detail flow
  // from the list. No sourceUrl = no dead button: fall back to detail,
  // which renders the "From the web" label with no action affordance.
  function openExternal(item: EventItem) {
    if (!item.sourceUrl) {
      openEvent(item.id);
      return;
    }
    Linking.openURL(item.sourceUrl).catch(() => {
      Alert.alert("Cannot open link", "Something went wrong opening that website.");
    });
  }

  function openVenue(id: string) {
    // Venue tiles open the venue PAGE (detail.tsx kind=venue), which
    // lists that venue's upcoming events. (The in-place venue filter
    // below still serves deep links that arrive with venue params.)
    router.push({ pathname: "/detail", params: { id, kind: "venue" } });
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

  // Spotlight + Tailored are curated placement rails: discovered
  // (link-out-only) events are excluded from both. They appear ONLY in
  // the All Events list below.
  const spotlight = useMemo(() => {
    return effEvents
      .filter((e) => !e.discovered)
      .filter((e) => e.category === "spotlight")
      .filter((e) => inTimeWindow(e, "week"))
      .slice(0, 10);
  }, [effEvents]);

  const tailored = useMemo(() => {
    return effEvents
      .filter((e) => !e.discovered)
      .filter((e) => inTimeWindow(e, "week"))
      .filter((e) => matchesPersona(e, persona))
      .slice(0, 10);
  }, [persona, effEvents]);

  const topVenues = useMemo(() => {
    return effVenues.slice(0, 10);
  }, [effVenues]);

  const allEvents = useMemo(() => {
    const base = effEvents
      .filter((e) => inTimeWindow(e, timeChip))
      .filter((e) => matchesSearch(e, getVenueName(e.venueId, effVenues), query))
      .filter((e) => matchesVenueFilter(e, venueIdFilter, venueFilter, effVenues))
      .filter((e) => categoryFilter === "all" || eventCategoryKey(e) === categoryFilter);
    const personaFiltered = personalizedOn ? base.filter((e) => matchesPersona(e, persona)) : base;
    return [...personaFiltered].sort((a, b) => {
      const da = parseISO(a.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseISO(b.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [persona, personalizedOn, query, timeChip, categoryFilter, effEvents, venueFilter, venueIdFilter, effVenues]);

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
        <StatusBar barStyle="light-content" backgroundColor="#0A0616" />
        <Search value={query} onChange={setQuery} placeholder="Explore events, venues, vibes..." />
        <TopTabs active="Events" onNavigate={go} />

        <Text style={[refStyles.pageTitle, fonts.display]}>Events</Text>
        <Text style={[refStyles.subtitle, fonts.bodySemiBold]}>{headerSubtitle}</Text>

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

        {/* Category chips (premium pass) — filter the All Events list */}
        <View style={refStyles.filterWrap}>
          {CATEGORY_CHIPS.map((c) => (
            <Pill
              key={c.key}
              label={c.label}
              active={categoryFilter === c.key}
              onPress={() => setCategoryFilter(c.key)}
            />
          ))}
        </View>

        {/* Venue filter chip */}
        {!!(venueFilter || venueIdFilter) && (
          <View style={styles.venueFilterRow}>
            <Text style={styles.venueFilterText} numberOfLines={1}>
              Venue: {venueFilter ?? venueIdFilter}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setVenueFilter(null);
                setVenueIdFilter(null);
              }}
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
              <SceneEventCard
                key={item.id}
                title={item.title}
                venueName={getVenueName(item.venueId, effVenues)}
                whenLabel={formatWhen(item.startISO)}
                badge={item.isTest ? "Test" : undefined}
                priceLabel={item.priceLabel || undefined}
                photoUrl={item.photoUrl}
                tags={uniq([...(item.vibeTags || []), ...(item.audienceTags || [])]).slice(0, 3)}
                onPress={() => openEvent(item.id)}
                style={styles.tailoredCard}
              />
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

        {/* Top Venues rail */}
        <Section
          title="Top Venues"
          subtitle="Great places right now"
          onPress={() => setVenuesOpen((v) => !v)}
        />
        {venuesOpen && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {topVenues.map((v) => (
              <VenueTile
                key={v.id}
                name={v.name}
                meta={venueMetaFor(v.name)}
                photoUrl={v.photoUrl}
                verified={v.verified}
                isTest={v.isTest}
                featured={v.featured}
                onPress={() => openVenue(v.id)}
                style={{ marginRight: 12 }}
              />
            ))}
          </ScrollView>
        )}

        {/* All Events list — premium scene-photo cards. Discovered
            events keep their link-out behavior + "From the web" label;
            the favorite heart floats on the photo (card accessory). */}
        <Section title="All Events" subtitle="Full list" />
        {allEvents.length === 0 ? (
          <Text style={styles.emptyText}>
            {effEvents.length === 0
              ? "No events yet — check back soon."
              : categoryFilter !== "all"
                ? "Nothing in this filter tonight — try another."
                : "No events match your filters."}
          </Text>
        ) : (
          allEvents.map((item) => (
            <SceneEventCard
              key={item.id}
              title={item.title}
              venueName={getVenueName(item.venueId, effVenues)}
              whenLabel={formatWhen(item.startISO)}
              badge={item.isTest ? "Test" : undefined}
              webBadge={
                item.discovered
                  ? `From the web${item.sourceName ? ` · ${item.sourceName}` : ""} — view at source ↗`
                  : undefined
              }
              priceLabel={item.priceLabel || undefined}
              photoUrl={item.photoUrl}
              tags={uniq([...(item.vibeTags || []), ...(item.audienceTags || [])]).slice(0, 4)}
              onPress={() => (item.discovered ? openExternal(item) : openEvent(item.id))}
              accessory={
                <FavButton
                  isFav={favKeys.has(`event:${item.id}`)}
                  onToggle={() => onToggleFav(item)}
                />
              }
            />
          ))
        )}
      </ScrollView>
      <View style={{ backgroundColor: "#171129", paddingBottom: insets.bottom }}>
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
  testBadgeText: {
    color: "#f5c36a",
    fontWeight: "900",
    fontSize: 11,
    marginTop: 4,
  },
  webBadgeText: {
    color: "#8ec5ff",
    fontWeight: "900",
    fontSize: 11,
    marginTop: 4,
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
  tailoredBg: { flex: 1, borderRadius: 17 },
  tailoredContent: { padding: 13 },
  venueRailCard: {
    width: 190,
    marginRight: 12,
    marginBottom: 0,
    minHeight: 110,
  },
  venueRailContent: { padding: 13, justifyContent: "space-between" },
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
    backgroundColor: "rgba(7,8,15,0.55)",
    borderRadius: 999,
    padding: 7,
  },
  bigRow: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 10,
  },
  bigRowContent: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 14,
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
