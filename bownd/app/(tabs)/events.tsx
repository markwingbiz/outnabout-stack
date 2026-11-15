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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Alert,
  Image,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { loadPersona, type PersonaProfile, DEFAULT_PERSONA } from "../../lib/personaStore";
import { loadBehavior, recordBehavior, type BehaviorAction } from "../../lib/behavior";
import {
  loadViewPrefs,
  passesViewPrefs,
  DEFAULT_VIEW_PREFS,
  type ViewPrefs,
} from "../../lib/viewPrefs";
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
import { track } from "../../lib/analytics";
import { getShowcaseEvents, getShowcaseVenues } from "../../data/showcase";
import { categoryForText, resolveEventCardImage } from "../../lib/placeholders";
import { VenueTile, usePremiumFonts, venueMetaFor } from "../ui/premium";
import { premium } from "../ui/theme";
import {
  BottomNav,
  Search,
  Section,
  formatWhen,
  getVenueName,
  parseISO,
  refStyles,
} from "../ui/reference";

type TimeChip = "tonight" | "tomorrow" | "weekend" | "week" | "all";

// Categories (premium pass, from the approved mockup): All Events,
// Music, Nightlife, Food & Drink, Holiday, Family. Owner revision 2026-11-15:
// the categories LEAD the header as the segmented bar, so the button
// rows unclog — this table now feeds the bar instead of a pill row.
// An event's category comes from the app's own keyword categorization
// of its title + tags, with holiday detected first (NYE/Christmas
// titles often categorize as nightlife/music otherwise). Events
// outside these buckets (arts, default) appear under "All".
type CategoryChip = "all" | "music" | "nightlife" | "food" | "holiday" | "family";

// barFlex = each segment's flex weight in the segmented bar,
// sized from the labels' measured widths (Manrope ExtraBold at
// 12.5px + segment padding + headroom) so every label renders in
// full at the standard 390px width: equal segments ellipsized the
// long labels, and a length formula understates "Food & Drink"
// (wide glyphs: capitals + "&"). The six labels are a fixed set,
// so their weights are fixed with them.
const CATEGORY_CHIPS: Array<{ key: CategoryChip; label: string; barFlex: number }> = [
  // The all-categories segment is labeled "All Events" (owner
  // update 2026-11-15); its state key stays "all" — it is the
  // starting default and means "no category filter".
  { key: "all", label: "All Events", barFlex: 70 },
  { key: "music", label: "Music", barFlex: 41 },
  { key: "nightlife", label: "Nightlife", barFlex: 62 },
  { key: "food", label: "Food & Drink", barFlex: 89 },
  { key: "holiday", label: "Holiday", barFlex: 51 },
  { key: "family", label: "Family", barFlex: 45 },
];

