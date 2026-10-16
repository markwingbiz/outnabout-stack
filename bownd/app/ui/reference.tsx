// app/ui/reference.tsx
// Shared UI extracted from the reference preview (App.tsx): design tokens,
// Pill, Section, EventCard, Search, TopTabs, BottomNav, plus the shared
// formatWhen / venue-name helpers. StyleSheet values are copied exactly
// from App.tsx. EventCard renders a LinearGradient background (App.tsx's
// overlay gradient colors) — never a remote image, never presented as a
// photo. All data comes from the real backend via the screens.
import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import type { Venue } from "../../lib/store";

export type Tab = "Home" | "Events" | "Personal";
export const PURPLE = "#7861d9";
export const INK = "#0e0b19";
export const WIDTH = Dimensions.get("window").width;

export const TAB_ROUTES: Record<Tab, string> = {
  Home: "/(tabs)",
  Events: "/(tabs)/events",
  Personal: "/(tabs)/personal",
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
  return (
    <TouchableOpacity onPress={onPress} style={[refStyles.pill, active && refStyles.pillActive]}>
      <Text style={refStyles.pillText}>{label}</Text>
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
  const inner = (
    <>
      <View>
        <Text style={refStyles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={refStyles.sectionSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" color="#b7aecb" size={17} />
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
}: {
  title: string;
  venueName: string;
  label: string;
  badge?: string;
  compact?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={[refStyles.eventCard, { height: compact ? 156 : 177 }]}
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
          <Text style={{ color: "#f5c36a" }}>★</Text> {label}
        </Text>
      </LinearGradient>
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
  return (
    <View style={refStyles.search}>
      <Ionicons name="search-outline" color="#ddd5e9" size={19} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#ddd6e8"
        value={value}
        onChangeText={onChange}
        style={refStyles.searchInput}
      />
    </View>
  );
}

export function TopTabs({
  active,
  onNavigate,
}: {
  active: Tab;
  onNavigate: (route: string) => void;
}) {
  return (
    <View style={refStyles.topTabs}>
      {(["Home", "Events", "Personal"] as Tab[]).map((t) => (
        <TouchableOpacity
          key={t}
          onPress={() => onNavigate(TAB_ROUTES[t])}
          style={[refStyles.topTab, active === t && refStyles.topTabActive]}
        >
          <Text style={refStyles.topTabText}>{t}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function BottomNav({
  active,
  onNavigate,
}: {
  active: Tab;
  onNavigate: (route: string) => void;
}) {
  const icons: Record<Tab, keyof typeof Ionicons.glyphMap> = {
    Home: "home-outline",
    Events: "calendar-outline",
    Personal: "person-outline",
  };
  return (
    <View style={refStyles.bottom}>
      {(["Home", "Events", "Personal"] as Tab[]).map((t) => (
        <TouchableOpacity
          key={t}
          onPress={() => onNavigate(TAB_ROUTES[t])}
          style={[refStyles.bottomItem, active === t && refStyles.bottomSelected]}
        >
          <Ionicons name={icons[t]} size={22} color={active === t ? "#fff" : "#aaa4b9"} />
          <Text style={[refStyles.bottomText, active === t && { color: "#fff" }]}>{t}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — copied exactly from App.tsx
// ---------------------------------------------------------------------------

export const refStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  scroll: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 26 },
  search: {
    height: 45,
    backgroundColor: "#201b30",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#30283f",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 9,
  },
  searchInput: { color: "white", fontSize: 15, flex: 1 },
  topTabs: {
    flexDirection: "row",
    backgroundColor: "#221c33",
    borderRadius: 15,
    padding: 3,
    marginBottom: 22,
  },
  topTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 12,
  },
  topTabActive: { backgroundColor: "#3b354d", borderWidth: 1, borderColor: "#62596d" },
  topTabText: { color: "white", fontSize: 14 },
  pageTitle: { color: "#fff", fontSize: 26, fontWeight: "700", marginBottom: 3 },
  subtitle: { color: "#d4ccdf", fontSize: 14, marginBottom: 12 },
  filterWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  pill: {
    backgroundColor: "#30283e",
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#41354e",
  },
  pillActive: { backgroundColor: "#463858", borderColor: "#69577a" },
  pillText: { color: "white", fontSize: 13 },
  personaRow: { alignItems: "flex-end", marginBottom: 15 },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 10,
  },
  sectionTitle: { color: "#fff", fontSize: 21, fontWeight: "700" },
  sectionSub: { color: "#b9b0c7", fontSize: 13, marginTop: 3 },
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
    borderColor: "#403448",
    backgroundColor: "#231b33",
  },
  cardOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 17,
    paddingTop: 12,
  },
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
    height: 70,
    flexDirection: "row",
    backgroundColor: "#161120",
    borderTopWidth: 1,
    borderColor: "#40334f",
    paddingBottom: 5,
  },
  bottomItem: { flex: 1, justifyContent: "center", alignItems: "center", gap: 4 },
  bottomSelected: { backgroundColor: "#34284c", borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  bottomText: { color: "#aaa4b9", fontSize: 12 },
  personalHero: { height: 365, paddingHorizontal: 20, paddingTop: 22, alignItems: "center" },
  personalHead: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  personalTitle: { color: "white", fontSize: 31, fontWeight: "700" },
  personalSub: { color: "#f1e8f5", fontSize: 14, alignSelf: "flex-start", marginTop: 11 },
  avatarRing: {
    width: 173,
    height: 173,
    borderRadius: 90,
    borderWidth: 13,
    borderColor: "rgba(210,173,242,.17)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  avatar: {
    width: 138,
    height: 138,
    borderRadius: 75,
    backgroundColor: "#393246",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,.35)",
  },
  points: { color: "white", fontSize: 34, fontWeight: "700", marginTop: 8 },
  nextTier: { color: "#fff", fontSize: 15, marginTop: 3 },
  lightPanel: {
    marginHorizontal: 5,
    marginTop: -8,
    backgroundColor: "#f0edf4",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    padding: 14,
    minHeight: 390,
  },
  panelTabs: { flexDirection: "row", backgroundColor: "#e2dfeb", borderRadius: 22, padding: 3 },
  panelTab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 18 },
  panelTabSelected: { backgroundColor: "#373151" },
  panelTabText: { color: "#292334", fontSize: 13 },
  qrHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 17,
    paddingHorizontal: 4,
  },
  darkHeading: { color: "#19151f", fontSize: 20, fontWeight: "700" },
  tokenCard: {
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#d5d0df",
    padding: 12,
    backgroundColor: "#f1eef5",
  },
  tokenRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tokenTitle: { color: "#221c2a", fontSize: 16, fontWeight: "700" },
  newButton: {
    backgroundColor: "#6242bb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  tokenBox: { backgroundColor: "#e4e0ed", borderRadius: 13, marginTop: 12, padding: 12 },
  tokenText: { color: "#28222d", fontSize: 16, fontWeight: "700" },
  qrBox: {
    backgroundColor: "#e9e6ef",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    padding: 12,
  },
  redeemHeading: { fontSize: 18, fontWeight: "700", color: "#231e29", marginTop: 15, marginBottom: 9 },
  redeemRow: {
    flexDirection: "row",
    backgroundColor: "#e8e5ed",
    borderRadius: 13,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d2ccdc",
  },
  redeemInput: { flex: 1, paddingHorizontal: 10, fontSize: 14, color: "#211b2b" },
  redeemButton: { backgroundColor: "#3654b5", paddingHorizontal: 15, justifyContent: "center", minHeight: 45 },
  panelNote: { color: "#514a5a", marginTop: 15, textAlign: "center" },
});
