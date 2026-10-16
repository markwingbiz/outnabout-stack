// app/(tabs)/events.tsx
// Bownd recreate restyle (Events screen) — layout/styles match the reference
// mockup via the shared design system in app/ui/recreate.tsx. Behavior is
// preserved from the pre-restyle screen:
// - Event cards navigate to the real detail screen
//   (/detail?id=...&kind=event). Venue cards filter Events to that venue.
// - Section chevrons collapse/expand their section.
// - Favorite toggle (heart) on every event card, wired to
//   toggleFavorite() in lib/store.ts.
// - Accepts params { q, venue } (from Home search + venue orbs +
//   Personal favorite venues) and applies them as filters, with a
//   visible "Venue: X" chip that can be cleared.
// - Top nav + Change Persona point at the canonical (tabs) routes.
// - Events + venues come from Firestore ONLY. No bundled demo fallback:
//   an empty catalog shows "No events yet", never demo events.
// - Spotlight hero uses the shared PhotoCard gradient placeholder —
//   mockup photos are baked into the reference JPG at low resolution
//   and cannot be extracted. Never present it as a real photo.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  FlatList,
  StatusBar,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";

import { loadPersona, PersonaProfile, DEFAULT_PERSONA } from "../../lib/personaStore";
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
import {
  SearchBar,
  SegmentedTabs,
  BottomNav,
  FilterPill,
  TagPill,
  PhotoCard,
  rc,
  rr,
  rs,
  rtype,
  rshadow,
  type TabKey,
} from "../ui/recreate";

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
function parseISO(iso: string) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}
function nextSaturday(from: Date) {
  const d = new Date(from);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (6 - day + 7) % 7; // days until Sat
  return startOfDay(addDays(d, diff));
}
function nextSunday(from: Date) {
  const d = new Date(from);
  const day = d.getDay();
  const diff = (0 - day + 7) % 7; // days until Sun
  return startOfDay(addDays(d, diff));
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function formatWhen(startISO: string) {
  const d = parseISO(startISO);
  if (!d) return "Time TBD";
  const now = new Date();
  const today = startOfDay(now).getTime();
  const that = startOfDay(d).getTime();
  const diffDays = Math.round((that - today) / (1000 * 60 * 60 * 24));
  const hh = d.getHours();
  const mm = d.getMinutes();
  const ampm = hh >= 12 ? "PM" : "AM";
  const hr = hh % 12 || 12;
  const min = mm.toString().padStart(2, "0");
  const time = `${hr}:${min} ${ampm}`;

  if (diffDays === 0) return `Tonight • ${time}`;
  if (diffDays === 1) return `Tomorrow • ${time}`;
  const m = d.toLocaleString(undefined, { month: "short" });
  const day = d.getDate();
  return `${m} ${day} • ${time}`;
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
    const end = endOfDay(now).getTime();
    return t <= end;
  }

  if (mode === "tomorrow") {
    const tomorrow = addDays(now, 1);
    const s = startOfDay(tomorrow).getTime();
    const eod = endOfDay(tomorrow).getTime();
    return t >= s && t <= eod;
  }

  if (mode === "weekend") {
    const sat = nextSaturday(now);
    const sun = nextSunday(now);
    const s = sat.getTime();
    const eodSun = endOfDay(sun).getTime();
    // If it's already weekend, include from now through Sunday end
    const isWeekendNow = [0, 6].includes(now.getDay());
    if (isWeekendNow) {
      const end = endOfDay(nextSunday(now)).getTime();
      return t >= n && t <= end;
    }
    return t >= s && t <= eodSun;
  }

  // week
  const end7 = addDays(now, 7).getTime();
  return t >= n && t <= end7;
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
  // Keep it forgiving: match the stored audience + vibe against the event's tags.
  // (If persona has none, allow all.)
  // NOTE: personaStore persists singular `audience`/`vibe` — not tag arrays.
  const pAudience = persona?.audience ? [persona.audience.toLowerCase()] : [];
  const pVibes = persona?.vibe ? [persona.vibe.toLowerCase()] : [];

  const eAudience = (e.audienceTags || []).map((s) => s.toLowerCase());
  const eVibes = (e.vibeTags || []).map((s) => s.toLowerCase());

  const audienceOK = pAudience.length === 0 ? true : pAudience.some((a) => eAudience.includes(a));
  const vibeOK = pVibes.length === 0 ? true : pVibes.some((v) => eVibes.includes(v));

  if (pAudience.length > 0 && pVibes.length > 0) return audienceOK && vibeOK;
  return audienceOK && vibeOK;
}

