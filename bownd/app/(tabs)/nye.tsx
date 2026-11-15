// app/(tabs)/nye.tsx
// NYE tab (premium skeleton pass, 2026-11-15): the campaign tab from
// the approved mockup's five-item nav. It presents the active
// campaign from data/campaigns.ts ("Bownd presents KC NYE — The Big
// Night"): the campaign hero, its dates and story, and the Big Night
// lineup — real catalog events matched by campaignEvents() (the same
// matcher the campaign page uses; discovered link-out events can
// never join a campaign). Ticket tiers and checkout live on the
// campaign page (detail.tsx kind=campaign); this tab routes there.
// Catalog data flow mirrors Home, including the wholesale showcase
// fallback when the catalog is completely empty.
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ImageBackground,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchEvents, fetchVenues, type EventItem, type Venue } from "../../lib/store";
import { useAuth } from "../../lib/auth";
import { getShowcaseEvents, getShowcaseVenues } from "../../data/showcase";
import {
  CAMPAIGNS,
  campaignEvents,
  getActiveCampaign,
} from "../../data/campaigns";
import { resolveCampaignImage } from "../../lib/placeholders";
import { SceneEventCard, hexToRgba, usePremiumFonts } from "../ui/premium";
import { premium } from "../ui/theme";
import {
  BottomNav,
  HeaderAvatar,
  Section,
  TAB_ROUTES,
  formatWhen,
  getVenueName,
  refStyles,
} from "../ui/reference";

