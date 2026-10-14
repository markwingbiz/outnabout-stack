// app/(tabs)/events.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  TextInput,
  FlatList,
  Animated,
  Platform,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { EVENTS, EventItem } from "../../data/events";
import { VENUES } from "../../data/venues";
import { loadPersona, PersonaProfile, DEFAULT_PERSONA } from "../../lib/personaStore";
import { fetchEvents } from "../../lib/store";

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

function matchesSearch(e: EventItem, q: string) {
  if (!q.trim()) return true;
  const query = q.trim().toLowerCase();
  const venueName = typeof e.venueId === "string" ? e.venueId : "";
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

function TopNavButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.navBtn, active && styles.navBtnActive]}>
      <Text style={[styles.navBtnText, active && styles.navBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Chip({
  label,
  active,
  onPress,
  mode = "primary",
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  mode?: "primary" | "secondary";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        mode === "secondary" && styles.chipSecondary,
        active && styles.chipActive,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          mode === "secondary" && styles.chipTextSecondary,
          active && styles.chipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MiniEventCard({ item }: { item: EventItem }) {
  const venue = typeof item.venueId === "string" ? item.venueId : "Venue";
  return (
    <Pressable style={styles.miniCard}>
      <LinearGradient
        colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0.08)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.miniWhen}>{formatWhen(item.startISO)}</Text>
      <Text style={styles.miniTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.miniVenue} numberOfLines={1}>
        {venue}
      </Text>
      <View style={styles.tagRow}>
        {uniq([...(item.vibeTags || []), ...(item.audienceTags || [])])
          .slice(0, 3)
          .map((t) => (
            <View key={`${item.id}_${t}`} style={styles.tagPill}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
      </View>
    </Pressable>
  );
}

function VenueCard({ name }: { name: string }) {
  return (
    <Pressable style={styles.venueCard}>
      <LinearGradient
        colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.venueName} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.venueMeta}>Top venue • Tap to view</Text>
    </Pressable>
  );
}

export default function EventsScreen() {
  const router = useRouter();

  // Explore
  const [query, setQuery] = useState("");

  // Persona
  const [persona, setPersona] = useState<PersonaProfile>(DEFAULT_PERSONA);

  // Chips behavior
  const [timeChip, setTimeChip] = useState<TimeChip>("tonight");
  const [personalizedOn, setPersonalizedOn] = useState<boolean>(false);

  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      try {
        const p = await loadPersona();
        setPersona(p || DEFAULT_PERSONA);
      } catch {
        setPersona(DEFAULT_PERSONA);
      }
    })();
  }, []);

  // Events come from Firestore when configured, else the bundled data.
  const [events, setEvents] = useState<EventItem[]>(EVENTS);
  useEffect(() => {
    let alive = true;
    fetchEvents().then((rows) => {
      if (alive) setEvents(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 4200, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 4200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [drift]);

  const driftX = drift.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] });
  const driftY = drift.interpolate({ inputRange: [0, 1], outputRange: [8, -8] });
  const glowOpacity = drift.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.18] });

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
    const names =
      Array.isArray(VENUES) && VENUES.length
        ? VENUES.map((v: any) => (typeof v === "string" ? v : v?.name || v?.title || v?.id || "Venue"))
        : [];
    return names.slice(0, 10);
  }, []);

  const allEvents = useMemo(() => {
    const base = events.filter((e) => inTimeWindow(e, timeChip)).filter((e) => matchesSearch(e, query));

    const personaFiltered = personalizedOn ? base.filter((e) => matchesPersona(e, persona)) : base;

    return [...personaFiltered].sort((a, b) => {
      const da = parseISO(a.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseISO(b.startISO)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [persona, personalizedOn, query, timeChip, events]);

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
    <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
      {/* ✅ SEARCH BAR NOW ABOVE the Home/Events/Personal tabs */}
      <View style={styles.exploreWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Explore events, venues, vibes..."
          placeholderTextColor="rgba(255,255,255,0.55)"
          style={styles.exploreInput}
          returnKeyType="search"
        />
      </View>

      {/* Top nav row (Home / Events / Personal) */}
      <View style={styles.topNavRow}>
        <TopNavButton label="Home" onPress={() => router.replace("/")} />
        <TopNavButton label="Events" active onPress={() => router.replace("/events")} />
        <TopNavButton label="Personal" onPress={() => router.replace("/personal")} />
      </View>

      {/* Living header (ambient motion + glass + context + chips) */}
      <View style={styles.livingHeaderWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowBlob,
            {
              opacity: glowOpacity,
              transform: [{ translateX: driftX }, { translateY: driftY }],
            },
          ]}
        >
          <LinearGradient
            colors={[
              "rgba(255, 90, 190, 0.55)",
              "rgba(120, 90, 255, 0.35)",
              "rgba(60, 200, 255, 0.25)",
              "rgba(0,0,0,0)",
            ]}
            start={{ x: 0.1, y: 0.2 }}
            end={{ x: 0.9, y: 0.9 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.glassCard}>
          <Text style={styles.hTitle}>Events</Text>
          <Text style={styles.hSub}>{headerSubtitle}</Text>

          <View style={styles.chipsRow}>
            <Chip label="Tonight" active={timeChip === "tonight"} onPress={() => setTimeChip("tonight")} />
            <Chip label="Tomorrow" active={timeChip === "tomorrow"} onPress={() => setTimeChip("tomorrow")} />
            <Chip label="Weekend" active={timeChip === "weekend"} onPress={() => setTimeChip("weekend")} />
            <Chip label="This Week" active={timeChip === "week"} onPress={() => setTimeChip("week")} />
          </View>

          <View style={styles.chipsRow2}>
            <Chip
              label="Personalized"
              mode="secondary"
              active={personalizedOn}
              onPress={() => setPersonalizedOn((v) => !v)}
            />
            <Chip
              label="All"
              mode="secondary"
              active={timeChip === "all" && !personalizedOn}
              onPress={() => {
                setTimeChip("all");
                setPersonalizedOn(false);
              }}
            />
            <Pressable onPress={() => router.push("/persona")} style={styles.changePersonaBtn}>
              <Text style={styles.changePersonaText}>Change persona</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Sections */}
      <SectionTitle title="Tailored For You" subtitle="Based on your persona" />
      <FlatList
        data={tailored}
        keyExtractor={(i) => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 10, paddingRight: 16 }}
        renderItem={({ item }) => <MiniEventCard item={item} />}
      />

      <SectionTitle title="Spotlight Events" subtitle="Hand-picked experiences" />
      <FlatList
        data={spotlight}
        keyExtractor={(i) => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 10, paddingRight: 16 }}
        renderItem={({ item }) => <MiniEventCard item={item} />}
      />

      <SectionTitle title="Top Venues" subtitle="Great places right now" />
      <FlatList
        data={topVenues}
        keyExtractor={(x, idx) => `${x}_${idx}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 10, paddingRight: 16 }}
        renderItem={({ item }) => <VenueCard name={String(item)} />}
      />

      <SectionTitle title="All Events" subtitle="Full list" />
      <View style={{ height: 8 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.bg}>
        <LinearGradient
          colors={["#070811", "#0b0b18", "#120a18", "#0a0c16"]}
          start={{ x: 0.15, y: 0.1 }}
          end={{ x: 0.85, y: 0.95 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.55)"]}
          start={{ x: 0.5, y: 0.2 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <FlatList
          data={allEvents}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={Header}
          contentContainerStyle={{ paddingBottom: 22 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
              <BigEventRow item={item} />
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
      </View>
      <Text style={styles.sectionChevron}>›</Text>
    </View>
  );
}

function BigEventRow({ item }: { item: EventItem }) {
  const venue = typeof item.venueId === "string" ? item.venueId : "Venue";
  return (
    <Pressable style={styles.bigRow}>
      <LinearGradient
        colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.06)"]}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.95, y: 0.95 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.bigWhen}>{formatWhen(item.startISO)}</Text>
        <Text style={styles.bigTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.bigVenue} numberOfLines={1}>
          {venue}
        </Text>
        <View style={styles.tagRow}>
          {uniq([...(item.vibeTags || []), ...(item.audienceTags || [])])
            .slice(0, 4)
            .map((t) => (
              <View key={`${item.id}_big_${t}`} style={styles.tagPill}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
        </View>
      </View>

      <View style={styles.bigRight}>
        <Text style={styles.priceText}>{item.priceLabel || ""}</Text>
        <Text style={styles.moreText}>View</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#05060A" },
  bg: { flex: 1 },

  // Explore (now placed above top nav)
  exploreWrap: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  exploreInput: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    fontWeight: "600",
  },

  // Top nav
  topNavRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 12, // ✅ slight spacing after search bar
    paddingBottom: 12,
  },
  navBtn: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  navBtnActive: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  navBtnText: {
    color: "rgba(255,255,255,0.78)",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  navBtnTextActive: {
    color: "rgba(255,255,255,0.95)",
  },

  // Living header
  livingHeaderWrap: {
    marginTop: 14,
    marginBottom: 10,
    borderRadius: 22,
    overflow: "hidden",
  },
  glowBlob: {
    position: "absolute",
    left: -40,
    top: -30,
    width: 420,
    height: 240,
    borderRadius: 999,
  },
  glassCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  hTitle: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  hSub: {
    marginTop: 4,
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "700",
  },

  // Chips
  chipsRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chipsRow2: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  chipSecondary: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  chipText: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "800",
    fontSize: 13,
  },
  chipTextSecondary: {
    fontWeight: "800",
  },
  chipTextActive: {
    color: "rgba(255,255,255,0.96)",
  },
  changePersonaBtn: {
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  changePersonaText: {
    color: "rgba(255,255,255,0.86)",
    fontWeight: "900",
    fontSize: 13,
  },

  // Sections
  sectionTitleRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  sectionSub: {
    marginTop: 2,
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionChevron: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 26,
    marginLeft: 4,
    transform: [{ translateY: -1 }],
  },

  // Mini cards (horizontal rails)
  miniCard: {
    width: 220,
    marginRight: 12,
    borderRadius: 18,
    overflow: "hidden",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.20)",
  },
  miniWhen: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
    fontWeight: "900",
  },
  miniTitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.95)",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  miniVenue: {
    marginTop: 6,
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
    fontWeight: "800",
  },

  // Venue cards
  venueCard: {
    width: 190,
    marginRight: 12,
    borderRadius: 18,
    overflow: "hidden",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.18)",
    justifyContent: "space-between",
  },
  venueName: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  venueMeta: {
    marginTop: 10,
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "800",
  },

  // Tags
  tagRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tagText: {
    color: "rgba(255,255,255,0.80)",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.2,
    textTransform: "capitalize",
  },

  // Big list rows (All Events)
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
