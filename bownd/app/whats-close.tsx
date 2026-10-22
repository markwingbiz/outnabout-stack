// app/whats-close.tsx
// What's Around You — map + nearby lists for venues and events.
//
// - Location is requested ONCE, foreground-only, and used ONLY on this
//   device to center the map and sort by distance. It is never stored,
//   never sent to any server, and never leaves the device.
// - If permission is denied (or location is unavailable), the map centers
//   on downtown KC and the lists sort from there, with an honest note.
// - Venues/events whose venue has no coordinates (store.ts defaults to
//   lat 0 / lng 0) are NOT put on the map and carry no distance — they
//   are counted in the "no map location yet" note, never plotted at 0,0.
// - Map tiles come from OpenStreetMap via Leaflet (no API key, no
//   account). Tiles need internet; the lists below still work offline.
// - Catalog rule matches Home: when Firestore is empty (no events AND
//   no venues), the authorized showcase fallback is used wholesale —
//   never mixed — and demo markers are labeled "Sample listing".
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";

import { fetchEvents, fetchVenues, type EventItem, type Venue } from "../lib/store";
import { useAuth } from "../lib/auth";
import { getShowcaseEvents, getShowcaseVenues } from "../data/showcase";
import {
  KC_FALLBACK,
  buildMapHtml,
  formatDistance,
  hasCoords,
  haversineMiles,
  venueCoordFor,
  type LatLng,
  type MapMarker,
} from "../lib/nearby";
import { formatWhen, getVenueName } from "./ui/reference";

type LocState = "loading" | "granted" | "denied";

