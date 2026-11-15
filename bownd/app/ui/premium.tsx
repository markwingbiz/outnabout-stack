// app/ui/premium.tsx
// Premium UI components (bownd premium UI pass, 2026-11-11), built from
// the approved mockup's Bownd Premium phone and the tokens in
// app/ui/theme.ts (export `premium`). Display components only — every
// value rendered here comes from real props (catalog data, profile
// points); nothing in this file invents counts, prices, or balances.
//
// Anatomy rules carried from the mockup + Mark's decisions:
// - Event cards (mockup .ev-card, verbatim): photo crop (158 tall)
//   ABOVE a surface caption — tag chip, Poppins title, one meta row
//   (bold day · time, venue), then a footer row with the price in
//   Poppins and a "Details ›" link. No text sits on the photo; the
//   only element over the photo is the favorite-heart accessory on
//   the Events tab, styled as the mockup's .heart circle.
// - Venue tiles: small icon tile (icon on solid color + name). A real
//   venue photoUrl still wins when the venue supplied one.
// - Gold is the points/campaign/featured accent only.
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import {
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import { premium, venueTilePalette } from "./theme";
import {
  categoryForVenueName,
  resolveCampaignImage,
  resolveCardImage,
  resolveEventCardImage,
  type PlaceholderCategory,
} from "../../lib/placeholders";

// ---------------------------------------------------------------------------
// Money + ticket fee math (Bownd's decided fee: 2.5% + $0.99 per ticket)
// ---------------------------------------------------------------------------
// Verified against the mockup's worked example: Premium $85 x2 =
// $170.00 subtotal, fee $6.23 (170 x 2.5% = $4.25 + 2 x $0.99 = $1.98),
// total $176.23. The same fee applies to members and free accounts —
// fee relief is not a member perk (decided 2026-10-23).

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ticketFeeCents(subtotalCents: number, quantity: number): number {
  return Math.round(subtotalCents * 0.025) + 99 * quantity;
}

export function ticketTotalCents(subtotalCents: number, quantity: number): number {
  return subtotalCents + ticketFeeCents(subtotalCents, quantity);
}

// ---------------------------------------------------------------------------
// Fonts (brochure restyle, 2026-11-13; Mark's font split): Poppins for
// titles/headlines/card titles/prices, Manrope for body/UI text.
// Loaded here via expo-font's useFonts — deliberately NOT in _layout.
// Until loading finishes (or if it fails), every family below is
// undefined and text falls back to the current system font.
// ---------------------------------------------------------------------------

export type PremiumFontStyles = {
  loaded: boolean;
  display?: { fontFamily: string };
  displayBold?: { fontFamily: string };
  body?: { fontFamily: string };
  bodySemiBold?: { fontFamily: string };
  bodyBold?: { fontFamily: string };
  bodyExtraBold?: { fontFamily: string };
};

export function usePremiumFonts(): PremiumFontStyles {
  const [loaded] = useFonts({
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  if (!loaded) return { loaded: false };
  return {
    loaded: true,
    display: { fontFamily: "Poppins_800ExtraBold" },
    displayBold: { fontFamily: "Poppins_700Bold" },
    body: { fontFamily: "Manrope_400Regular" },
    bodySemiBold: { fontFamily: "Manrope_600SemiBold" },
    bodyBold: { fontFamily: "Manrope_700Bold" },
    bodyExtraBold: { fontFamily: "Manrope_800ExtraBold" },
  };
}

// ---------------------------------------------------------------------------
// PinEmblem — the brochure pin (Mark, 2026-11-13): blue -> violet
// gradient drop pin with a gold rim, a gold ring forming the center
// hole, a fine gold inner contour, and gold notch marks on the right
// edge. Drawn as SVG: the app icon / splash PNG assets cannot carry
// this emblem (regenerating those binaries is a follow-up).
// PremiumWordmark pairs it with the lowercase "bownd." wordmark —
// used where the premium UI shows the brand (e.g. the detail header).
// ---------------------------------------------------------------------------

export function PinEmblem({ size = 30 }: { size?: number }) {
  const raw = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const fillId = `pinFill${raw}`;
  const rimId = `pinRim${raw}`;
  return (
    <Svg width={size} height={(size * 56) / 48} viewBox="0 0 48 56">
      <Defs>
        <SvgLinearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2F6BFF" />
          <Stop offset="0.55" stopColor="#5B34E0" />
          <Stop offset="1" stopColor="#7A2BD0" />
        </SvgLinearGradient>
        <SvgLinearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F2D894" />
          <Stop offset="1" stopColor="#C9A24B" />
        </SvgLinearGradient>
      </Defs>
      <Path
        d="M24 3C13.5 3 5 11.8 5 22.5C5 37 24 53 24 53C24 53 43 37 43 22.5C43 11.8 34.5 3 24 3Z"
        fill={`url(#${fillId})`}
        stroke={`url(#${rimId})`}
        strokeWidth={1.5}
      />
      <Path
        d="M24 7.5C15.8 7.5 9.5 14.3 9.5 22.4C9.5 33.4 24 47 24 47C24 47 38.5 33.4 38.5 22.4C38.5 14.3 32.2 7.5 24 7.5Z"
        fill="none"
        stroke="#E8C476"
        strokeOpacity={0.5}
        strokeWidth={0.8}
      />
      <Circle cx={24} cy={22.5} r={9} fill="none" stroke={`url(#${rimId})`} strokeWidth={1.6} />
      <Circle
        cx={24}
        cy={22.5}
        r={5.4}
        fill="#0A0616"
        stroke="#E8C476"
        strokeOpacity={0.65}
        strokeWidth={0.8}
      />
      <Path d="M40 17.8L44.6 16.4" stroke="#E8C476" strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M41 23.5L45.2 23.5" stroke="#E8C476" strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M40 29.2L44.6 30.6" stroke="#E8C476" strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}

export function PremiumWordmark({
  tagline,
  emblemSize = 32,
}: {
  tagline?: string;
  emblemSize?: number;
}) {
  const fonts = usePremiumFonts();
  return (
    <View style={styles.wordmarkWrap}>
      <View style={styles.wordmarkRow}>
        <PinEmblem size={emblemSize} />
        <Text style={[styles.wordmarkText, fonts.display]}>
          bownd<Text style={{ color: premium.violet }}>.</Text>
        </Text>
      </View>
      {!!tagline && (
        <Text style={[styles.wordmarkTagline, fonts.bodySemiBold]}>{tagline}</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Points pill — the gold header pill from the premium Home. The value
// is always the real profile balance; the Home header renders it at
// 0 too (mockup header shape), where 0 is the true balance of a new
// or free account — never an invented positive number.
// ---------------------------------------------------------------------------

export function PointsPill({ points }: { points: number }) {
  const fonts = usePremiumFonts();
  return (
    <View style={styles.pointsPill}>
      <Text style={[styles.pointsPillText, fonts.bodyExtraBold]}>
        ★ {points.toLocaleString()} pts · ${(points / 100).toFixed(2)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SceneEventCard — photo crop above, caption below (mockup .ev-card).
// ---------------------------------------------------------------------------

export function SceneEventCard({
  title,
  venueName,
  whenLabel,
  priceLabel,
  badge,
  webBadge,
  photoUrl,
  tags,
  onPress,
  accessory,
  style,
}: {
  title: string;
  venueName: string;
  whenLabel: string;
  priceLabel?: string;
  badge?: string;
  webBadge?: string;
  photoUrl?: string;
  tags?: string[];
  onPress: () => void;
  /** Floating control on the photo's top-right (e.g. favorite heart). */
  accessory?: React.ReactNode;
  style?: object;
}) {
  const fonts = usePremiumFonts();
  // Mockup .ev-meta leads with the day in bold ink, then the time:
  // formatWhen gives "Tonight • 7:00 PM" / "Dec 31 • 9:00 PM".
  const whenParts = whenLabel.split(" • ");
  const whenHead = whenParts[0];
  const whenTail = whenParts.slice(1).join(" • ");
  return (
    // Root is a plain View: the card pressable and the accessory (e.g.
    // a favorite heart) are SIBLINGS, so tapping the accessory never
    // also fires the card press — the same guarantee the Events tab
    // engineered before this pass.
    <View style={[styles.evCard, style]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.88}>
        <Image
          source={resolveEventCardImage(photoUrl, title, venueName, ...(tags ?? []))}
          style={styles.evPhoto}
          resizeMode="cover"
        />
        <View style={styles.evCaption}>
          {!!badge && (
            <View style={styles.evBadge}>
              <Text style={[styles.evBadgeText, fonts.bodyExtraBold]}>{badge}</Text>
            </View>
          )}
          <Text style={[styles.evTitle, fonts.displayBold]} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.evMeta}>
            <Text style={[styles.evMetaText, fonts.bodySemiBold]}>
              <Text style={[styles.evMetaBold, fonts.bodyBold]}>{whenHead}</Text>
              {whenTail ? ` · ${whenTail}` : ""}
            </Text>
            <Text style={[styles.evMetaText, fonts.bodySemiBold]} numberOfLines={1}>
              {venueName}
            </Text>
          </View>
          {!!webBadge && <Text style={[styles.evWeb, fonts.bodyExtraBold]}>{webBadge}</Text>}
          {!!tags && tags.length > 0 && (
            <View style={styles.evTags}>
              {tags.slice(0, 4).map((t) => (
                <View key={t} style={styles.evTag}>
                  <Text style={[styles.evTagText, fonts.bodyBold]}>{t}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.evFoot}>
            {!!priceLabel ? (
              <Text style={[styles.evPrice, fonts.display]}>{priceLabel}</Text>
            ) : (
              <View />
            )}
            <Text style={[styles.evMore, fonts.bodyExtraBold]}>Details ›</Text>
          </View>
        </View>
      </TouchableOpacity>
      {!!accessory && <View style={styles.evAccessory}>{accessory}</View>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PlaylistRailCard — Featured Playlists rail card (mockup .pl-card):
// cover photo on top, tag + title + meta in the caption below.
// ---------------------------------------------------------------------------

export function PlaylistRailCard({
  title,
  subtitle,
  itemCount,
  coverPhotoUrl,
  tag,
  tagGold,
  onPress,
}: {
  title: string;
  subtitle: string;
  itemCount: number;
  coverPhotoUrl?: string;
  tag?: string;
  tagGold?: boolean;
  onPress: () => void;
}) {
  const fonts = usePremiumFonts();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={styles.plCard}>
      <Image
        source={resolveEventCardImage(coverPhotoUrl, title, tag)}
        style={styles.plPhoto}
        resizeMode="cover"
      />
      <View style={styles.plCaption}>
        {!!tag &&
          (tagGold ? (
            <View style={[styles.plTag, styles.plTagGold]}>
              <Text style={[styles.plTagText, fonts.bodyExtraBold, { color: premium.gold }]}>
                {tag}
              </Text>
            </View>
          ) : (
            <LinearGradient
              colors={[...premium.gradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.plTag}
            >
              <Text style={[styles.plTagText, fonts.bodyExtraBold]}>{tag}</Text>
            </LinearGradient>
          ))}
        <Text style={[styles.plTitle, fonts.displayBold]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.plMeta, fonts.bodySemiBold]} numberOfLines={1}>
          {itemCount} {itemCount === 1 ? "pick" : "picks"} · {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// VenueTile — v1 venue language (mockup .v-tile): small tile, icon on
// solid color + name. A real photoUrl wins when the venue supplied one
// (then the tile shows the photo with the name in the caption below).
// ---------------------------------------------------------------------------

/** Short category label for a venue tile's meta line (app's own
 * keyword categorization of the venue name — same source as the tile
 * icon/color, so the three never disagree). */
export function venueMetaFor(name: string): string {
  switch (categoryForVenueName(name)) {
    case "music":
      return "Live music";
    case "food":
      return "Food & drink";
    case "family":
      return "Family friendly";
    case "nightlife":
      return "Nightlife";
    case "arts":
      return "Arts";
    default:
      return "Kansas City";
  }
}

// Mockup tiles carry white STROKE icons (music note, building,
// cocktail glass, clock) — Ionicons' outline variants are the same
// line language; the filled glyphs read as clipart next to them.
const VENUE_ICONS: Record<PlaceholderCategory, keyof typeof Ionicons.glyphMap> = {
  music: "musical-notes-outline",
  nightlife: "moon-outline",
  food: "wine-outline",
  family: "people-outline",
  arts: "color-palette-outline",
  default: "location-outline",
};

export function VenueTile({
  name,
  meta,
  photoUrl,
  verified,
  isTest,
  featured,
  onPress,
  style,
}: {
  name: string;
  meta?: string;
  photoUrl?: string;
  verified?: boolean;
  isTest?: boolean;
  featured?: boolean;
  onPress: () => void;
  style?: object;
}) {
  const fonts = usePremiumFonts();
  const category = categoryForVenueName(name);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={[styles.vTile, style]}>
      {photoUrl ? (
        <Image source={resolveCardImage(photoUrl, category)} style={styles.vPhoto} resizeMode="cover" />
      ) : (
        <View style={[styles.vIcon, { backgroundColor: venueTilePalette[category] }]}>
          <Ionicons name={VENUE_ICONS[category]} size={21} color="#fff" />
        </View>
      )}
      <Text style={[styles.vName, fonts.displayBold]} numberOfLines={2}>
        {name}
      </Text>
      {!!meta && (
        <Text style={[styles.vMeta, fonts.bodySemiBold]} numberOfLines={1}>
          {meta}
        </Text>
      )}
      {isTest && <Text style={[styles.vTest, fonts.bodyExtraBold]}>Test</Text>}
      {!isTest && verified && <Text style={[styles.vVerified, fonts.bodyExtraBold]}>✓ Verified</Text>}
      {!isTest && featured && <Text style={[styles.vFeatured, fonts.bodyExtraBold]}>★ Featured</Text>}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// InfoRow — the mockup's .perk row: small icon square + title + body.
// `light` renders on the Personal screen's light panel; default is the
// dark surface used on Home / campaign pages.
// ---------------------------------------------------------------------------

export function InfoRow({
  icon,
  glyph,
  title,
  body,
  light,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  /** Big numeral/glyph instead of an icon (earn-rate rows: "1", "50", "25"). */
  glyph?: string;
  title: string;
  body: string;
  light?: boolean;
}) {
  const fonts = usePremiumFonts();
  return (
    <View style={[styles.infoRow, light && styles.infoRowLight]}>
      <View style={[styles.infoIcon, light && styles.infoIconLight]}>
        {glyph ? (
          <Text style={[styles.infoGlyph, fonts.display, light && { color: "#6242bb" }]}>
            {glyph}
          </Text>
        ) : (
          <Ionicons name={icon ?? "sparkles"} size={18} color={light ? "#6242bb" : premium.gold} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoTitle, fonts.bodyExtraBold, light && styles.infoTitleLight]}>
          {title}
        </Text>
        <Text style={[styles.infoBody, fonts.bodySemiBold, light && styles.infoBodyLight]}>
          {body}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CampaignBanner — Home's campaign slot entry (config-driven; see
// data/campaigns.ts). Theme colors come from the campaign config.
//
// Visual pass (2026-11-15): the banner is a designed HERO in the
// mockup's detail-hero language — photography first (the mockup's NYE
// sparkler picture via lib/placeholders.ts; a campaign has
// no photo of its own), the campaign's gradient laid over it as a
// tint, a bottom scrim for legibility, and the mockup's hero-badge
// chip (dark glass, gold rim + gold text) above a Poppins headline.
// A flat gradient rectangle is exactly what the owner rejected.
// ---------------------------------------------------------------------------

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function CampaignBanner({
  presenter,
  name,
  datesLabel,
  gradient,
  onPress,
}: {
  presenter: string;
  name: string;
  datesLabel: string;
  gradient: readonly [string, string, string];
  onPress: () => void;
}) {
  const fonts = usePremiumFonts();
  const tint = gradient.map((c) => hexToRgba(c, 0.52)) as [string, string, string];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={styles.campaignWrap}>
      <ImageBackground
        source={resolveCampaignImage(undefined)}
        style={styles.campaignHero}
        imageStyle={styles.campaignHeroImg}
        resizeMode="cover"
      >
        <LinearGradient
          colors={tint}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={["rgba(10,6,22,0)", "rgba(10,6,22,0.52)", "rgba(10,6,22,0.94)"]}
          locations={[0.3, 0.68, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.campaignContent}>
          <View style={styles.campaignTag}>
            <Text style={[styles.campaignTagText, fonts.bodyExtraBold]}>
              {presenter} · Spotlight
            </Text>
          </View>
          <Text style={[styles.campaignName, fonts.display]}>{name}</Text>
          <Text style={[styles.campaignDates, fonts.bodyBold]}>{datesLabel}</Text>
          <Text style={[styles.campaignCta, fonts.bodyExtraBold]}>See the night ›</Text>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wordmarkWrap: { alignItems: "center", justifyContent: "center", marginBottom: 8 },
  wordmarkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmarkText: { color: "#fff", fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  wordmarkTagline: {
    marginTop: 6,
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    textAlign: "center",
  },

  pointsPill: {
    alignSelf: "flex-start",
    backgroundColor: premium.goldSoft,
    borderWidth: 1,
    borderColor: premium.goldBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pointsPillText: { color: premium.gold, fontSize: 12, fontWeight: "800" },

  evCard: {
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 13,
  },
  evPhoto: { width: "100%", height: 158 },
  // Mockup .tag .tag-gold — a small rounded-rect chip in the caption,
  // never a pill floating on the photo.
  evBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(232,196,118,0.16)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  evBadgeText: {
    color: premium.gold,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  evAccessory: { position: "absolute", top: 8, right: 8 },
  evCaption: { paddingHorizontal: 15, paddingTop: 13, paddingBottom: 14 },
  evTitle: { color: premium.ink, fontSize: 16.5, fontWeight: "700", lineHeight: 20 },
  evMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 14,
    rowGap: 4,
    marginTop: 8,
    alignItems: "center",
  },
  evMetaText: { color: premium.ink2, fontSize: 12.5, fontWeight: "600" },
  evMetaBold: { color: premium.ink, fontWeight: "700" },
  evWeb: { color: premium.link, fontSize: 11.5, fontWeight: "800", marginTop: 7 },
  evTags: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  evTag: {
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  evTagText: { color: premium.ink2, fontSize: 12, fontWeight: "700" },
  evFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  evPrice: { color: premium.ink, fontSize: 16, fontWeight: "800" },
  evMore: { color: premium.link, fontSize: 11.5, fontWeight: "800" },

  plCard: {
    width: 218,
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: 16,
    overflow: "hidden",
  },
  plPhoto: { width: "100%", height: 118 },
  plCaption: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 13 },
  plTag: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  plTagGold: { backgroundColor: "rgba(232,196,118,0.16)" },
  plTagText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  plTitle: { color: premium.ink, fontSize: 14.5, fontWeight: "700", lineHeight: 18 },
  plMeta: { color: premium.muted, fontSize: 12, fontWeight: "600", marginTop: 4 },

  vTile: {
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 15,
    width: 158,
  },
  vIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  vPhoto: { width: "100%", height: 64, borderRadius: 11, marginBottom: 10 },
  vName: { color: premium.ink, fontSize: 14, fontWeight: "700", lineHeight: 18 },
  vMeta: { color: premium.muted, fontSize: 11.5, fontWeight: "600", marginTop: 3 },
  vTest: { color: premium.gold, fontSize: 11, fontWeight: "900", marginTop: 5 },
  vVerified: { color: premium.green, fontSize: 11, fontWeight: "900", marginTop: 5 },
  vFeatured: { color: premium.gold, fontSize: 11, fontWeight: "900", marginTop: 5 },

  infoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 9,
  },
  infoRowLight: { backgroundColor: "#ffffff", borderColor: "#d5d0df" },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: premium.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  infoIconLight: { backgroundColor: "#ece8f6" },
  infoGlyph: { color: premium.gold, fontSize: 15, fontWeight: "900" },
  // Mockup .perk: the title is Manrope 800 13.5 (not display type);
  // the body is 12px muted at 1.5 line height.
  infoTitle: { color: premium.ink, fontSize: 13.5, fontWeight: "800", lineHeight: 18 },
  infoTitleLight: { color: "#221c2a" },
  infoBody: { color: premium.muted, fontSize: 12, fontWeight: "600", lineHeight: 18, marginTop: 2 },
  infoBodyLight: { color: "#514a5a" },

  campaignWrap: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: premium.line2,
  },
  campaignHero: { minHeight: 198, justifyContent: "flex-end" },
  campaignHeroImg: { borderRadius: 18 },
  campaignContent: { padding: 16 },
  // Mockup .hero-badge: dark glass chip, gold rim, gold caps text.
  campaignTag: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(12,8,26,0.55)",
    borderWidth: 1,
    borderColor: "rgba(232,196,118,0.45)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  campaignTagText: {
    color: premium.gold,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  campaignName: { color: "#fff", fontSize: 25, fontWeight: "800", lineHeight: 30, marginTop: 10 },
  campaignDates: { color: "rgba(255,255,255,0.88)", fontSize: 12.5, fontWeight: "700", marginTop: 5 },
  campaignCta: { color: premium.gold, fontSize: 13.5, fontWeight: "800", marginTop: 11 },
});
