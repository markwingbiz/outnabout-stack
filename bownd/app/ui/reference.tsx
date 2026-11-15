// app/ui/reference.tsx
// Shared UI extracted from the reference preview (App.tsx): design tokens,
// Pill, Section, EventCard, Search, BottomNav, plus the shared
// formatWhen / venue-name helpers. EventCard renders a background image
// (the mockup placeholder picture via lib/placeholders.ts, or the listing's real
// photoUrl when one exists) under the App.tsx overlay gradient — never
// a remote image, never presented as a photo. All data comes from the
// real backend via the screens.
//
// Premium skeleton pass (2026-11-15): the bottom nav is the approved
// mockup's five-item bar (Home, Events, NYE, Venues, Rewards) and the
// top tab row is GONE — the mockup has no top tabs. Search, Pill and
// Section are restyled onto the premium tokens in app/ui/theme.ts
// (deep plum surfaces, champagne-gold hairlines, brand gradient).
import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ImageBackground,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import type { Venue } from "../../lib/store";
import { resolveEventCardImage } from "../../lib/placeholders";
import { premium } from "./theme";
import { usePremiumFonts } from "./premium";

export type Tab = "Home" | "Events" | "NYE" | "Venues" | "Rewards";
// Deep plum solid (premium.violet) — was vivid brand violet #5B34E0
// before the owner's 2026-11-15 plum direction. Currently unreferenced;
// kept in step with the token so nothing reaches for the old purple.
export const PURPLE = "#4A4368";
export const INK = "#0A0616";
export const WIDTH = Dimensions.get("window").width;

export const TAB_ROUTES: Record<Tab, string> = {
  Home: "/(tabs)",
  Events: "/(tabs)/events",
  NYE: "/(tabs)/nye",
  Venues: "/(tabs)/venues",
  Rewards: "/(tabs)/personal",
};

// ---------------------------------------------------------------------------
// Shared helpers (same logic as the existing screens)
// ---------------------------------------------------------------------------

export function parseISO(iso: string): Date | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}

export function formatWhen(startISO: string): string {
  const d = parseISO(startISO);
  if (!d) return "Time TBD";
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0);
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

export function getVenueName(venueId: string, venues: Venue[]): string {
  const v = venues.find((x) => x.id === venueId || x.name === venueId);
  return v?.name ?? (venueId || "Venue");
}

// ---------------------------------------------------------------------------
// Components (App.tsx, adapted for Expo Router)
// ---------------------------------------------------------------------------