// Time filter options. Owner revision 2026-11-15: time slimmed down
// to ONE quiet row of plain text tabs under the category bar (in the
// first Events pass it was the segmented bar; the categories took
// that slot to unclog the button choices). Same TimeChip values,
// same order, same filter logic — time and category still combine
// (AND) exactly as before.
const TIME_SEGMENTS: Array<{ key: TimeChip; label: string }> = [
  { key: "tonight", label: "Tonight" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "Weekend" },
  { key: "week", label: "This Week" },
  { key: "all", label: "All" },
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
  // All Persona (audience "all") = no narrowing: everything matches
  // (owner model 2026-11-15 — every chooser's All is an All).
  if (persona?.audience === "all") return true;
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
// Visual pass: the mockup's .heart — a 32px circle in surface2 with a
// hairline border; on-state is the mockup's rose (#ff5d7e) on its
// tint. It floats on the card photo's top-right corner via
// EventStripCard's accessory slot (the mockup sets it in the caption
// row; the float keeps the sibling-pressable guarantee).
function FavButton({ isFav, onToggle }: { isFav: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      hitSlop={8}
      style={[styles.favBtn, isFav && styles.favBtnOn]}
    >
      <Ionicons
        name={isFav ? "heart" : "heart-outline"}
        size={16}
        color={isFav ? "#ff5d7e" : premium.muted}
      />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// EventStripCard — the Events page's own event card (owner picks
// 2026-11-15, options mockup B + picture-fit lab). SceneEventCard in
// ui/premium.tsx is SHARED with Home and stays untouched; this local
// variant changes exactly the two things the owner picked for Events:
//  - the photo is a CINEMATIC WIDE STRIP (full card width, short wide
//    crop — the lab's "Cinematic wide" spec: about a third shorter
//    than the standard 158 crop, strongest center crop), and
//  - the footer becomes the mockup B button row: a gold-outline
//    "Get tickets" button (mockup .btn-gold: transparent, champagne
//    gold text, 1.5px gold border) + a ghost "Details" button.
// Caption content (badge, title, meta, web badge, tags, price tier)
// matches SceneEventCard. The whole card is one pressable — the two
// "buttons" are its visual treatment, so tap behavior is identical
// to before; the favorite heart stays a sibling accessory so it
// never triggers the card press. Discovered (link-out) events keep
// their honesty: the gold button reads "View at source ↗", never
// "Get tickets" — Bownd does not sell them.
// ---------------------------------------------------------------------------
function EventStripCard({
  title,
  venueName,
  whenLabel,
  priceLabel,
  badge,
  webBadge,
  photoUrl,
  tags,
  discovered,
  onPress,
  accessory,
  style,
  photoHeight = 110,
}: {
  title: string;
  venueName: string;
  whenLabel: string;
  priceLabel?: string;
  badge?: string;
  webBadge?: string;
  photoUrl?: string;
  tags?: string[];
  discovered?: boolean;
  onPress: () => void;
  /** Floating control on the photo's top-right (e.g. favorite heart). */
  accessory?: React.ReactNode;
  style?: object;
  /** Strip height: 110 full-width cards, 96 in the 280-wide rail. */
  photoHeight?: number;
}) {
  const fonts = usePremiumFonts();
  const whenParts = whenLabel.split(" • ");
  const whenHead = whenParts[0];
  const whenTail = whenParts.slice(1).join(" • ");
  return (
    <View style={[styles.stripCard, style]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.88}>
        <Image
          source={resolveEventCardImage(photoUrl, title, venueName, ...(tags ?? []))}
          style={[styles.stripPhoto, { height: photoHeight }]}
          resizeMode="cover"
        />
        <View style={styles.stripCaption}>
          {!!badge && (
            <View style={styles.stripBadge}>
              <Text style={[styles.stripBadgeText, fonts.bodyExtraBold]}>{badge}</Text>
            </View>
          )}
          <Text style={[styles.stripTitle, fonts.displayBold]} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.stripMeta}>
            <Text style={[styles.stripMetaText, fonts.bodySemiBold]}>
              <Text style={[styles.stripMetaBold, fonts.bodyBold]}>{whenHead}</Text>
              {whenTail ? ` · ${whenTail}` : ""}
            </Text>
            <Text style={[styles.stripMetaText, fonts.bodySemiBold]} numberOfLines={1}>
              {venueName}
            </Text>
          </View>
          {!!webBadge && <Text style={[styles.stripWeb, fonts.bodyExtraBold]}>{webBadge}</Text>}
          {!!tags && tags.length > 0 && (
            <View style={styles.stripTags}>
              {tags.slice(0, 4).map((t) => (
                <View key={t} style={styles.stripTag}>
                  <Text style={[styles.stripTagText, fonts.bodyBold]}>{t}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.stripBtnRow}>
            <View style={styles.stripBtnGold}>
              <Text style={[styles.stripBtnGoldText, fonts.bodyExtraBold]} numberOfLines={1}>
                {discovered
                  ? "View at source ↗"
                  : priceLabel
                    ? `Get tickets · ${priceLabel}`
                    : "Get tickets"}
              </Text>
            </View>
            <View style={styles.stripBtnGhost}>
              <Text style={[styles.stripBtnGhostText, fonts.bodyExtraBold]}>Details</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
      {!!accessory && <View style={styles.stripAccessory}>{accessory}</View>}
    </View>
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

  // On-device behavior (views + saves) — the Tailored signal
  // (owner model 2026-11-15). Loaded on focus like persona, so a
  // detail view or a save from moments ago counts immediately.
  const [behavior, setBehavior] = useState<BehaviorAction[]>([]);

  // View controls (hide drug/sports/spicy, family-only) — set on
  // the persona screen, enforced on this page only.
  const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(DEFAULT_VIEW_PREFS);

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
      loadBehavior()
        .then((rows) => {
          if (alive) setBehavior(rows);
        })
        .catch(() => {});
      loadViewPrefs()
        .then((p) => {
          if (alive) setViewPrefs(p);
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
      // Behavior signal for Tailored (owner model 2026-11-15):
      // a save is the strongest on-device interest signal. Only
      // saves record — an unsave is not a behavior kind.
      if (nowFav) {
        void recordBehavior({
          kind: "save",
          eventId: item.id,
          venueId: item.venueId,
          category: eventCategoryKey(item),
        });
      }
    } catch {
      Alert.alert("Could not save favorite", "Try again.");
    }
  }

  // Spotlight + Tailored are curated placement rails: discovered
  // (link-out-only) events are excluded from both. They appear ONLY in
  // the All Events list below. BOTH rails also pass the view
  // controls (owner model 2026-11-15): a family-only user must not
  // meet spicy in Spotlight either — the control must not lie.
  const spotlight = useMemo(() => {
    return effEvents
      .filter((e) => !e.discovered)
      .filter((e) => e.category === "spotlight")
      .filter((e) => inTimeWindow(e, "week"))
      .filter((e) => passesViewPrefs(e, viewPrefs))
      .slice(0, 10);
  }, [effEvents, viewPrefs]);

  // Tailored For You (owner model 2026-11-15): REPEATS and
  // SUGGESTIONS from what this person views and saves on this
  // device — behavior, never the picked persona (persona shapes
  // only the All Events list below). Pool rules unchanged:
  // non-discovered, inside the week window, view-controls enforced.
  //   REPEATS:     upcoming events at venues the user has viewed
  //                or saved, strongest venue first.
  //   SUGGESTIONS: the rest of the pool, in the categories the
  //                behavior favors (most frequent first).
  // Saves weigh double — saving is a stronger signal than a view.
  // Zero behavior → the fallback: the pool soonest-first (a new
  // user's rail is simply what's on this week). Past events can
  // never enter the pool (the week window drops them), so an
  // already-viewed event is only ever resurfaced while upcoming.
  const tailored = useMemo(() => {
    const pool = effEvents
      .filter((e) => !e.discovered)
      .filter((e) => inTimeWindow(e, "week"))
      .filter((e) => passesViewPrefs(e, viewPrefs));
    const byStart = (a: EventItem, b: EventItem) => {
      const da = parseISO(a.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseISO(b.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    };
    if (behavior.length === 0) {
      return [...pool].sort(byStart).slice(0, 10);
    }
    const venueWeight = new Map<string, number>();
    const categoryWeight = new Map<string, number>();
    for (const action of behavior) {
      const w = action.kind === "save" ? 2 : 1;
      if (action.venueId) {
        venueWeight.set(action.venueId, (venueWeight.get(action.venueId) ?? 0) + w);
      }
      if (action.category) {
        categoryWeight.set(action.category, (categoryWeight.get(action.category) ?? 0) + w);
      }
    }
    const repeats = pool
      .filter((e) => (venueWeight.get(e.venueId) ?? 0) > 0)
      .sort(
        (a, b) =>
          (venueWeight.get(b.venueId) ?? 0) - (venueWeight.get(a.venueId) ?? 0) ||
          byStart(a, b),
      );
    const repeatIds = new Set(repeats.map((e) => e.id));
    const suggestions = pool
      .filter((e) => !repeatIds.has(e.id))
      .sort(
        (a, b) =>
          (categoryWeight.get(eventCategoryKey(b)) ?? 0) -
            (categoryWeight.get(eventCategoryKey(a)) ?? 0) || byStart(a, b),
      );
    return [...repeats, ...suggestions].slice(0, 10);
  }, [effEvents, behavior, viewPrefs]);

  const topVenues = useMemo(() => {
    return effVenues.slice(0, 10);
  }, [effVenues]);

  // All Events: time + search + venue + category filters combine
  // (AND), sorted by start. Owner model 2026-11-15: the persona
  // picked in Personal AUTO-APPLIES here — no toggle, no on-page
  // control (matchesPersona returns true for All Persona, so the
  // default narrows nothing) — and the view controls gate the
  // list too. Persona touches ONLY this page, and within it only
  // this list: Tailored is behavior, Spotlight is paid curation.
  const allEvents = useMemo(() => {
    const base = effEvents
      .filter((e) => inTimeWindow(e, timeChip))
      .filter((e) => matchesSearch(e, getVenueName(e.venueId, effVenues), query))
      .filter((e) => matchesVenueFilter(e, venueIdFilter, venueFilter, effVenues))
      .filter((e) => categoryFilter === "all" || eventCategoryKey(e) === categoryFilter)
      .filter((e) => matchesPersona(e, persona))
      .filter((e) => passesViewPrefs(e, viewPrefs));
    return [...base].sort((a, b) => {
      const da = parseISO(a.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseISO(b.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [query, timeChip, categoryFilter, effEvents, venueFilter, venueIdFilter, effVenues, persona, viewPrefs]);

  // First-party analytics: record settled searches (debounced, so a
  // row lands per search intent, not per keystroke) with the result
  // count — zero-result searches are unmet demand and matter as much
  // as hits. The count reflects the list as filtered on screen.
  const lastSearchRef = useRef<string | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const key = `${q.toLowerCase()}|${allEvents.length}`;
    if (lastSearchRef.current === key) return;
    const t = setTimeout(() => {
      lastSearchRef.current = key;
      void track("search", { meta: { query: q, result_count: allEvents.length } });
    }, 900);
    return () => clearTimeout(t);
  }, [query, allEvents.length]);

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
    // No mode segment: the Personalized/All events toggle is gone
    // (owner model 2026-11-15 — persona is picked in Personal,
    // never on this page), so the subtitle is just time · city.
    return `${timeLabel} · ${city}`;
  }, [timeChip]);

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
        <Search value={query} onChange={setQuery} placeholder="Search events, venues, neighborhoods" />

        <Text style={[refStyles.pageTitle, fonts.display]}>Events</Text>
        <Text style={[refStyles.subtitle, fonts.bodySemiBold]}>{headerSubtitle}</Text>

        {usingDemo && (
          <View style={styles.showcaseChip}>
            <Text style={styles.showcaseChipText}>Showcase preview · Sample listings</Text>
          </View>
        )}

        {/* Category filter: ONE segmented bar (mockup B .seg) —
            joined segments, selected = white with dark-plum text.
            Owner revision 2026-11-15: the CATEGORIES lead the bar
            (absorbing the old category pill row) so the button
            choices unclog. Same CategoryChip state + logic as the
            pill row it replaces; single-select, as before. Segment
            widths are weighted per label (barFlex in
            CATEGORY_CHIPS, from measured label widths): six real
            category labels cannot fit equal segments at a legible
            size, and adjustsFontSizeToFit does not run on
            Android/web, so equal segments ellipsized the long
            labels in the first v2 renders. */}
        <View style={styles.segBar}>
          {CATEGORY_CHIPS.map((c) => {
            const on = categoryFilter === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.segBtn, { flex: c.barFlex }, on && styles.segBtnOn]}
                onPress={() => setCategoryFilter(c.key)}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.segText, fonts.bodyExtraBold, on && styles.segTextOn]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Time filter: ONE slim row of plain text tabs directly
            under the bar (owner revision 2026-11-15) — no boxes, no
            pills; unselected = muted, selected = gold text with a
            small gold dot. Same TimeChip state, options, and logic
            as before; combines with the category bar (AND) exactly
            as the old stacked rows did. */}
        <View style={styles.timeRow}>
          {TIME_SEGMENTS.map((s) => {
            const on = timeChip === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={styles.timeTab}
                onPress={() => setTimeChip(s.key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.timeTabText, fonts.bodySemiBold, on && styles.timeTabTextOn]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
                <View style={[styles.timeDot, on && styles.timeDotOn]} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* No persona row: the Personalized/All pills and the
            Change persona pill are removed entirely (owner model
            2026-11-15 — persona is picked only in Personal and
            applies to this page automatically; tailoring comes
            from what people view and buy, not a picked persona). */}

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

        {/* Tailored For You — horizontal moving menu (owner
            revision 2026-11-15): a sideways-scrolling rail of the
            280-wide strip cards, snapping card-to-card (280 card +
            12 gap). Ignores search/timeChip, as before. */}
        <Section
          title="Tailored For You"
          subtitle="From your views and saves"
          onPress={() => setTailoredOpen((v) => !v)}
        />
        {tailoredOpen && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={292}
            decelerationRate="fast"
          >
            {tailored.map((item) => (
              <EventStripCard
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
                photoHeight={96}
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
            <EventStripCard
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
            <EventStripCard
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
              discovered={!!item.discovered}
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
      <View style={{ backgroundColor: "#0F0A1F", paddingBottom: insets.bottom }}>
        <BottomNav active="Events" onNavigate={go} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Segmented bar (mockup B .seg): joined bar on the card surface
  // with a hairline border, radius 12, segments 40 tall; selected
  // segment is white with dark-plum text (mockup verbatim). Since
  // the 2026-11-15 rework it carries the six CATEGORIES, so the
  // segment text runs slightly smaller and shrinks to fit
  // ("Food & Drink" is the long label).
  segBar: {
    flexDirection: "row",
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line2,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
  },
  segBtn: {
    // No flex here: each segment's flex is set inline from the
    // chip's barFlex weight (see CATEGORY_CHIPS).
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  segBtnOn: { backgroundColor: "#FFFFFF" },
  segText: { color: premium.muted, fontSize: 12.5, fontWeight: "800" },
  segTextOn: { color: "#17102B" },
  // Slim time row (owner revision 2026-11-15): plain text tabs
  // spread across the width directly under the category bar — no
  // boxes, no pills. Unselected = muted; selected = gold text with
  // a small gold dot under it (the dot slot is kept, transparent,
  // when unselected so the tabs never jump).
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  timeTab: { alignItems: "center", paddingVertical: 2 },
  timeTabText: { color: premium.muted, fontSize: 12.5, fontWeight: "600" },
  timeTabTextOn: { color: premium.gold },
  timeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    backgroundColor: "transparent",
  },
  timeDotOn: { backgroundColor: premium.gold },
  // EventStripCard — mirrors SceneEventCard's card + caption values;
  // only the photo (cinematic strip) and the footer (mockup B button
  // row) differ.
  stripCard: {
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 13,
  },
  stripPhoto: { width: "100%" },
  stripAccessory: { position: "absolute", top: 8, right: 8 },
  stripCaption: { paddingHorizontal: 15, paddingTop: 13, paddingBottom: 14 },
  stripBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(232,196,118,0.16)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  stripBadgeText: {
    color: premium.gold,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  stripTitle: { color: premium.ink, fontSize: 16.5, fontWeight: "700", lineHeight: 20 },
  stripMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 14,
    rowGap: 4,
    marginTop: 8,
    alignItems: "center",
  },
  stripMetaText: { color: premium.ink2, fontSize: 12.5, fontWeight: "600" },
  stripMetaBold: { color: premium.ink, fontWeight: "700" },
  stripWeb: { color: premium.link, fontSize: 11.5, fontWeight: "800", marginTop: 7 },
  stripTags: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  stripTag: {
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  stripTagText: { color: premium.ink2, fontSize: 12, fontWeight: "700" },
  // Mockup B .btnrow + .btn-gold + .btn-ghost (app tokens): gold
  // outline CTA flexes, ghost Details sits beside it; both 44 tall,
  // pill radius.
  stripBtnRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  stripBtnGold: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: premium.gold,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  stripBtnGoldText: { color: premium.gold, fontSize: 13.5, fontWeight: "800" },
  stripBtnGhost: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: premium.line2,
    backgroundColor: premium.surface2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  stripBtnGhostText: { color: premium.ink, fontSize: 13.5, fontWeight: "800" },
  venueFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
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
  emptyText: {
    color: premium.muted,
    fontSize: 13.5,
    fontWeight: "600",
    lineHeight: 20,
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
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
    alignItems: "center",
    justifyContent: "center",
  },
  favBtnOn: {
    backgroundColor: "rgba(255,93,126,0.12)",
    borderColor: "rgba(255,93,126,0.5)",
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
