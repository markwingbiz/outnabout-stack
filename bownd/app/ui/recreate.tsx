// app/ui/recreate.tsx — Bownd recreate shared design system (Phase 2).
// Tokens + small shared components matching the 3-screen reference mockup.
// Screens import from here; they must NOT restyle these primitives per-screen.
// Photo cards use gradient placeholders: the mockup's photos are baked into
// the reference JPG at low resolution and cannot be extracted (see
// REFERENCE-ANALYSIS.md limitation #1). Never claim these are real photos.
import React from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export const rc = {
  bg: "#0A0614",
  bgMid: "#140B2A",
  surface: "rgba(255,255,255,0.06)",
  surfaceStrong: "rgba(255,255,255,0.10)",
  border: "rgba(255,255,255,0.12)",
  borderStrong: "rgba(255,255,255,0.20)",
  text: "rgba(255,255,255,0.95)",
  subtext: "rgba(196,181,253,0.80)",
  muted: "rgba(255,255,255,0.55)",
  violet: "#7C3AED",
  violetLight: "#A855F7",
  indigo: "#4F46E5",
  blue: "#3B82F6",
  peach: "#F6A58A",
  peachLight: "#FBD5C3",
  lightPanel: "#F1EFFA",
  lightPanelText: "#1E1B2E",
  lightPanelSub: "rgba(30,27,46,0.62)",
  lightBorder: "rgba(30,27,46,0.10)",
  gold: "#FBBF24",
};

export const rr = { card: 20, cardSm: 16, pill: 999, panel: 28 };

export const rs = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, page: 18 };

export const rtype = {
  display: { fontSize: 28, fontWeight: "800" as const, lineHeight: 34 },
  title: { fontSize: 22, fontWeight: "800" as const, lineHeight: 28 },
  section: { fontSize: 18, fontWeight: "800" as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: "500" as const, lineHeight: 21 },
  small: { fontSize: 13, fontWeight: "500" as const, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: "500" as const, lineHeight: 16 },
  tiny: { fontSize: 11, fontWeight: "600" as const, lineHeight: 15 },
};

export const rshadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  soft: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: rc.border,
    borderRadius: rr.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: { fontSize: 16, color: rc.muted, marginRight: 8 },
  searchInput: { flex: 1, color: rc.text, fontSize: 15, padding: 0 },
  segWrap: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: rc.border,
    borderRadius: rr.pill,
    padding: 4,
  },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: rr.pill },
  segBtnActive: { backgroundColor: "rgba(255,255,255,0.16)" },
  segText: { color: rc.muted, fontSize: 14, fontWeight: "600" },
  segTextActive: { color: rc.text, fontWeight: "700" },
  bottomNav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: rc.border,
    backgroundColor: "#0D0918",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 18,
  },
  navBtn: { flex: 1, alignItems: "center", gap: 3 },
  navIcon: { fontSize: 22 },
  navLabel: { fontSize: 11, fontWeight: "600" },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: rr.pill,
    borderWidth: 1,
    borderColor: rc.border,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  pillActive: { backgroundColor: "rgba(255,255,255,0.18)", borderColor: rc.borderStrong },
  pillText: { color: rc.subtext, fontSize: 13, fontWeight: "600" },
  pillTextActive: { color: rc.text, fontWeight: "700" },
  photoCard: { borderRadius: rr.card, overflow: "hidden", ...rshadow.card },
  photoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
  },
  photoTitle: { color: "#fff", fontSize: 20, fontWeight: "800", lineHeight: 26 },
  photoSub: { color: "rgba(255,255,255,0.80)", fontSize: 13, fontWeight: "500", marginTop: 4 },
  photoBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: rr.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  photoBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: rr.pill,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: rc.border,
  },
  tagText: { color: rc.subtext, fontSize: 12, fontWeight: "600" },
});

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  onSubmit?: () => void;
}) {
  return (
    <View style={styles.searchWrap}>
      <Text style={styles.searchIcon}>{"\u{1F50D}"}</Text>
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={rc.muted}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}

export type TabKey = "home" | "events" | "personal";

export function SegmentedTabs({
  active,
  onSelect,
}: {
  active: TabKey;
  onSelect: (t: TabKey) => void;
}) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "home", label: "Home" },
    { key: "events", label: "Events" },
    { key: "personal", label: "Personal" },
  ];
  return (
    <View style={styles.segWrap}>
      {tabs.map((t) => (
        <Pressable
          key={t.key}
          style={[styles.segBtn, active === t.key && styles.segBtnActive]}
          onPress={() => onSelect(t.key)}
        >
          <Text style={[styles.segText, active === t.key && styles.segTextActive]}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function BottomNav({
  active,
  onSelect,
}: {
  active: TabKey;
  onSelect: (t: TabKey) => void;
}) {
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: "home", label: "Home", icon: "\u{1F3E0}" },
    { key: "events", label: "Events", icon: "\u{1F4C5}" },
    { key: "personal", label: "Personal", icon: "\u{1F464}" },
  ];
  return (
    <View style={styles.bottomNav}>
      {tabs.map((t) => (
        <Pressable key={t.key} style={styles.navBtn} onPress={() => onSelect(t.key)}>
          <Text style={[styles.navIcon, { opacity: active === t.key ? 1 : 0.55 }]}>{t.icon}</Text>
          <Text
            style={[
              styles.navLabel,
              { color: active === t.key ? rc.text : rc.muted },
            ]}
          >
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function FilterPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.pill, selected && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillText, selected && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function TagPill({ label }: { label: string }) {
  return (
    <View style={styles.tagPill}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

/** Gradient placeholder for a photo card. Mockup photos are low-res JPG-baked
 *  assets that cannot be extracted — this gradient + glow treatment stands in
 *  until real photo assets are provided. Never present it as a real photo. */
export function PhotoCard({
  title,
  subtitle,
  badge,
  gradient,
  height,
  onPress,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  gradient: [string, string];
  height: number;
  onPress?: () => void;
}) {
  return (
    <Pressable style={[styles.photoCard, { height }]} onPress={onPress}>
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      {/* decorative glow orbs suggesting stage/event lighting */}
      <View
        style={{
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: "rgba(255,255,255,0.12)",
          right: -40,
          top: -50,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: "rgba(0,0,0,0.18)",
          left: -30,
          bottom: -30,
        }}
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.78)"]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.62 }}
      />
      <View style={styles.photoOverlay}>
        <Text style={styles.photoTitle}>{title}</Text>
        {subtitle ? <Text style={styles.photoSub}>{subtitle}</Text> : null}
        {badge ? (
          <View style={styles.photoBadge}>
            <Text style={styles.photoBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