export function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const fonts = usePremiumFonts();
  if (active) {
    // Mockup .fchip.on — the brand gradient, white text.
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <LinearGradient
          colors={[...premium.brandGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[refStyles.pill, refStyles.pillGradient]}
        >
          <Text style={[refStyles.pillText, fonts.bodyExtraBold]}>{label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} style={refStyles.pill} activeOpacity={0.85}>
      <Text style={[refStyles.pillText, fonts.bodyBold]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Section({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  const fonts = usePremiumFonts();
  const inner = (
    <>
      <View>
        <Text style={[refStyles.sectionTitle, fonts.display]}>{title}</Text>
        {subtitle ? (
          <Text style={[refStyles.sectionSub, fonts.bodySemiBold]}>{subtitle}</Text>
        ) : null}
      </View>
      {/* Mockup .app-label carries a right-side element only when the
          header acts (a link / a collapse toggle) — a static section
          label gets no decorative chevron. */}
      {onPress ? (
        <Ionicons name="chevron-forward" color={premium.link} size={16} />
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} style={refStyles.section} activeOpacity={0.8}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={refStyles.section}>{inner}</View>;
}

export function EventCard({
  title,
  venueName,
  label,
  badge,
  compact = false,
  onPress,
  photoUrl,
}: {
  title: string;
  venueName: string;
  label: string;
  badge?: string;
  compact?: boolean;
  onPress: () => void;
  /** Real photo URL when the listing has one; the mockup placeholder picture otherwise. */
  photoUrl?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={[refStyles.eventCard, { height: compact ? 156 : 177 }]}
    >
      <ImageBackground
        source={resolveEventCardImage(photoUrl, title, venueName)}
        style={refStyles.cardImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={["rgba(10,7,23,.1)", "rgba(11,8,25,.55)", "rgba(9,6,21,.94)"]}
          locations={[0, 0.44, 1]}
          style={refStyles.cardOverlay}
        >
          <Text style={[refStyles.eventTitle, compact && { fontSize: 19 }]} numberOfLines={3}>
            {title}
          </Text>
          <Text style={refStyles.eventVenue}>
            {venueName}
            {badge && !compact ? ` · ${badge}` : ""}
          </Text>
          <Text style={refStyles.eventLabel}>
            <Text style={{ color: premium.gold }}>★</Text> {label}
          </Text>
        </LinearGradient>
      </ImageBackground>
    </TouchableOpacity>
  );
}

export function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
}) {
  const fonts = usePremiumFonts();
  return (
    <View style={refStyles.search}>
      <Ionicons name="search" color={premium.muted} size={17} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={premium.muted}
        value={value}
        onChangeText={onChange}
        style={[refStyles.searchInput, fonts.bodySemiBold]}
      />
    </View>
  );
}

// HeaderAvatar — the mockup Home header's gradient initial circle
// (mockup .avatar — the vivid brand gradient). Renders the real
// account initial when one is known; a neutral person glyph for
// guests. Lives here so every tab screen's header carries the same
// element.
export function HeaderAvatar({
  initial,
  onPress,
}: {
  initial?: string | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={[...premium.brandGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={refStyles.avatarCircle}
      >
        {initial ? (
          <Text style={refStyles.avatarInitial}>{initial}</Text>
        ) : (
          <Ionicons name="person" size={17} color="#fff" />
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// BottomNav — the mockup's five-item tab bar (Home, Events, NYE,
// Venues, Rewards). Active item is white with a small gradient dot
// under the label; there is no top tab row anywhere in the app.
export function BottomNav({
  active,
  onNavigate,
}: {
  active: Tab;
  onNavigate: (route: string) => void;
}) {
  const fonts = usePremiumFonts();
  const icons: Record<Tab, keyof typeof Ionicons.glyphMap> = {
    Home: "home-outline",
    Events: "calendar-outline",
    NYE: "ticket-outline",
    Venues: "location-outline",
    Rewards: "star-outline",
  };
  return (
    <View style={refStyles.bottom}>
      {(Object.keys(TAB_ROUTES) as Tab[]).map((t) => {
        const isActive = active === t;
        return (
          <TouchableOpacity
            key={t}
            onPress={() => onNavigate(TAB_ROUTES[t])}
            style={refStyles.bottomItem}
            activeOpacity={0.8}
          >
            <Ionicons
              name={icons[t]}
              size={21}
              color={isActive ? "#fff" : premium.muted}
            />
            <Text
              style={[
                refStyles.bottomText,
                fonts.bodyExtraBold,
                isActive && { color: "#fff" },
              ]}
            >
              {t}
            </Text>
            {isActive ? (
              <LinearGradient
                colors={[...premium.brandGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={refStyles.bottomDot}
              />
            ) : (
              <View style={refStyles.bottomDot} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — copied exactly from App.tsx
// ---------------------------------------------------------------------------

export const refStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 26 },
  search: {
    height: 46,
    backgroundColor: premium.surface2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: premium.line,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 14,
    gap: 9,
  },
  searchInput: { color: premium.ink, fontSize: 13.5, flex: 1 },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 15, fontWeight: "800" },
  pageTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginBottom: 3 },
  subtitle: { color: premium.muted, fontSize: 12.5, fontWeight: "700", marginBottom: 12 },
  filterWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  pill: {
    backgroundColor: premium.surface2,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: premium.line2,
  },
  pillGradient: { borderWidth: 0 },
  pillText: { color: premium.ink2, fontSize: 12.5, fontWeight: "700" },
  personaRow: { alignItems: "flex-end", marginBottom: 15 },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 11,
  },
  sectionTitle: { color: premium.ink, fontSize: 16.5, fontWeight: "800" },
  sectionSub: { color: premium.muted, fontSize: 12.5, marginTop: 3 },
  tailored: {
    backgroundColor: "#21192f",
    borderWidth: 1,
    borderColor: "#342841",
    borderRadius: 17,
    padding: 13,
    marginBottom: 12,
  },
  micro: { color: "#c7bed3", fontSize: 12 },
  tailoredTitle: { color: "white", fontSize: 19, fontWeight: "700", lineHeight: 23, marginTop: 7, marginBottom: 5 },
  muted: { color: "#cfc5d8", fontSize: 14 },
  tagRow: { flexDirection: "row", gap: 6, marginTop: 12 },
  tag: { backgroundColor: "#332b43", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  tagText: { color: "white", fontSize: 12 },
  eventCard: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 11,
    borderWidth: 1,
    borderColor: premium.line,
    backgroundColor: premium.surface,
  },
  cardOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 17,
    paddingTop: 12,
  },
  cardImage: { flex: 1 },
  eventTitle: { color: "white", fontSize: 23, fontWeight: "700", lineHeight: 27, maxWidth: "95%" },
  eventVenue: { color: "#f0eaf4", fontSize: 14, marginTop: 5 },
  eventLabel: { color: "#e7e0eb", fontSize: 14, marginTop: 8 },
  venueItem: { width: 100, alignItems: "center" },
  venueIcon: {
    width: 96,
    height: 70,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#55466a",
  },
  venueName: { color: "white", fontSize: 12, textAlign: "center", marginTop: 7 },
  bottom: {
    height: 64,
    flexDirection: "row",
    backgroundColor: "#0F0A1F",
    borderTopWidth: 1,
    borderColor: premium.line,
    paddingTop: 8,
  },
  bottomItem: { flex: 1, justifyContent: "flex-start", alignItems: "center", gap: 3 },
  bottomText: { color: premium.muted, fontSize: 10.5, fontWeight: "800" },
  bottomDot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
  // Personal/Rewards — premium pass (2026-11-15): the old light
  // sheet is gone. The mockup's Rewards phone is dark end to end, so
  // the "panel" is now just padded dark space on the plum screen and
  // every card inside it is a premium surface. The QR box alone stays
  // light — a QR code needs the contrast to scan.
  personalHero: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 24, alignItems: "center" },
  personalHead: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  personalTitle: { color: "white", fontSize: 30, fontWeight: "800" },
  personalSub: { color: premium.ink2, fontSize: 13.5, alignSelf: "flex-start", marginTop: 8 },
  avatarRing: {
    width: 118,
    height: 118,
    borderRadius: 60,
    borderWidth: 9,
    borderColor: "rgba(232,196,118,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: premium.surface3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  points: { color: "white", fontSize: 32, fontWeight: "800", marginTop: 10 },
  nextTier: { color: premium.ink2, fontSize: 14, marginTop: 3 },
  lightPanel: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
  },
  panelTabs: {
    flexDirection: "row",
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: 999,
    padding: 4,
  },
  panelTab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 999 },
  panelTabSelected: { backgroundColor: premium.surface3 },
  panelTabText: { color: premium.ink2, fontSize: 13, fontWeight: "700" },
  qrHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 17,
    paddingHorizontal: 4,
  },
  darkHeading: {
    color: premium.ink,
    fontSize: 19,
    fontWeight: "700",
    fontFamily: "Poppins_700Bold",
  },
  tokenCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: premium.line,
    padding: 14,
    backgroundColor: premium.surface,
  },
  tokenRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tokenTitle: {
    color: premium.ink,
    fontSize: 15.5,
    fontWeight: "700",
    fontFamily: "Poppins_700Bold",
  },
  newButton: {
    backgroundColor: premium.violet,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  tokenBox: { backgroundColor: premium.surface2, borderRadius: 12, marginTop: 12, padding: 12 },
  tokenText: { color: premium.ink, fontSize: 15, fontWeight: "700" },
  qrBox: {
    backgroundColor: "#EFEDF5",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    padding: 16,
  },
  redeemHeading: {
    fontSize: 17,
    fontWeight: "700",
    color: premium.ink,
    fontFamily: "Poppins_700Bold",
    marginTop: 15,
    marginBottom: 9,
  },
  redeemRow: {
    flexDirection: "row",
    backgroundColor: premium.surface2,
    borderRadius: 13,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: premium.line2,
  },
  redeemInput: { flex: 1, paddingHorizontal: 12, fontSize: 14, color: premium.ink },
  redeemButton: { backgroundColor: premium.violet, paddingHorizontal: 15, justifyContent: "center", minHeight: 45 },
  panelNote: { color: premium.muted, marginTop: 15, textAlign: "center", fontSize: 13, fontWeight: "600" },
});
