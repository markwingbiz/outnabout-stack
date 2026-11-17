// app/(tabs)/venues.tsx
// Venues tab (premium skeleton pass, 2026-11-15): the mockup's Venues
// view as a real tab — premium header, venue search, and the venue
// tile grid. Data flow mirrors Home exactly: Firestore catalog via
// lib/store.ts, with the wholesale showcase fallback (never mixed)
// when the catalog is completely empty. Tapping a tile opens the
// venue PAGE (detail.tsx kind=venue), which lists that venue's
// upcoming events.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchEvents, fetchVenues, type Venue } from "../../lib/store";
import { useAuth } from "../../lib/auth";
import { getShowcaseVenues } from "../../data/showcase";
import { InfoRow, VenueTile, usePremiumFonts, venueMetaFor } from "../ui/premium";
import { premium } from "../ui/theme";
import {
  BottomNav,
  HeaderAvatar,
  Search,
  Section,
  TAB_ROUTES,
  refStyles,
} from "../ui/reference";

export default function VenuesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const fonts = usePremiumFonts();
  const [q, setQ] = useState("");

  const [eventsCount, setEventsCount] = useState<number | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchEvents(user?.email ?? null), fetchVenues(user?.email ?? null)])
      .then(([rows, venueRows]) => {
        if (!alive) return;
        setEventsCount(rows.length);
        setVenues(venueRows);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.email]);

  // Wholesale showcase fallback: demo only when the real catalog is
  // completely empty. Never mixed with real data.
  const usingDemo = eventsCount === 0 && venues.length === 0;
  const effVenues = usingDemo ? getShowcaseVenues() : venues;

  const qNorm = q.trim().toLowerCase();
  const visibleVenues = useMemo(
    () => (qNorm ? effVenues.filter((v) => v.name.toLowerCase().includes(qNorm)) : effVenues),
    [effVenues, qNorm]
  );

  const avatarInitial = useMemo(() => {
    const raw = (profile?.displayName || user?.displayName || user?.email || "").trim();
    const ch = raw.replace(/^[^A-Za-z0-9]+/, "").charAt(0);
    return ch ? ch.toUpperCase() : null;
  }, [profile?.displayName, user?.displayName, user?.email]);

  function go(route: string) {
    router.replace(route);
  }

  function openVenue(id: string) {
    router.push({ pathname: "/detail", params: { id, kind: "venue" } });
  }

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
        {/* Premium header (mockup Venues view): count eyebrow + title
            + avatar. */}
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headHi, fonts.bodyBold]}>
              {loading ? "Kansas City" : `${effVenues.length} ${effVenues.length === 1 ? "venue" : "venues"}`}
            </Text>
            <Text style={[styles.headTitle, fonts.display]}>Venues</Text>
          </View>
          <HeaderAvatar initial={avatarInitial} onPress={() => go(TAB_ROUTES.Rewards)} />
        </View>
        <Search value={q} onChange={setQ} placeholder="Search venues…" />

        {usingDemo && !loading && (
          <View style={styles.showcaseChip}>
            <Text style={styles.showcaseChipText}>Showcase preview · Sample listings</Text>
          </View>
        )}

        {loading ? (
          <Text style={styles.emptyText}>Loading…</Text>
        ) : effVenues.length === 0 ? (
          <Text style={styles.emptyText}>No venues yet — check back soon.</Text>
        ) : visibleVenues.length === 0 ? (
          <Text style={styles.emptyText}>No venue matches that search yet.</Text>
        ) : (
          <View style={styles.grid}>
            {visibleVenues.map((v) => (
              <VenueTile
                key={v.id}
                name={v.name}
                meta={venueMetaFor(v.name)}
                photoUrl={v.photoUrl}
                verified={v.verified}
                isTest={v.isTest}
                featured={v.featured}
                onPress={() => openVenue(v.id)}
                style={styles.gridTile}
              />
            ))}
          </View>
        )}

        {/* Standing partner perk (mockup Venues view footer): product
            copy, true of every Bownd partner venue. */}
        <Section title="Member perk nearby" />
        <InfoRow
          icon="wine"
          title="A standing perk at every partner"
          body="Every Bownd partner venue carries a standing free perk for paid members — one claim per partner, per quarter, on a verified scan."
        />
      </ScrollView>
      <View style={{ backgroundColor: "#0F0A1F", paddingBottom: insets.bottom }}>
        <BottomNav active="Venues" onNavigate={go} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
    marginBottom: 14,
  },
  headHi: { color: premium.muted, fontSize: 12.5, fontWeight: "700" },
  headTitle: { color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 2 },
  // Mockup .v-grid: two equal columns, 11px gap, filling the width —
  // the tile's fixed rail width is overridden by flex basis here.
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  gridTile: { flexBasis: "47%", flexGrow: 1 },
  showcaseChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(232,196,118,0.13)",
    borderWidth: 1,
    borderColor: "rgba(232,196,118,0.40)",
    marginBottom: 12,
  },
  showcaseChipText: { color: premium.gold, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  emptyText: {
    marginTop: 24,
    color: premium.muted,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