export default function WhatsCloseScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [locState, setLocState] = useState<LocState>("loading");
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Location: foreground only, on-device only.
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!alive) return;
        if (status !== "granted") {
          setLocState("denied");
        } else {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!alive) return;
          setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocState("granted");
        }
      } catch {
        if (alive) setLocState("denied");
      }
      // Catalog: same wholesale rule as Home.
      try {
        const [rows, venueRows] = await Promise.all([
          fetchEvents(user?.email ?? null),
          fetchVenues(user?.email ?? null),
        ]);
        if (!alive) return;
        setEvents(rows);
        setVenues(venueRows);
      } catch {
        // Lists stay empty; the map still renders.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email]);

  const usingDemo = events.length === 0 && venues.length === 0;
  const effEvents = usingDemo ? getShowcaseEvents() : events;
  const effVenues = usingDemo ? getShowcaseVenues() : venues;

  const center = userLoc ?? KC_FALLBACK;

  const nearbyVenues = useMemo(() => {
    return effVenues
      .filter((v) => hasCoords(v.lat, v.lng))
      .map((v) => ({
        venue: v,
        miles: haversineMiles(center, { lat: v.lat, lng: v.lng }),
        eventCount: effEvents.filter((e) => e.venueId === v.id || e.venueId === v.name).length,
      }))
      .sort((a, b) => a.miles - b.miles);
  }, [effVenues, effEvents, center]);

  const unmappedVenueCount = effVenues.length - nearbyVenues.length;

  const nearbyEvents = useMemo(() => {
    return effEvents
      .map((e) => {
        const coords = venueCoordFor(e.venueId, effVenues);
        return coords
          ? { event: e, miles: haversineMiles(center, coords) }
          : null;
      })
      .filter((x): x is { event: EventItem; miles: number } => x !== null)
      .sort((a, b) => a.miles - b.miles);
  }, [effEvents, effVenues, center]);

  const unmappedEventCount = effEvents.length - nearbyEvents.length;

  const markers: MapMarker[] = useMemo(
    () =>
      nearbyVenues.map(({ venue, eventCount }) => ({
        id: venue.id,
        name: venue.name,
        lat: venue.lat,
        lng: venue.lng,
        subtitle: `${eventCount} event${eventCount === 1 ? "" : "s"}`,
        badge: venue.isTest ? "Test" : usingDemo ? "Sample listing" : undefined,
      })),
    [nearbyVenues, usingDemo]
  );

  const mapHtml = useMemo(
    () => buildMapHtml({ center, user: userLoc, markers }),
    [center, userLoc, markers]
  );

  const venueNameById = useMemo(
    () => new Map(effVenues.map((v) => [v.id, v.name])),
    [effVenues]
  );

  function onMapMessage(e: WebViewMessageEvent) {
    const data = e.nativeEvent.data;
    if (data.startsWith("venue:")) {
      const id = data.slice("venue:".length);
      router.push({
        pathname: "/(tabs)/events",
        params: { venueId: id, venue: venueNameById.get(id) ?? id },
      });
    }
  }

  function openVenue(id: string, name: string) {
    router.push({ pathname: "/(tabs)/events", params: { venueId: id, venue: name } });
  }

  function openEvent(id: string) {
    router.push({ pathname: "/detail", params: { id, kind: "event" } });
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>What&apos;s Around You</Text>
        <Text style={styles.sub}>
          {locState === "loading"
            ? "Finding your location…"
            : locState === "granted"
              ? "Sorted by distance from you. Your location stays on this device."
              : "Location off — showing downtown KC. Turn on location permission to sort from where you are."}
        </Text>

        {usingDemo && !loading && (
          <View style={styles.showcaseChip}>
            <Text style={styles.showcaseChipText}>Showcase preview · Sample listings</Text>
          </View>
        )}

        <View style={styles.mapWrap}>
          <WebView
            source={{ html: mapHtml }}
            style={styles.map}
            onMessage={onMapMessage}
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
        <Text style={styles.mapNote}>
          Map © OpenStreetMap contributors. Tap a pin, then See events.
        </Text>

        {loading ? (
          <ActivityIndicator color="#fff" size="large" style={{ marginTop: 24 }} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>Nearby venues ({nearbyVenues.length})</Text>
            {nearbyVenues.length === 0 ? (
              <Text style={styles.muted}>No venues have a map location yet.</Text>
            ) : (
              nearbyVenues.map(({ venue, miles, eventCount }) => (
                <Pressable
                  key={venue.id}
                  style={styles.row}
                  onPress={() => openVenue(venue.id, venue.name)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {venue.name}
                    </Text>
                    <Text style={styles.muted}>
                      {formatDistance(miles)} away · {eventCount} event
                      {eventCount === 1 ? "" : "s"}
                      {venue.verified ? " · ✓ Verified" : ""}
                      {venue.isTest ? " · Test" : ""}
                      {usingDemo ? " · Sample" : ""}
                    </Text>
                  </View>
                  <Text style={styles.rowAction}>See events ›</Text>
                </Pressable>
              ))
            )}
            {unmappedVenueCount > 0 && (
              <Text style={styles.muted}>
                {unmappedVenueCount} venue{unmappedVenueCount === 1 ? "" : "s"} don&apos;t have a
                map location yet and aren&apos;t shown on the map.
              </Text>
            )}

            <Text style={styles.sectionLabel}>Nearby events ({nearbyEvents.length})</Text>
            {nearbyEvents.length === 0 ? (
              <Text style={styles.muted}>No events with a mappable venue yet.</Text>
            ) : (
              nearbyEvents.map(({ event, miles }) => (
                <Pressable key={event.id} style={styles.row} onPress={() => openEvent(event.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={styles.muted}>
                      {getVenueName(event.venueId, effVenues)} · {formatDistance(miles)} away ·{" "}
                      {formatWhen(event.startISO)}
                      {event.isTest ? " · Test" : ""}
                      {usingDemo ? " · Sample" : ""}
                    </Text>
                  </View>
                  <Text style={styles.rowAction}>View ›</Text>
                </Pressable>
              ))
            )}
            {unmappedEventCount > 0 && (
              <Text style={styles.muted}>
                {unmappedEventCount} event{unmappedEventCount === 1 ? "" : "s"} at venues without
                a map location aren&apos;t shown here — find them in Events.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0e0b19" },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  backBtn: { alignSelf: "flex-start", paddingVertical: 6 },
  backText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  title: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 4 },
  sub: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 18, marginTop: 6 },
  showcaseChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(245,195,106,0.16)",
    borderWidth: 1,
    borderColor: "rgba(245,195,106,0.45)",
    marginTop: 10,
  },
  showcaseChipText: { color: "#f5c36a", fontSize: 12, fontWeight: "900" },
  mapWrap: {
    height: 360,
    borderRadius: 17,
    overflow: "hidden",
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  map: { flex: 1, backgroundColor: "#141021" },
  mapNote: { color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 6 },
  sectionLabel: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 20, marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  rowAction: { color: "#fff", fontSize: 13, fontWeight: "800" },
  muted: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 17, marginTop: 2 },
});
