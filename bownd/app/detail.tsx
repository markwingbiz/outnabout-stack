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
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable, Alert, ImageBackground } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BrandBackground } from "./ui/BrandBackground";
import { BrandCard } from "./ui/BrandCard";
import { premium, spacing, theme, venueTilePalette } from "./ui/theme";
import {
  InfoRow,
  PremiumWordmark,
  SceneEventCard,
  formatMoney,
  ticketFeeCents,
  usePremiumFonts,
  venueMetaFor,
} from "./ui/premium";
import {
  CAMPAIGNS,
  campaignEvents,
  FEATURED_NO_DOUBLE_CHARGE_NOTE,
  FEATURED_VENUE_RATES,
  SPOTLIGHT_EVENT_RATES,
} from "../data/campaigns";
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
import { maybeAskForPushPermission } from "../lib/push";
import { track } from "../lib/analytics";
import {
  findShowcaseEvent,
  findShowcaseVenue,
  getShowcaseEvents,
  isShowcaseId,
} from "../data/showcase";
import {
  resolveCampaignImage,
  resolveCardImage,
  categoryForVenueName,
  categoryForText,
  resolveEventCardImage,
} from "../lib/placeholders";

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
  // Brochure fonts (Poppins titles / Manrope body) — loaded in
  // app/ui/premium.tsx; families are undefined until loaded, so text
  // falls back to the system font rather than blocking the screen.
  const fonts = usePremiumFonts();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [fav, setFav] = useState(false);

  // Campaign page (kind=campaign) ticket panel state.
  const [tierId, setTierId] = useState<string | null>(null);
  const [qty, setQty] = useState(2);

  useEffect(() => {
    let alive = true;
    // Pass the viewer's email so operator-only test items are visible
    // only to the operator (store.ts filters for everyone else).
    Promise.all([fetchEvents(user?.email ?? null), fetchVenues(user?.email ?? null)]).then(([rows, venueRows]) => {
      if (alive) {
        setEvents(rows);
        setVenues(venueRows);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [user?.email]);

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

  // Venue page (2026-11-13): kind=venue resolves a REAL catalog venue
  // by doc id first, then by name (the app's matching rule). The page
  // renders for real venues and, in showcase mode, for demo venues —
  // one branch, same anatomy (see pageVenue below).
  const realVenue = useMemo(() => {
    if (kind !== "venue" || !id) return undefined;
    return venues.find((x) => x.id === id) ?? venues.find((x) => x.name === id);
  }, [kind, id, venues]);

  const pageVenue: Venue | undefined = realVenue ?? demoVenue;

  const event = useMemo(
    () =>
      kind === "experience"
        ? undefined
        : (events.find((e) => e.id === id) ?? demoEvent),
    [events, id, kind, demoEvent]
  );

  const isDemo = !!demoEvent || !!demoVenue;

  // Campaign page (premium pass): kind=campaign&id=<campaign id>
  // renders the reusable campaign slot from data/campaigns.ts. The
  // lineup is matched from the real catalog; in showcase mode (real
  // catalog completely empty) the sample listings stand in, under the
  // showcase badge — same wholesale-fallback rule as Home/Events.
  const campaign = useMemo(
    () => (kind === "campaign" ? CAMPAIGNS.find((c) => c.id === id) : undefined),
    [kind, id]
  );

  const catalogEmpty = events.length === 0 && venues.length === 0;

  // The venue page's upcoming events: this venue's events from the
  // already-fetched catalog (showcase events stand in wholesale when
  // the real catalog is empty — never mixed). Matching is id first,
  // then name, the same rule the Events tab filter uses. Past events
  // drop off (1h grace for one that just started); discovered events
  // stay link-out, rendered from the same card as everywhere else.
  const venueEvents = useMemo(() => {
    if (!pageVenue) return [];
    const source = catalogEmpty ? getShowcaseEvents() : events;
    const now = Date.now();
    return source
      .filter((e) => {
        if (e.venueId === pageVenue.id || e.venueId === pageVenue.name) return true;
        const resolved = venues.find((x) => x.id === e.venueId || x.name === e.venueId);
        return resolved?.id === pageVenue.id;
      })
      .filter((e) => {
        const t = Date.parse(e.startISO);
        return Number.isNaN(t) || t >= now - 60 * 60 * 1000;
      })
      .sort((a, b) => (Date.parse(a.startISO) || 0) - (Date.parse(b.startISO) || 0));
  }, [pageVenue, events, venues, catalogEmpty]);

  const campaignLineup = useMemo(() => {
    if (!campaign) return [];
    if (catalogEmpty) return getShowcaseEvents();
    return campaignEvents(campaign, events);
  }, [campaign, events, catalogEmpty]);

  const campaignTier = useMemo(() => {
    const tiers = campaign?.ticketTiers ?? [];
    return tiers.find((t) => t.id === tierId) ?? tiers[0];
  }, [campaign, tierId]);

  function venueNameFor(e: EventItem): string {
    const v = venues.find((x) => x.id === e.venueId || x.name === e.venueId);
    return v?.name ?? findShowcaseVenue(e.venueId)?.name ?? (e.venueId || "Venue");
  }

  function onGetFeatured() {
    if (!campaign) return;
    const url =
      "mailto:support@getbownd.com" +
      `?subject=${encodeURIComponent(`Get featured — ${campaign.presenter} ${campaign.name}`)}` +
      `&body=${encodeURIComponent(
        "Hi Bownd — I'd like my venue/event featured in this campaign. Placement activates when payment verifies; nothing is charged until then."
      )}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Could not open mail", "Email us at support@getbownd.com to get featured.");
    });
  }

  function onCampaignTickets(totalCents: number) {
    // Checkout entry: the member tapped "Get tickets" with a tier and
    // quantity chosen — record the intent even though sales open with
    // the payment launch (checkout_started is the funnel's last step).
    void track("checkout_started", {
      meta: {
        campaign_id: campaign?.id ?? id ?? null,
        campaign_name: campaign?.name ?? null,
        tier: campaignTier?.name ?? null,
        qty,
        total_cents: totalCents,
      },
    });
    Alert.alert(
      "Tickets aren't on sale yet",
      `Your total would be ${formatMoney(totalCents)} — the full price, fees included, shown up front like always. Sales open with the campaign's payment launch.`
    );
  }

  const experience = useMemo(() => {
    if (event || pageVenue) return undefined;
    return EXPERIENCES.find((e) => e.id === id);
  }, [event, pageVenue, id]);

  const venueName = useMemo(() => {
    if (demoVenue) return demoVenue.name;
    if (!event) return "";
    const v = venues.find((x) => x.id === event.venueId || x.name === event.venueId);
    return v?.name ?? findShowcaseVenue(event.venueId)?.name ?? (event.venueId || "Venue");
  }, [demoVenue, event, venues]);

  // Favorite state for whichever item is shown.
  useEffect(() => {
    let alive = true;
    const favId = event?.id ?? pageVenue?.id ?? experience?.id;
    if (!favId) return;
    isFavorite(user?.uid ?? null, pageVenue ? "venue" : "event", favId)
      .then((v) => {
        if (alive) setFav(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [event?.id, pageVenue?.id, experience?.id, pageVenue, user?.uid]);

  // First-party analytics: one view signal per item per mount. The
  // ref guard keeps re-renders (favorite state, font loads) from
  // double-counting a single open; navigating to a different item
  // changes the key and fires again.
  const trackedViewRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (event) {
      const key = `event:${event.id}`;
      if (trackedViewRef.current === key) return;
      trackedViewRef.current = key;
      void track("event_view", {
        eventId: event.id,
        venueId: event.venueId,
        meta: {
          category: event.category,
          vibes: event.vibeTags,
          audience: event.audienceTags,
          venue_name: venueName,
          is_demo: isDemo,
          is_test: event.isTest === true,
          discovered: event.discovered === true,
        },
      });
    } else if (pageVenue) {
      const key = `venue:${pageVenue.id}`;
      if (trackedViewRef.current === key) return;
      trackedViewRef.current = key;
      void track("venue_view", {
        venueId: pageVenue.id,
        meta: {
          venue_name: pageVenue.name,
          is_demo: isDemo,
          is_test: pageVenue.isTest === true,
        },
      });
    }
  }, [loading, event, pageVenue, venueName, isDemo]);

  async function onToggleFav() {
    // Demo items: bookmark-only Save. Never any purchase/redeem action.
    const item: FavoriteItem | null = pageVenue
      ? {
          id: pageVenue.id,
          kind: "venue",
          title: pageVenue.name,
          subtitle: demoVenue ? "Showcase preview" : venueMetaFor(pageVenue.name),
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
      // First-party analytics: saves are the curiosity signal Livework
      // pairs with sales. Venue favorites aren't part of the event
      // taxonomy, so only event items emit save/unsave.
      if (item.kind === "event") {
        void track(nowFav ? "event_save" : "event_unsave", {
          eventId: item.id,
          venueId: event?.venueId ?? null,
          meta: { title: item.title, venue_name: venueName },
        });
      }
      // Plan §1.2 fallback moment: favoriting an event is the in-context
      // permission ask (fires at most once; never after a refusal).
      if (nowFav && item.kind === "event") {
        void maybeAskForPushPermission(user?.uid ?? null);
      }
    } catch {
      Alert.alert("Could not save favorite", "Try again.");
    }
  }

  function openVenueEvents() {
    // "See venue events" opens the venue PAGE (kind=venue branch
    // below), which lists that venue's upcoming events — resolving the
    // venue's doc id first, then its name, so it lands on the correct
    // venue even when the event's venueId is a legacy name. Showcase
    // events resolve to their demo venue the same way.
    const venue =
      venues.find((x) => x.id === event?.venueId || x.name === event?.venueId) ??
      findShowcaseVenue(event?.venueId ?? "");
    const vid = venue?.id ?? event?.venueId;
    if (!vid) return;
    router.push({ pathname: "/detail", params: { id: vid, kind: "venue" } });
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

  // Campaign ticket math (real fee: 2.5% + $0.99/ticket, totals shown
  // before purchase — see app/ui/premium.tsx ticketFeeCents).
  const campSubtotal = campaignTier ? campaignTier.priceCents * qty : 0;
  const campFee = ticketFeeCents(campSubtotal, qty);
  const campTotal = campSubtotal + campFee;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: premium.bg }}>
      <BrandBackground />

      <View style={styles.container}>
        <PremiumWordmark tagline="Pick a vibe. Pick a plan." />

        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={[styles.backText, fonts.bodyExtraBold]}>‹ Back</Text>
        </Pressable>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {loading ? (
            <BrandCard>
              <Text style={[styles.h2, fonts.display]}>Loading…</Text>
            </BrandCard>
          ) : campaign ? (
            <>
              <BrandCard>
                {catalogEmpty && (
                  <View style={styles.demoBadge}>
                    <Text style={[styles.demoBadgeText, fonts.bodyExtraBold]}>Showcase preview — sample listings</Text>
                  </View>
                )}
                <ImageBackground
                  source={resolveCampaignImage(campaignLineup[0]?.photoUrl)}
                  style={styles.detailBanner}
                  resizeMode="cover"
                >
                  <View style={styles.detailBannerScrim} />
                </ImageBackground>
                <View style={styles.campTag}>
                  <Text style={[styles.campTagText, fonts.bodyExtraBold]}>{campaign.presenter} · Spotlight</Text>
                </View>
                <Text style={[styles.h2, fonts.display]}>{campaign.name}</Text>
                <Text style={[styles.meta, fonts.bodySemiBold]}>{campaign.datesLabel}</Text>
                <Text style={[styles.sub, fonts.body]}>{campaign.description}</Text>
              </BrandCard>

              <BrandCard>
                <Text style={[styles.h2, fonts.display]}>The lineup</Text>
                {campaignLineup.length === 0 ? (
                  <Text style={[styles.sub, fonts.body]}>The lineup drops soon — check back.</Text>
                ) : (
                  <View style={{ marginTop: 14 }}>
                    {campaignLineup.map((e) => (
                      <SceneEventCard
                        key={e.id}
                        title={e.title}
                        venueName={venueNameFor(e)}
                        whenLabel={formatWhen(e.startISO)}
                        badge={e.isTest ? "Test" : undefined}
                        priceLabel={e.priceLabel || undefined}
                        photoUrl={e.photoUrl}
                        onPress={() =>
                          router.push({ pathname: "/detail", params: { id: e.id, kind: "event" } })
                        }
                      />
                    ))}
                  </View>
                )}
              </BrandCard>

              {campaignTier && campaign.ticketTiers && (
                <BrandCard>
                  <View style={styles.campRowBetween}>
                    <Text style={[styles.h2, fonts.display]}>Tickets</Text>
                    {!!campaign.refundLabel && (
                      <Text style={[styles.campMuted, fonts.bodySemiBold]}>Refund: {campaign.refundLabel}</Text>
                    )}
                  </View>
                  <View style={{ marginTop: 14 }}>
                    {campaign.ticketTiers.map((t) => {
                      const on = t.id === campaignTier.id;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => setTierId(t.id)}
                          style={[styles.tierRow, on && styles.tierRowOn]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.tierName, fonts.displayBold]}>{t.name}</Text>
                            <Text style={[styles.tierBlurb, fonts.body]}>{t.blurb}</Text>
                          </View>
                          <Text style={[styles.tierPrice, fonts.displayBold]}>{formatMoney(t.priceCents)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.campRowBetween}>
                    <Text style={[styles.tierName, fonts.displayBold]}>Quantity</Text>
                    <View style={styles.qtyWrap}>
                      <Pressable
                        onPress={() => setQty((n) => Math.max(1, n - 1))}
                        style={styles.qtyBtn}
                        hitSlop={6}
                      >
                        <Text style={[styles.qtyBtnText, fonts.bodyExtraBold]}>−</Text>
                      </Pressable>
                      <Text style={[styles.qtyVal, fonts.bodyExtraBold]}>{qty}</Text>
                      <Pressable
                        onPress={() => setQty((n) => Math.min(20, n + 1))}
                        style={styles.qtyBtn}
                        hitSlop={6}
                      >
                        <Text style={[styles.qtyBtnText, fonts.bodyExtraBold]}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.bill}>
                    <View style={styles.billRow}>
                      <Text style={[styles.billText, fonts.bodySemiBold]}>
                        {campaignTier.name} × {qty}
                      </Text>
                      <Text style={[styles.billText, fonts.bodySemiBold]}>{formatMoney(campSubtotal)}</Text>
                    </View>
                    <View style={styles.billRow}>
                      <Text style={[styles.billText, fonts.bodySemiBold]}>Bownd fee (2.5% + $0.99 / ticket)</Text>
                      <Text style={[styles.billText, fonts.bodySemiBold]}>{formatMoney(campFee)}</Text>
                    </View>
                    <View style={[styles.billRow, styles.billTotalRow]}>
                      <Text style={[styles.billTotalText, fonts.displayBold]}>Total due today</Text>
                      <Text style={[styles.billTotalText, fonts.displayBold]}>{formatMoney(campTotal)}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => onCampaignTickets(campTotal)}>
                    <LinearGradient
                      colors={[...premium.gradient]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.campCta}
                    >
                      <Text style={[styles.campCtaText, fonts.bodyExtraBold]}>Get tickets · {formatMoney(campTotal)}</Text>
                    </LinearGradient>
                  </Pressable>
                  <Text style={[styles.fineprint, fonts.body]}>
                    Full price and fees are shown before you pay — never added at the last step.
                    Members and free accounts pay the same ticket fee. {campaign.refundLabel}{" "}
                    policy: full refund, fee included, until 24 hours before doors.
                  </Text>
                </BrandCard>
              )}

              <BrandCard>
                <Text style={[styles.h2, fonts.display]}>Get featured in {campaign.name}</Text>
                <Text style={[styles.sub, fonts.body]}>
                  Sellable Featured placement inside this campaign — for venues and for events.
                  Placement activates only when payment verifies; nothing is charged here.
                </Text>
                <View style={styles.rateBlock}>
                  <Text style={[styles.rateTitle, fonts.displayBold]}>Featured venue</Text>
                  {FEATURED_VENUE_RATES.map((r) => (
                    <View key={r.label} style={styles.billRow}>
                      <Text style={[styles.billText, fonts.bodySemiBold]}>{r.label}</Text>
                      <Text style={[styles.billText, fonts.bodySemiBold]}>{r.price}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.rateBlock}>
                  <Text style={[styles.rateTitle, fonts.displayBold]}>Spotlight event</Text>
                  {SPOTLIGHT_EVENT_RATES.map((r) => (
                    <View key={r.label} style={styles.billRow}>
                      <Text style={[styles.billText, fonts.bodySemiBold]}>{r.label}</Text>
                      <Text style={[styles.billText, fonts.bodySemiBold]}>{r.price}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.fineprint, fonts.body]}>{FEATURED_NO_DOUBLE_CHARGE_NOTE}</Text>
                <Pressable onPress={onGetFeatured} style={styles.actionBtn}>
                  <Text style={[styles.actionBtnText, fonts.bodyExtraBold]}>Get featured</Text>
                </Pressable>
              </BrandCard>
            </>
          ) : event ? (
            <BrandCard>
              {isDemo && (
                <View style={styles.demoBadge}>
                  <Text style={[styles.demoBadgeText, fonts.bodyExtraBold]}>
                    Showcase preview — not a live listing
                  </Text>
                </View>
              )}
              {event.isTest && (
                <View style={styles.demoBadge}>
                  <Text style={[styles.demoBadgeText, fonts.bodyExtraBold]}>Test — operator only, not a live listing</Text>
                </View>
              )}
              {event.discovered && (
                <View style={styles.demoBadge}>
                  <Text style={[styles.demoBadgeText, fonts.bodyExtraBold]}>
                    From the web{event.sourceName ? ` · ${event.sourceName}` : ""} — not sold on Bownd
                  </Text>
                </View>
              )}
              <ImageBackground
                source={resolveEventCardImage(
                  event.photoUrl,
                  event.title,
                  ...(event.vibeTags || []),
                  ...(event.audienceTags || [])
                )}
                style={styles.detailBanner}
                resizeMode="cover"
              >
                <View style={styles.detailBannerScrim} />
              </ImageBackground>
              <Text style={[styles.h2, fonts.display]}>{event.title}</Text>
              <Text style={[styles.meta, fonts.bodySemiBold]}>
                {venueName} • {formatWhen(event.startISO)}
                {event.priceLabel ? ` • ${event.priceLabel}` : ""}
              </Text>

              <View style={styles.tagRow}>
                {[...(event.vibeTags || []), ...(event.audienceTags || [])].map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={[styles.tagText, fonts.bodyBold]}>{t}</Text>
                  </View>
                ))}
              </View>

              {event.discovered ? (
                // Link-out ONLY: the primary action opens the event at
                // its source. No "See venue events" (a discovered listing
                // has no Bownd venue) and never any purchase/redeem UI.
                <View style={styles.actionsRow}>
                  {!!event.sourceUrl && (
                    <Pressable
                      onPress={() => openWebsite(event.sourceUrl as string)}
                      style={styles.actionBtn}
                    >
                      <Text style={[styles.actionBtnText, fonts.bodyExtraBold]}>
                        View at {event.sourceName ?? "source"}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={onToggleFav}
                    style={[styles.actionBtn, styles.actionBtnGhost]}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnGhostText, fonts.bodyExtraBold]}>
                      {fav ? "♥ Saved" : "♡ Save"}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actionsRow}>
                  <Pressable onPress={onToggleFav} style={styles.actionBtn}>
                    <Text style={[styles.actionBtnText, fonts.bodyExtraBold]}>{fav ? "♥ Saved" : "♡ Save"}</Text>
                  </Pressable>
                  <Pressable onPress={openVenueEvents} style={[styles.actionBtn, styles.actionBtnGhost]}>
                    <Text style={[styles.actionBtnText, styles.actionBtnGhostText, fonts.bodyExtraBold]}>See venue events</Text>
                  </Pressable>
                </View>
              )}
            </BrandCard>
          ) : pageVenue ? (
            <>
              <BrandCard>
                {isDemo && (
                  <View style={styles.demoBadge}>
                    <Text style={[styles.demoBadgeText, fonts.bodyExtraBold]}>
                      Showcase preview — not a live listing
                    </Text>
                  </View>
                )}
                {pageVenue.isTest && (
                  <View style={styles.demoBadge}>
                    <Text style={[styles.demoBadgeText, fonts.bodyExtraBold]}>
                      Test — operator only, not a live listing
                    </Text>
                  </View>
                )}
                {pageVenue.photoUrl ? (
                  <ImageBackground
                    source={resolveCardImage(pageVenue.photoUrl, categoryForVenueName(pageVenue.name))}
                    style={styles.detailBanner}
                    resizeMode="cover"
                  >
                    <View style={styles.detailBannerScrim} />
                  </ImageBackground>
                ) : (
                  // No venue photo: the decided icon-tile treatment,
                  // large — category icon on its solid tile color.
                  <View
                    style={[
                      styles.venueHeroTile,
                      {
                        backgroundColor:
                          venueTilePalette[categoryForVenueName(pageVenue.name)],
                      },
                    ]}
                  >
                    <Ionicons name="location" size={46} color="#fff" />
                  </View>
                )}
                <Text style={[styles.h2, fonts.display]}>{pageVenue.name}</Text>
                <Text style={[styles.meta, fonts.bodySemiBold]}>
                  {venueMetaFor(pageVenue.name)}
                  {pageVenue.verified ? " · ✓ Verified" : ""}
                  {pageVenue.featured ? " · ★ Featured" : ""}
                </Text>

                {/* Standing partner perk — explainer only: venues carry
                    no perk field yet, so the page states the decided
                    partner rule, never an invented venue-specific perk. */}
                <View style={{ marginTop: 14 }}>
                  <InfoRow
                    icon="gift"
                    title="A standing perk for members"
                    body="Partner venues give paid Bownd members a standing free perk, defined by the venue at onboarding. Claim one free perk per partner per calendar quarter, verified with a member scan at the door."
                  />
                </View>

                <View style={styles.actionsRow}>
                  <Pressable onPress={onToggleFav} style={styles.actionBtn}>
                    <Text style={[styles.actionBtnText, fonts.bodyExtraBold]}>
                      {fav ? "♥ Saved" : "♡ Save"}
                    </Text>
                  </Pressable>
                </View>
              </BrandCard>

              <BrandCard>
                <Text style={[styles.h2, fonts.display]}>Coming up at {pageVenue.name}</Text>
                {venueEvents.length === 0 ? (
                  <Text style={[styles.sub, fonts.bodySemiBold]}>
                    No upcoming events listed yet — check back soon.
                  </Text>
                ) : (
                  <View style={{ marginTop: 14 }}>
                    {venueEvents.map((e) => (
                      <SceneEventCard
                        key={e.id}
                        title={e.title}
                        venueName={pageVenue.name}
                        whenLabel={formatWhen(e.startISO)}
                        badge={e.isTest ? "Test" : undefined}
                        webBadge={
                          e.discovered
                            ? `From the web${e.sourceName ? ` · ${e.sourceName}` : ""} — view at source ↗`
                            : undefined
                        }
                        priceLabel={e.priceLabel || undefined}
                        photoUrl={e.photoUrl}
                        onPress={() =>
                          e.discovered && e.sourceUrl
                            ? openWebsite(e.sourceUrl)
                            : router.push({
                                pathname: "/detail",
                                params: { id: e.id, kind: "event" },
                              })
                        }
                      />
                    ))}
                  </View>
                )}
              </BrandCard>
            </>
          ) : experience ? (
            <BrandCard>
              <ImageBackground
                source={resolveCardImage(
                  undefined,
                  categoryForText(experience.title, ...experience.vibes, ...experience.personas)
                )}
                style={styles.detailBanner}
                resizeMode="cover"
              >
                <View style={styles.detailBannerScrim} />
              </ImageBackground>
              <Text style={[styles.h2, fonts.display]}>{experience.title}</Text>
              <Text style={[styles.meta, fonts.bodySemiBold]}>
                {experience.neighborhood} • {experience.price} • {experience.duration}
              </Text>
              <Text style={[styles.sub, fonts.body]}>{experience.description}</Text>

              <View style={styles.tagRow}>
                {[...experience.personas, ...experience.vibes].map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={[styles.tagText, fonts.bodyBold]}>{t}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.actionsRow}>
                <Pressable onPress={onToggleFav} style={styles.actionBtn}>
                  <Text style={[styles.actionBtnText, fonts.bodyExtraBold]}>{fav ? "♥ Saved" : "♡ Save"}</Text>
                </Pressable>
                {!!experience.website && (
                  <Pressable
                    onPress={() => openWebsite(experience.website as string)}
                    style={[styles.actionBtn, styles.actionBtnGhost]}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnGhostText, fonts.bodyExtraBold]}>Visit website</Text>
                  </Pressable>
                )}
              </View>
            </BrandCard>
          ) : (
            <BrandCard>
              <Text style={[styles.h2, fonts.display]}>Not found</Text>
              <Text style={[styles.sub, fonts.body]}>
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

  // Mockup .backbtn — a surface pill, not bare text.
  backBtn: {
    alignSelf: "flex-start",
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
    borderRadius: 999,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 14,
    marginBottom: 12,
  },
  backText: {
    color: premium.ink,
    fontSize: 13,
    fontWeight: "800",
  },

  h2: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "800",
  },

  // Detail header image: mockup placeholder picture (or the listing's real photo
  // when one exists) above the title. No text sits on the image, so the
  // scrim is only a light darkening for a finished look.
  detailBanner: {
    height: 210,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: premium.line,
  },
  detailBannerScrim: {
    flex: 1,
    backgroundColor: "rgba(8,5,18,0.18)",
  },
  // Venue page hero when the venue has no photo: the icon-tile
  // treatment at hero size (category color, white glyph).
  venueHeroTile: {
    height: 210,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: premium.line,
  },

  demoBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: premium.goldSoft,
    borderWidth: 1,
    borderColor: premium.goldBorder,
    marginBottom: 10,
  },
  demoBadgeText: {
    color: premium.gold,
    fontSize: 12,
    fontWeight: "900",
  },

  meta: {
    color: premium.ink2,
    marginTop: 8,
    fontWeight: "600",
    fontSize: 12.5,
  },

  sub: {
    color: premium.ink2,
    marginTop: 8,
    fontWeight: "500",
    fontSize: 13.5,
    lineHeight: 22,
  },

  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },

  tag: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
  },

  tagText: {
    color: premium.ink2,
    fontSize: 12,
    fontWeight: "800",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap",
  },
  // Mockup act-row: Save is a surface button (.btn-save), the venue
  // action is a gold outline (.btn-venue) — gold is never the fill.
  actionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    color: premium.ink,
    fontWeight: "800",
    fontSize: 14,
  },
  actionBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(232,196,118,0.55)",
  },
  actionBtnGhostText: {
    color: premium.gold,
  },

  // Campaign page (premium pass) — mockup event-page anatomy on the
  // detail screen's BrandCard surfaces.
  campTag: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(232,196,118,0.16)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 10,
  },
  campTagText: {
    color: premium.gold,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  campRowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  campMuted: { color: theme.subtext, fontSize: 12.5, fontWeight: "700" },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line2,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 9,
  },
  // Mockup .tier.on: violet selection ring on surface3, not gold.
  tierRowOn: { borderColor: "#6D28D9", backgroundColor: premium.surface3 },
  tierName: { color: theme.text, fontSize: 14.5, fontWeight: "800" },
  tierBlurb: { color: theme.subtext, fontSize: 12, fontWeight: "600", marginTop: 2 },
  tierPrice: { color: theme.text, fontSize: 15, fontWeight: "900" },
  qtyWrap: { flexDirection: "row", alignItems: "center", gap: 14 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: premium.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: { color: theme.text, fontSize: 17, fontWeight: "900" },
  qtyVal: { color: theme.text, fontSize: 15, fontWeight: "900", minWidth: 16, textAlign: "center" },
  bill: {
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginTop: 12,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 4,
  },
  billText: { color: premium.ink2, fontSize: 13, fontWeight: "600" },
  billTotalRow: {
    borderTopWidth: 1,
    borderTopColor: premium.line,
    marginTop: 8,
    paddingTop: 11,
  },
  billTotalText: { color: theme.text, fontSize: 15, fontWeight: "800" },
  campCta: {
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 14,
  },
  campCtaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  fineprint: {
    color: theme.subtext,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 12,
  },
  rateBlock: { marginTop: 14 },
  rateTitle: { color: theme.text, fontSize: 14, fontWeight: "800", marginBottom: 4 },
});
