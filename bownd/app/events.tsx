// app/events.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  FlatList,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";

import AppBackground from "../components/ui/AppBackground";
import TopTabs from "../components/ui/TopTabs";
import EventCard from "../components/EventCard";

import { VENUES } from "../data/venues";
// ✅ If your file is data/events.data.ts, change this to:
// import { EVENTS } from "../data/events.data";
import { EVENTS } from "../data/events";

import { loadPersona, PersonaProfile, DEFAULT_PERSONA } from "../lib/personaStore";

type ModeFilter = "personalized" | "all";
type QuickFilter = "none" | "tonight" | "tomorrow" | "weekend" | "week";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function inRange(t: number, min: number, max: number) {
  return t >= min && t < max;
}
function safeMs(iso: string) {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

// ✅ IMPORTANT: "Personalized" should ALWAYS show something.
// If strict matching returns 0, we fall back to "best matches first" (but still show events).
function matchScore(e: any, audience: string, vibe: string) {
  let score = 0;
  if (Array.isArray(e?.audienceTags) && e.audienceTags.includes(audience)) score += 2;
  if (Array.isArray(e?.vibeTags) && e.vibeTags.includes(vibe)) score += 2;

  // small boost for spotlight/featured so the list feels curated
  if (e?.category === "spotlight") score += 1;
  if (e?.category === "featured") score += 0.5;

  return score;
}

export default function EventsScreen() {
  const router = useRouter();

  const [persona, setPersona] = useState<PersonaProfile>(DEFAULT_PERSONA);
  const [mode, setMode] = useState<ModeFilter>("personalized");
  const [quick, setQuick] = useState<QuickFilter>("none");
  const [q, setQ] = useState("");

  useEffect(() => {
    loadPersona().then(setPersona).catch(() => setPersona(DEFAULT_PERSONA));
  }, []);

  const venueNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of VENUES as any[]) {
      const id = (v?.id ?? v?.venueId ?? v?.name ?? "").toString();
      const name = (v?.name ?? v?.title ?? id).toString();
      if (id) map.set(id, name);
      if (name) map.set(name, name);
    }
    return map;
  }, []);

  const now = useMemo(() => new Date(), []);
  const tomorrowStart = useMemo(() => startOfDay(addDays(now, 1)).getTime(), [now]);
  const weekStart = useMemo(() => startOfDay(now).getTime(), [now]);
  const weekEnd = useMemo(() => startOfDay(addDays(now, 7)).getTime(), [now]);

  // Weekend: Fri 5pm -> Sun 11:59pm
  const weekendWindow = useMemo(() => {
    const d = new Date(now);
    const day = d.getDay(); // 0 Sun, 5 Fri, 6 Sat
    const friday = addDays(startOfDay(d), (5 - day + 7) % 7);
    const fri5pm = new Date(friday);
    fri5pm.setHours(17, 0, 0, 0);

    const sunday = addDays(startOfDay(friday), 2);
    const sunEnd = new Date(sunday);
    sunEnd.setHours(23, 59, 59, 999);

    return { start: fri5pm.getTime(), end: sunEnd.getTime() + 1 };
  }, [now]);

  const normalizedQuery = q.trim().toLowerCase();

  const subtitle = useMemo(() => {
    const modeLabel = mode === "all" ? "All" : "Personalized";
    let quickLabel = "showing all events";
    if (quick === "tonight") quickLabel = "showing tonight";
    else if (quick === "tomorrow") quickLabel = "showing tomorrow";
    else if (quick === "weekend") quickLabel = "showing weekend";
    else if (quick === "week") quickLabel = "showing this week";
    else if (normalizedQuery.length > 0) quickLabel = "showing search results";
    return `${modeLabel}  •  ${quickLabel}`;
  }, [mode, quick, normalizedQuery]);

  const baseFiltered = useMemo(() => {
    // Apply ONLY date filters + search here. (Mode is handled later.)
    const list = (EVENTS ?? [])
      .slice()
      .sort((a: any, b: any) => safeMs(a.startISO) - safeMs(b.startISO));

    return list.filter((e: any) => {
      const t = safeMs(e.startISO);

      // Quick filters
      if (quick === "tonight") {
        if (!isSameDay(new Date(e.startISO), now)) return false;
        if (t < now.getTime()) return false;
      } else if (quick === "tomorrow") {
        if (!inRange(t, tomorrowStart, tomorrowStart + 24 * 60 * 60 * 1000)) return false;
      } else if (quick === "weekend") {
        if (!inRange(t, weekendWindow.start, weekendWindow.end)) return false;
      } else if (quick === "week") {
        if (!inRange(t, weekStart, weekEnd)) return false;
      }

      // Search always applies
      if (normalizedQuery.length > 0) {
        const venueName = venueNameById.get(e.venueId) ?? e.venueId ?? "";
        const haystack =
          `${e.title} ${venueName} ${(e.vibeTags ?? []).join(" ")} ${(e.audienceTags ?? []).join(" ")}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }

      return true;
    });
  }, [
    quick,
    normalizedQuery,
    now,
    tomorrowStart,
    weekendWindow.start,
    weekendWindow.end,
    weekStart,
    weekEnd,
    venueNameById,
  ]);

  const eventsToShow = useMemo(() => {
    // ✅ All mode = all events (after date/search filters) — NO persona filtering
    if (mode === "all") return baseFiltered;

    // ✅ Personalized mode = persona-based events.
    // First try "strict" match: audience AND vibe (when tags exist).
    const strict = baseFiltered.filter((e: any) => {
      const audienceOk =
        !Array.isArray(e.audienceTags) ||
        e.audienceTags.length === 0 ||
        e.audienceTags.includes(persona.audience);

      const vibeOk =
        !Array.isArray(e.vibeTags) ||
        e.vibeTags.length === 0 ||
        e.vibeTags.includes(persona.vibe);

      // If an event has tags, we require match. If it has no tags, allow it (keeps list healthy).
      return audienceOk && vibeOk;
    });

    if (strict.length > 0) {
      // Optional: sort strict matches so the "best" show first
      return strict
        .slice()
        .sort((a: any, b: any) => matchScore(b, persona.audience, persona.vibe) - matchScore(a, persona.audience, persona.vibe));
    }

    // ✅ Fallback (fixes your issue): if strict returns 0,
    // show ALL events but sort by persona match score so it still feels personalized.
    return baseFiltered
      .slice()
      .sort((a: any, b: any) => matchScore(b, persona.audience, persona.vibe) - matchScore(a, persona.audience, persona.vibe));
  }, [mode, baseFiltered, persona.audience, persona.vibe]);

  const onClear = () => {
    setQ("");
    setQuick("none");
    setMode("all");
  };

  return (
    <AppBackground>
      <StatusBar barStyle="light-content" />

      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>OutnAbout</Text>
          <Text style={styles.h1}>Events</Text>
        </View>

        <TopTabs />

        {/* Search */}
        <View style={styles.searchWrap}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search venues or events..."
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.search}
          />
        </View>

        {/* Mode row: Personalized / All */}
        <View style={styles.row}>
          <Pill
            label="Personalized"
            active={mode === "personalized"}
            onPress={() => setMode("personalized")}
          />
          <Pill label="All" active={mode === "all"} onPress={() => setMode("all")} />
        </View>

        {/* Single row: Tonight / Tomorrow / Weekend / This Week */}
        <View style={styles.quickRow}>
          <Pill label="Tonight" active={quick === "tonight"} onPress={() => setQuick("tonight")} size="xs" />
          <Pill label="Tomorrow" active={quick === "tomorrow"} onPress={() => setQuick("tomorrow")} size="xs" />
          <Pill label="Weekend" active={quick === "weekend"} onPress={() => setQuick("weekend")} size="xs" />
          <Pill label="This Week" active={quick === "week"} onPress={() => setQuick("week")} size="xs" />
        </View>

        {/* Right under quick row: "All • showing..." + Change Persona */}
        <Text style={styles.subline}>{subtitle}</Text>

        <View style={styles.underRow}>
          <Pressable onPress={() => router.push("/persona")} style={styles.changePersonaHit}>
            <Text style={styles.changePersonaText}>Change Persona</Text>
          </Pressable>

          <Pressable onPress={onClear} style={styles.clearInlineHit}>
            <Text style={styles.clearInlineText}>Clear</Text>
          </Pressable>
        </View>

        {/* Rest of screen is list */}
        <View style={styles.listWrap}>
          <FlatList
            data={eventsToShow}
            keyExtractor={(item: any) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            renderItem={({ item }: any) => {
              const venueName = venueNameById.get(item.venueId) ?? item.venueId ?? "Venue";
              return (
                <EventCard
                  event={{
                    ...item,
                    venueName,
                  }}
                />
              );
            }}
            ListEmptyComponent={
              <View style={{ paddingTop: 18 }}>
                <Text style={styles.empty}>
                  No events match your filters. Try Clear or switch to All.
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </AppBackground>
  );
}

function Pill({
  label,
  active,
  onPress,
  size = "md",
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  size?: "xs" | "md";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        size === "xs" && styles.pillXs,
        active ? styles.pillActive : styles.pillInactive,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          size === "xs" && styles.pillTextXs,
          active ? styles.pillTextActive : styles.pillTextInactive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 52,
    paddingHorizontal: 18,
    backgroundColor: "transparent",
  },

  header: { alignItems: "center", marginBottom: 8 },
  brand: { fontSize: 18, fontWeight: "700", color: "rgba(255,255,255,0.55)" },
  h1: { marginTop: 6, fontSize: 44, fontWeight: "900", color: "rgba(255,255,255,0.96)" },

  searchWrap: { marginTop: 12 },
  search: {
    height: 54,
    borderRadius: 22,
    paddingHorizontal: 18,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: "900",
    fontSize: 16,
  },

  row: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    flexWrap: "wrap",
    alignItems: "center",
  },

  // One-row quick filters (no wrapping)
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 14,
  },

  pill: {
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },

  // Smaller pills so all 4 fit in one row
  pillXs: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 20,
  },

  pillActive: {
    backgroundColor: "rgba(165, 110, 245, 0.26)",
    borderColor: "rgba(210,170,255,0.32)",
  },
  pillInactive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },

  pillText: { fontWeight: "900", fontSize: 18 },
  pillTextXs: { fontSize: 14 },
  pillTextActive: { color: "rgba(255,255,255,0.95)" },
  pillTextInactive: { color: "rgba(255,255,255,0.70)" },

  subline: {
    marginTop: 14,
    color: "rgba(255,255,255,0.70)",
    fontWeight: "900",
    fontSize: 16,
  },

  underRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  changePersonaHit: { paddingVertical: 2 },
  changePersonaText: {
    color: "rgba(190, 130, 255, 0.98)",
    fontWeight: "900",
    fontSize: 18,
  },

  clearInlineHit: { paddingVertical: 2, paddingHorizontal: 6 },
  clearInlineText: {
    color: "rgba(255,255,255,0.70)",
    fontWeight: "900",
    fontSize: 16,
  },

  listWrap: {
    flex: 1,
    marginTop: 10,
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: 26,
  },

  empty: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "800",
  },
});
