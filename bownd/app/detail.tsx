// app/detail.tsx
// Phase 6 fix notes (see FIX-PLAN.md):
// - Renders REAL data: a Firestore event when ?id matches an event
//   (kind=event, the default), falling back to the curated EXPERIENCES
//   entry when the id matches one (kind=experience, from /list /vibe).
//   Previously it rendered bundled experiences only, so every event
//   card that navigated here would have shown "Not found".
// - Added a Back button (header is hidden, so there was no way back
//   except the OS gesture), a favorite toggle (the missing UI caller
//   for toggleFavorite), and "See venue events" on event detail.
// - Experience detail gains "Visit website" (expo-linking) when the
//   curated entry has one. No buttons are decorative: every pressable
//   does something real.
import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { BrandBackground } from "./ui/BrandBackground";
import { BrandCard } from "./ui/BrandCard";
import BrandHeader from "./ui/BrandHeader";
import { spacing, theme } from "./ui/theme";
import { EXPERIENCES } from "../data/experiences";
import {
  fetchEvents,
  fetchVenues,
  isFavorite,
  toggleFavorite,
  type EventItem,
  type Venue,
  type FavoriteItem,
} from "../lib/store";
import { useAuth } from "../lib/auth";
import {
  findShowcaseEvent,
  findShowcaseVenue,
  isShowcaseId,
} from "../data/showcase";

