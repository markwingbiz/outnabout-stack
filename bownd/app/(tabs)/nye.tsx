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
import { CampaignBanner, SceneEventCard, usePremiumFonts } from "../ui/premium";
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
        colors={["#0A0616", "#1E1733"]}
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

        {/* Campaign hero — the same banner Home's campaign slot uses,
            carrying the full Big Night name. */}
        <CampaignBanner
          presenter={campaign.presenter}
          name={heroName}
          datesLabel={campaign.datesLabel}
          gradient={campaign.gradient}
          onPress={openCampaign}
        />
        <Text style={[styles.tagline, fonts.bodySemiBold]}>{campaign.tagline}</Text>
        <Text style={[styles.description, fonts.body]}>{campaign.description}</Text>

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
  tagline: { color: premium.ink, fontSize: 15, fontWeight: "600", lineHeight: 21 },
  description: {
    color: premium.ink2,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 8,
  },
  showcaseChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(232,196,118,0.13)",
    borderWidth: 1,
    borderColor: "rgba(232,196,118,0.40)",
    marginBottom: 12,
  },
  showcaseChipText: { color: premium.gold, fontSize: 12, fontWeight: "900" },
  emptyText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    paddingTop: 4,
  },
  cta: {
    borderWidth: 1,
    borderColor: premium.goldBorder,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 16,
  },
  ctaText: { color: premium.gold, fontSize: 14, fontWeight: "800" },
});