export default function NyeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const fonts = usePremiumFonts();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [venuesCount, setVenuesCount] = useState<number | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchEvents(user?.email ?? null), fetchVenues(user?.email ?? null)])
      .then(([rows, venueRows]) => {
        if (!alive) return;
        setEvents(rows);
        setVenues(venueRows);
        setVenuesCount(venueRows.length);
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
  // completely empty. Never mixed with real data. Discovered events
  // are excluded from campaigns by campaignEvents() itself.
  const usingDemo = events.length === 0 && venuesCount === 0;
  const effEvents = usingDemo ? getShowcaseEvents() : events;
  const effVenues = usingDemo ? getShowcaseVenues() : venues;

  // The NYE campaign is the tab's reason to exist: outside its
  // display window the tab still presents the campaign (config, not
  // invented data) rather than going blank.
  const campaign = useMemo(() => getActiveCampaign() ?? CAMPAIGNS[0], []);

  const lineup = useMemo(() => {
    if (!campaign) return [];
    return [...campaignEvents(campaign, effEvents)].sort((a, b) =>
      a.startISO.localeCompare(b.startISO)
    );
  }, [campaign, effEvents]);

  const avatarInitial = useMemo(() => {
    const raw = (profile?.displayName || user?.displayName || user?.email || "").trim();
    const ch = raw.replace(/^[^A-Za-z0-9]+/, "").charAt(0);
    return ch ? ch.toUpperCase() : null;
  }, [profile?.displayName, user?.displayName, user?.email]);

  function go(route: string) {
    router.replace(route);
  }

  function openEvent(id: string) {
    router.push({ pathname: "/detail", params: { id, kind: "event" } });
  }

  function openCampaign() {
    if (!campaign) return;
    router.push({ pathname: "/detail", params: { id: campaign.id, kind: "campaign" } });
  }

  if (!campaign) return null;

  const heroName =
    campaign.id === "kc-nye-2026" ? "KC NYE — The Big Night" : campaign.name;

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
        {/* Premium header: campaign presenter eyebrow + title + avatar */}
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headHi, fonts.bodyBold]}>{campaign.presenter}</Text>
            <Text style={[styles.headTitle, fonts.display]}>{campaign.name}</Text>
          </View>
          <HeaderAvatar initial={avatarInitial} onPress={() => go(TAB_ROUTES.Rewards)} />
        </View>

        {usingDemo && !loading && (
          <View style={styles.showcaseChip}>
            <Text style={styles.showcaseChipText}>Showcase preview · Sample listings</Text>
          </View>
        )}

        {/* Campaign hero — the mockup's NYE treatment is its detail
            hero: a full-bleed photo (the mockup's NYE sparkler picture,
            tinted with the campaign gradient) with the gold tag chip and the
            Big Night name overlaid at the bottom over a scrim. */}
        <TouchableOpacity onPress={openCampaign} activeOpacity={0.92} style={styles.heroWrap}>
          <ImageBackground
            source={resolveCampaignImage(undefined)}
            style={styles.hero}
            resizeMode="cover"
          >
            <LinearGradient
              colors={campaign.gradient.map((c) => hexToRgba(c, 0.5)) as [string, string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={["rgba(10,6,22,0.18)", "rgba(10,6,22,0.45)", "rgba(15,10,31,0.95)"]}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.heroContent}>
              <View style={styles.heroTag}>
                <Text style={[styles.heroTagText, fonts.bodyExtraBold]}>
                  {campaign.presenter} · Spotlight
                </Text>
              </View>
              <Text style={[styles.heroName, fonts.display]}>{heroName}</Text>
              <Text style={[styles.heroDates, fonts.bodyBold]}>{campaign.datesLabel}</Text>
            </View>
          </ImageBackground>
        </TouchableOpacity>
        <Text style={[styles.tagline, fonts.bodySemiBold]}>{campaign.tagline}</Text>
        <Text style={[styles.description, fonts.body]}>{campaign.description}</Text>
        <LinearGradient
          colors={["rgba(232,196,118,0.65)", "rgba(232,196,118,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.goldline}
        />

        {/* The Big Night lineup — real matched events only. */}
        <Section
          title="The Big Night lineup"
          subtitle={
            lineup.length > 0
              ? `${lineup.length} ${lineup.length === 1 ? "event" : "events"} in the campaign`
              : undefined
          }
        />
        {loading ? (
          <Text style={styles.emptyText}>Loading…</Text>
        ) : lineup.length === 0 ? (
          <Text style={styles.emptyText}>
            No Big Night events are live yet — venues are still adding theirs. Check
            back as the night comes together.
          </Text>
        ) : (
          lineup.map((item) => (
            <SceneEventCard
              key={item.id}
              title={item.title}
              venueName={getVenueName(item.venueId, effVenues)}
              whenLabel={formatWhen(item.startISO)}
              badge={item.isTest ? "Test" : undefined}
              priceLabel={item.priceLabel || undefined}
              photoUrl={item.photoUrl}
              onPress={() => openEvent(item.id)}
            />
          ))
        )}

        {/* Tickets + tiers live on the campaign page. */}
        <TouchableOpacity onPress={openCampaign} activeOpacity={0.85} style={styles.cta}>
          <Text style={[styles.ctaText, fonts.bodyExtraBold]}>
            See tickets &amp; the full night ›
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={{ backgroundColor: "#0F0A1F", paddingBottom: insets.bottom }}>
        <BottomNav active="NYE" onNavigate={go} />
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
  // Full-bleed hero: the scroll container pads 16, the mockup's
  // detail hero bleeds to both edges (margin 0 -18px there).
  heroWrap: { marginHorizontal: -16, marginBottom: 16 },
  hero: { height: 232, justifyContent: "flex-end" },
  heroContent: { paddingHorizontal: 18, paddingBottom: 14 },
  heroTag: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(232,196,118,0.16)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  heroTagText: {
    color: premium.gold,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroName: { color: "#fff", fontSize: 25, fontWeight: "800", lineHeight: 30 },
  heroDates: { color: premium.ink2, fontSize: 12.5, fontWeight: "700", marginTop: 4 },
  goldline: { height: 1, marginTop: 18 },
  tagline: { color: premium.ink, fontSize: 15, fontWeight: "600", lineHeight: 21 },
  description: {
    color: premium.ink2,
    fontSize: 13.5,
    lineHeight: 22,
    marginTop: 8,
  },
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
    color: premium.muted,
    fontSize: 13.5,
    fontWeight: "600",
    lineHeight: 20,
    paddingTop: 4,
  },
  cta: {
    borderWidth: 1,
    borderColor: "rgba(232,196,118,0.55)",
    borderRadius: 13,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  ctaText: { color: premium.gold, fontSize: 14, fontWeight: "800" },
});