function formatWhen(startISO: string) {
  const d = new Date(startISO);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DetailScreen() {
  const { id, kind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchEvents(), fetchVenues()]).then(([rows, venueRows]) => {
      if (alive) {
        setEvents(rows);
        setVenues(venueRows);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const demoEvent = useMemo(() => {
    if (kind === "experience" || kind === "venue") return undefined;
    if (!id || !isShowcaseId(id)) return undefined;
    return findShowcaseEvent(id);
  }, [id, kind]);

  const demoVenue = useMemo(() => {
    if (!id || !isShowcaseId(id)) return undefined;
    if (kind === "venue" || id.startsWith("demo-venue-")) return findShowcaseVenue(id);
    return undefined;
  }, [id, kind]);

  const event = useMemo(
    () =>
      kind === "experience"
        ? undefined
        : (events.find((e) => e.id === id) ?? demoEvent),
    [events, id, kind, demoEvent]
  );

  const isDemo = !!demoEvent || !!demoVenue;

  const experience = useMemo(() => {
    if (event || demoVenue) return undefined;
    return EXPERIENCES.find((e) => e.id === id);
  }, [event, demoVenue, id]);

  const venueName = useMemo(() => {
    if (demoVenue) return demoVenue.name;
    if (!event) return "";
    const v = venues.find((x) => x.id === event.venueId || x.name === event.venueId);
    return v?.name ?? findShowcaseVenue(event.venueId)?.name ?? (event.venueId || "Venue");
  }, [demoVenue, event, venues]);

  // Favorite state for whichever item is shown.
  useEffect(() => {
    let alive = true;
    const favId = event?.id ?? demoVenue?.id ?? experience?.id;
    if (!favId) return;
    isFavorite(user?.uid ?? null, demoVenue ? "venue" : "event", favId)
      .then((v) => {
        if (alive) setFav(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [event?.id, demoVenue?.id, experience?.id, demoVenue, user?.uid]);

  async function onToggleFav() {
    // Demo items: bookmark-only Save. Never any purchase/redeem action.
    const item: FavoriteItem | null = demoVenue
      ? {
          id: demoVenue.id,
          kind: "venue",
          title: demoVenue.name,
          subtitle: "Showcase preview",
        }
      : event
        ? {
            id: event.id,
            kind: "event",
            title: event.title,
            subtitle: venueName,
            when: formatWhen(event.startISO),
          }
        : experience
          ? {
              id: experience.id,
              kind: "event",
              title: experience.title,
              subtitle: experience.neighborhood,
            }
          : null;
    if (!item) return;
    try {
      const nowFav = await toggleFavorite(user?.uid ?? null, item);
      setFav(nowFav);
    } catch {
      Alert.alert("Could not save favorite", "Try again.");
    }
  }

  function openVenueEvents() {
    router.push({ pathname: "/(tabs)/events", params: { venue: venueName } });
  }

  async function openWebsite(url: string) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Cannot open link", "This device cannot open that website.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("Cannot open link", "Something went wrong opening that website.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <BrandBackground />

      <View style={styles.container}>
        <BrandHeader tagline="Pick a vibe. Pick a plan." />

        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {loading ? (
            <BrandCard>
              <Text style={styles.h2}>Loading…</Text>
            </BrandCard>
          ) : event ? (
            <BrandCard>
              {isDemo && (
                <View style={styles.demoBadge}>
                  <Text style={styles.demoBadgeText}>
                    Showcase preview — not a live listing
                  </Text>
                </View>
              )}
              <Text style={styles.h2}>{event.title}</Text>
              <Text style={styles.meta}>
                {venueName} • {formatWhen(event.startISO)}
                {event.priceLabel ? ` • ${event.priceLabel}` : ""}
              </Text>

              <View style={styles.tagRow}>
                {[...(event.vibeTags || []), ...(event.audienceTags || [])].map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.actionsRow}>
                <Pressable onPress={onToggleFav} style={styles.actionBtn}>
                  <Text style={styles.actionBtnText}>{fav ? "♥ Saved" : "♡ Save"}</Text>
                </Pressable>
                <Pressable onPress={openVenueEvents} style={[styles.actionBtn, styles.actionBtnGhost]}>
                  <Text style={[styles.actionBtnText, styles.actionBtnGhostText]}>See venue events</Text>
                </Pressable>
              </View>
            </BrandCard>
          ) : demoVenue ? (
            <BrandCard>
              <View style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>
                  Showcase preview — not a live listing
                </Text>
              </View>
              <Text style={styles.h2}>{demoVenue.name}</Text>
              <Text style={styles.meta}>Showcase preview venue</Text>

              <View style={styles.actionsRow}>
                <Pressable onPress={onToggleFav} style={styles.actionBtn}>
                  <Text style={styles.actionBtnText}>{fav ? "♥ Saved" : "♡ Save"}</Text>
                </Pressable>
                <Pressable onPress={openVenueEvents} style={[styles.actionBtn, styles.actionBtnGhost]}>
                  <Text style={[styles.actionBtnText, styles.actionBtnGhostText]}>See venue events</Text>
                </Pressable>
              </View>
            </BrandCard>
          ) : experience ? (
            <BrandCard>
              <Text style={styles.h2}>{experience.title}</Text>
              <Text style={styles.meta}>
                {experience.neighborhood} • {experience.price} • {experience.duration}
              </Text>
              <Text style={styles.sub}>{experience.description}</Text>

              <View style={styles.tagRow}>
                {[...experience.personas, ...experience.vibes].map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.actionsRow}>
                <Pressable onPress={onToggleFav} style={styles.actionBtn}>
                  <Text style={styles.actionBtnText}>{fav ? "♥ Saved" : "♡ Save"}</Text>
                </Pressable>
                {!!experience.website && (
                  <Pressable
                    onPress={() => openWebsite(experience.website as string)}
                    style={[styles.actionBtn, styles.actionBtnGhost]}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnGhostText]}>Visit website</Text>
                  </Pressable>
                )}
              </View>
            </BrandCard>
          ) : (
            <BrandCard>
              <Text style={styles.h2}>Not found</Text>
              <Text style={styles.sub}>
                We couldn't find that experience. Try picking another one.
              </Text>
            </BrandCard>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
  },

  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingRight: 10,
    marginBottom: 6,
  },
  backText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },

  h2: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "900",
  },

  demoBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(245,195,106,0.16)",
    borderWidth: 1,
    borderColor: "rgba(245,195,106,0.45)",
    marginBottom: 10,
  },
  demoBadgeText: {
    color: "#f5c36a",
    fontSize: 12,
    fontWeight: "900",
  },

  meta: {
    color: theme.subtext,
    marginTop: 8,
    fontWeight: "700",
  },

  sub: {
    color: theme.subtext,
    marginTop: 8,
    fontWeight: "700",
    lineHeight: 20,
  },

  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },

  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  tagText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "800",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap",
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    color: "#0b0b0b",
    fontWeight: "900",
    fontSize: 14,
  },
  actionBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  actionBtnGhostText: {
    color: theme.text,
  },
});