// Favorite heart. Rendered as a SIBLING of the card Pressable (not
// nested inside it) so tapping the heart never also opens the detail.
function FavButton({ isFav, onToggle }: { isFav: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} hitSlop={8} style={styles.favBtn}>
      <Text style={styles.favBtnText}>{isFav ? "♥" : "♡"}</Text>
    </Pressable>
  );
}

function MiniEventCard({
  item,
  venueName,
  isFav,
  onToggleFav,
  onOpen,
}: {
  item: EventItem;
  venueName: string;
  isFav: boolean;
  onToggleFav: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.miniCard}>
      <Pressable onPress={onOpen} style={StyleSheet.absoluteFill} />
      <Text style={styles.miniWhen}>{formatWhen(item.startISO)}</Text>
      <Text style={styles.miniTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.miniVenue} numberOfLines={1}>
        {venueName}
      </Text>
      <View style={styles.tagRow}>
        {uniq([...(item.vibeTags || []), ...(item.audienceTags || [])])
          .slice(0, 3)
          .map((t) => (
            <TagPill key={`${item.id}_${t}`} label={t} />
          ))}
      </View>
      <FavButton isFav={isFav} onToggle={onToggleFav} />
    </View>
  );
}

function VenueCard({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <Pressable style={styles.venueCard} onPress={onOpen}>
      <Text style={styles.venueName} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.venueMeta}>Top venue • Tap to view</Text>
    </Pressable>
  );
}

export default function EventsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; venue?: string }>();
  const { user } = useAuth();

  // Explore
  const [query, setQuery] = useState("");

  // Venue filter (from Home orbs / Personal favorite venues)
  const [venueFilter, setVenueFilter] = useState<string | null>(null);

  // Persona
  const [persona, setPersona] = useState<PersonaProfile>(DEFAULT_PERSONA);

  // Chips behavior
  const [timeChip, setTimeChip] = useState<TimeChip>("tonight");
  // Mockup default: Personalized selected. matchesPersona allows all when
  // the persona has no audience/vibe set, so this is safe with no persona.
  const [personalizedOn, setPersonalizedOn] = useState<boolean>(true);

  // Collapsible sections (chevrons toggle these)
  const [tailoredOpen, setTailoredOpen] = useState(true);
  const [spotlightOpen, setSpotlightOpen] = useState(true);
  const [venuesOpen, setVenuesOpen] = useState(true);

  // Favorites (Set of `event:<id>`)
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

  // Events + venues come from Firestore only (no bundled demo fallback).
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

  // Incoming params (Home search, venue orbs, Personal favorites).
  useEffect(() => {
    if (typeof params.q === "string" && params.q.trim()) setQuery(params.q);
    if (typeof params.venue === "string" && params.venue.trim()) setVenueFilter(params.venue);
  }, [params.q, params.venue]);

  const venueNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of venues) {
      map.set(v.id, v.name);
      map.set(v.name, v.name);
    }
    return map;
  }, [venues]);

  function venueNameFor(e: EventItem): string {
    return venueNameById.get(e.venueId) ?? (e.venueId || "Venue");
  }

  function goTab(t: TabKey) {
    if (t === "home") router.replace("/(tabs)/home");
    else if (t === "personal") router.replace("/(tabs)/personal");
    else router.replace("/(tabs)/events");
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
      subtitle: venueNameFor(item),
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
    return events.filter((e) => e.category === "spotlight")
      .filter((e) => inTimeWindow(e, "week"))
      .slice(0, 10);
  }, [events]);

  const tailored = useMemo(() => {
    return events.filter((e) => inTimeWindow(e, "week"))
      .filter((e) => matchesPersona(e, persona))
      .slice(0, 10);
  }, [persona, events]);

  const topVenues = useMemo(() => {
    return venues.map((v) => v.name).slice(0, 10);
  }, [venues]);

  const allEvents = useMemo(() => {
    const base = events
      .filter((e) => inTimeWindow(e, timeChip))
      .filter((e) => matchesSearch(e, venueNameFor(e), query))
      .filter((e) =>
        venueFilter
          ? venueNameFor(e).toLowerCase() === venueFilter.toLowerCase() ||
            e.venueId.toLowerCase() === venueFilter.toLowerCase()
          : true
      );

    const personaFiltered = personalizedOn ? base.filter((e) => matchesPersona(e, persona)) : base;

    return [...personaFiltered].sort((a, b) => {
      const da = parseISO(a.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseISO(b.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona, personalizedOn, query, timeChip, events, venueFilter, venues]);

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

  const Header = (
    <View style={styles.headerWrap}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Explore events, venues, vibes..."
      />

      {/* Segmented tabs: Home | Events (selected) | Personal */}
      <View style={styles.segWrap}>
        <SegmentedTabs active="events" onSelect={goTab} />
      </View>

      {/* Venue filter chip (from Home orbs / Personal favorites) */}
      {!!venueFilter && (
        <View style={styles.venueFilterRow}>
          <Text style={styles.venueFilterText} numberOfLines={1}>
            Venue: {venueFilter}
          </Text>
          <Pressable onPress={() => setVenueFilter(null)} hitSlop={8}>
            <Text style={styles.venueFilterClear}>✕ Clear</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.pageTitle}>Events</Text>
      <Text style={styles.pageSub}>{headerSubtitle}</Text>

      {/* Filter pills row 1: Tonight | Tomorrow | Weekend */}
      <View style={styles.filterRow}>
        <FilterPill label="Tonight" selected={timeChip === "tonight"} onPress={() => setTimeChip("tonight")} />
        <FilterPill label="Tomorrow" selected={timeChip === "tomorrow"} onPress={() => setTimeChip("tomorrow")} />
        <FilterPill label="Weekend" selected={timeChip === "weekend"} onPress={() => setTimeChip("weekend")} />
      </View>

      {/* Filter pills row 2: This Week */}
      <View style={styles.filterRow}>
        <FilterPill label="This Week" selected={timeChip === "week"} onPress={() => setTimeChip("week")} />
      </View>

      {/* Personalized | All + right-aligned Change persona */}
      <View style={styles.personaRow}>
        <FilterPill
          label="Personalized"
          selected={personalizedOn}
          onPress={() => setPersonalizedOn((v) => !v)}
        />
        <FilterPill
          label="All"
          selected={timeChip === "all" && !personalizedOn}
          onPress={() => {
            setTimeChip("all");
            setPersonalizedOn(false);
          }}
        />
        <View style={styles.changePersonaWrap}>
          <Pressable onPress={() => router.push("/(tabs)/persona")} style={styles.changePersonaBtn}>
            <Text style={styles.changePersonaText}>Change persona</Text>
          </Pressable>
        </View>
      </View>

      {/* Sections */}
      <SectionTitle
        title="Tailored For You"
        subtitle="Based on your persona"
        open={tailoredOpen}
        onToggle={() => setTailoredOpen((v) => !v)}
      />
      {tailoredOpen && (
        <FlatList
          data={tailored}
          keyExtractor={(i) => i.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 10, paddingRight: 16 }}
          renderItem={({ item }) => (
            <MiniEventCard
              item={item}
              venueName={venueNameFor(item)}
              isFav={favKeys.has(`event:${item.id}`)}
              onToggleFav={() => onToggleFav(item)}
              onOpen={() => openEvent(item.id)}
            />
          )}
        />
      )}

      <SectionTitle
        title="Spotlight Events"
        subtitle="Hand-picked experiences"
        open={spotlightOpen}
        onToggle={() => setSpotlightOpen((v) => !v)}
      />
      {spotlightOpen && (
        <View>
          {spotlight.length > 0 && (
            <View style={styles.spotlightHeroWrap}>
              <PhotoCard
                title={spotlight[0].title}
                subtitle={venueNameFor(spotlight[0])}
                badge={`★ ${formatWhen(spotlight[0].startISO).split(" • ")[0]}`}
                gradient={["#7C3AED", "#140B2A"]}
                height={220}
                onPress={() => openEvent(spotlight[0].id)}
              />
              <FavButton
                isFav={favKeys.has(`event:${spotlight[0].id}`)}
                onToggle={() => onToggleFav(spotlight[0])}
              />
            </View>
          )}
          <FlatList
            data={spotlight.slice(1)}
            keyExtractor={(i) => i.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 10, paddingRight: 16 }}
            renderItem={({ item }) => (
              <MiniEventCard
                item={item}
                venueName={venueNameFor(item)}
                isFav={favKeys.has(`event:${item.id}`)}
                onToggleFav={() => onToggleFav(item)}
                onOpen={() => openEvent(item.id)}
              />
            )}
          />
        </View>
      )}

      <SectionTitle
        title="Top Venues"
        subtitle="Great places right now"
        open={venuesOpen}
        onToggle={() => setVenuesOpen((v) => !v)}
      />
      {venuesOpen && (
        <FlatList
          data={topVenues}
          keyExtractor={(x, idx) => `${x}_${idx}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 10, paddingRight: 16 }}
          renderItem={({ item }) => <VenueCard name={String(item)} onOpen={() => openVenue(String(item))} />}
        />
      )}

      <SectionTitle title="All Events" subtitle="Full list" open alwaysOpen />
      <View style={{ height: 8 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.bg}>
        <FlatList
          data={allEvents}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: rs.page, paddingTop: 12 }}>
              <Text style={styles.emptyText}>
                {events.length === 0
                  ? "No events yet — check back soon."
                  : "No events match your filters."}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: rs.page, paddingBottom: 10 }}>
              <BigEventRow
                item={item}
                venueName={venueNameFor(item)}
                isFav={favKeys.has(`event:${item.id}`)}
                onToggleFav={() => onToggleFav(item)}
                onOpen={() => openEvent(item.id)}
              />
            </View>
          )}
        />
        <BottomNav active="events" onSelect={goTab} />
      </View>
    </SafeAreaView>
  );
}

function SectionTitle({
  title,
  subtitle,
  open,
  onToggle,
  alwaysOpen,
}: {
  title: string;
  subtitle?: string;
  open?: boolean;
  onToggle?: () => void;
  alwaysOpen?: boolean;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
      </View>
      {!alwaysOpen && (
        <Pressable onPress={onToggle} hitSlop={8} style={styles.sectionChevronBtn}>
          <Text style={styles.sectionChevron}>{open ? "˄" : "›"}</Text>
        </Pressable>
      )}
    </View>
  );
}

function BigEventRow({
  item,
  venueName,
  isFav,
  onToggleFav,
  onOpen,
}: {
  item: EventItem;
  venueName: string;
  isFav: boolean;
  onToggleFav: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.bigRow}>
      <Pressable onPress={onOpen} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1 }}>
        <Text style={styles.bigWhen}>{formatWhen(item.startISO)}</Text>
        <Text style={styles.bigTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.bigVenue} numberOfLines={1}>
          {venueName}
        </Text>
        <View style={styles.tagRow}>
          {uniq([...(item.vibeTags || []), ...(item.audienceTags || [])])
            .slice(0, 4)
            .map((t) => (
              <TagPill key={`${item.id}_big_${t}`} label={t} />
            ))}
        </View>
      </View>

      <View style={styles.bigRight}>
        <Text style={styles.priceText}>{item.priceLabel || ""}</Text>
        <Text style={styles.moreText}>View</Text>
      </View>
      <FavButton isFav={isFav} onToggle={onToggleFav} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: rc.bg },
  bg: { flex: 1, backgroundColor: rc.bg },

  headerWrap: { paddingHorizontal: rs.page, paddingTop: 10 },
  segWrap: { marginTop: 12 },
  pageTitle: { ...rtype.display, color: rc.text, marginTop: 18 },
  pageSub: { ...rtype.small, color: rc.subtext, marginTop: 4 },

  filterRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  personaRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  changePersonaWrap: { marginLeft: "auto" },
  changePersonaBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: rr.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: rc.border,
  },
  changePersonaText: { color: rc.text, fontWeight: "700", fontSize: 13 },

  // Venue filter chip
  venueFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: rr.cardSm,
    backgroundColor: rc.surfaceStrong,
    borderWidth: 1,
    borderColor: rc.border,
    marginTop: 12,
  },
  venueFilterText: {
    flex: 1,
    color: rc.text,
    fontWeight: "800",
    fontSize: 13,
  },
  venueFilterClear: {
    color: rc.subtext,
    fontWeight: "900",
    fontSize: 13,
  },

  emptyText: {
    color: rc.subtext,
    fontSize: 14,
    fontWeight: "800",
  },

  // Sections
  sectionTitleRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: { ...rtype.section, color: rc.text },
  sectionSub: { ...rtype.caption, color: rc.muted, marginTop: 2 },
  sectionChevronBtn: {
    padding: 4,
    marginLeft: 4,
  },
  sectionChevron: {
    color: rc.muted,
    fontSize: 26,
    marginLeft: 4,
    transform: [{ translateY: -1 }],
  },

  // Dark event cards (Tailored rail, Spotlight rail, All Events rows)
  miniCard: {
    width: 220,
    marginRight: 12,
    borderRadius: rr.card,
    overflow: "hidden",
    padding: rs.md,
    borderWidth: 1,
    borderColor: rc.border,
    backgroundColor: "#171126",
    ...rshadow.soft,
  },
  miniWhen: {
    ...rtype.caption,
    color: rc.subtext,
    fontWeight: "700",
  },
  miniTitle: {
    marginTop: 6,
    color: rc.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  miniVenue: {
    marginTop: 6,
    color: rc.muted,
    fontSize: 12,
    fontWeight: "500",
  },

  // Favorite heart (sibling of the card pressable, top-right)
  favBtn: {
    position: "absolute",
    top: 8,
    right: 10,
    padding: 4,
  },
  favBtnText: {
    color: rc.text,
    fontSize: 20,
    fontWeight: "900",
  },

  // Spotlight hero photo card
  spotlightHeroWrap: {
    position: "relative",
    marginTop: 10,
  },

  // Venue cards
  venueCard: {
    width: 190,
    marginRight: 12,
    borderRadius: rr.card,
    overflow: "hidden",
    padding: rs.md,
    borderWidth: 1,
    borderColor: rc.border,
    backgroundColor: "#171126",
    justifyContent: "space-between",
    ...rshadow.soft,
  },
  venueName: {
    color: rc.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  venueMeta: {
    marginTop: 10,
    color: rc.muted,
    fontSize: 12,
    fontWeight: "500",
  },

  // Tags (row layout only — pill visuals come from shared TagPill)
  tagRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  // Big list rows (All Events)
  bigRow: {
    borderRadius: rr.card,
    overflow: "hidden",
    padding: rs.md,
    borderWidth: 1,
    borderColor: rc.border,
    backgroundColor: "#171126",
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    ...rshadow.soft,
  },
  bigWhen: {
    ...rtype.caption,
    color: rc.subtext,
    fontWeight: "700",
  },
  bigTitle: {
    marginTop: 6,
    color: rc.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  bigVenue: {
    marginTop: 6,
    color: rc.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  bigRight: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    minWidth: 56,
    gap: 8,
  },
  priceText: {
    color: rc.subtext,
    fontWeight: "700",
    fontSize: 12,
  },
  moreText: {
    color: rc.text,
    fontWeight: "700",
    fontSize: 12,
  },
});
