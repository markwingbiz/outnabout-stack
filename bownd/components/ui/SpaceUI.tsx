import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// Optional Blur (fallbacks if not installed)
let BlurView: any = null;
try {
  BlurView = require("expo-blur").BlurView;
} catch (e) {
  BlurView = null;
}

export const THEME = {
  bg0: "#070616",
  bg1: "#120A2A",
  neon: "#B56DFF",
  neon2: "#FF4FD8",
  text: "#F4F0FF",
  textDim: "rgba(244,240,255,0.70)",
  glass: "rgba(255,255,255,0.10)",
  glass2: "rgba(255,255,255,0.14)",
  stroke: "rgba(181,109,255,0.35)",
  strokeDim: "rgba(181,109,255,0.20)",
  shadow: "rgba(181,109,255,0.35)",
};

export function SpaceBackground({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient
      colors={[THEME.bg0, THEME.bg1, THEME.bg0]}
      start={{ x: 0.1, y: 0.0 }}
      end={{ x: 0.9, y: 1.0 }}
      style={{ flex: 1 }}
    >
      <View pointerEvents="none" style={styles.topGlow} />
      <View pointerEvents="none" style={styles.midGlow} />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 18 }}>{children}</View>
    </LinearGradient>
  );
}

export function Glass({
  children,
  style,
  intensity = 30,
}: {
  children: React.ReactNode;
  style?: any;
  intensity?: number;
}) {
  if (BlurView) {
    return (
      <BlurView intensity={intensity} tint="dark" style={[styles.glassBase, style]}>
        {children}
      </BlurView>
    );
  }
  return <View style={[styles.glassBase, { backgroundColor: THEME.glass }, style]}>{children}</View>;
}

export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryBtnOuter, pressed && { opacity: 0.92 }]}>
      <LinearGradient
        colors={[THEME.neon2, THEME.neon]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.primaryBtn}
      >
        <Text style={styles.primaryBtnText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.92 }]}>
      <Text style={styles.ghostBtnText}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceRow({
  label,
  leftIcon = "●",
  checked,
  onToggle,
}: {
  label: string;
  leftIcon?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [pressed && { opacity: 0.94 }]}>
      <Glass style={styles.choiceRow}>
        <View style={styles.choiceLeft}>
          <View style={styles.choiceIcon}>
            <Text style={styles.choiceIconText}>{leftIcon}</Text>
          </View>
          <Text style={styles.choiceText} numberOfLines={1}>
            {label}
          </Text>
        </View>

        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked ? <Text style={styles.checkboxTick}>✓</Text> : null}
        </View>
      </Glass>
    </Pressable>
  );
}

export function NeonCard({
  title,
  subtitle,
  rightBadge,
  onPress,
}: {
  title: string;
  subtitle?: string;
  rightBadge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
      <Glass style={styles.card}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
        </View>

        {!!rightBadge && (
          <View style={styles.badgeWrap}>
            <View style={styles.badgeInner}>
              <Text style={styles.badgeText}>{rightBadge}</Text>
            </View>
          </View>
        )}
      </Glass>
    </Pressable>
  );
}

export const uiStyles = StyleSheet.create({
  brand: { color: THEME.textDim, fontSize: 16, letterSpacing: 0.6, textAlign: "center" },
  h1: { color: THEME.text, fontSize: 24, fontWeight: "700", marginTop: 6, textAlign: "center" },
  sub: { color: THEME.textDim, marginTop: 6, fontSize: 14, textAlign: "center" },
  bottomRow: { flexDirection: "row", gap: 12, marginTop: 14, marginBottom: 10 },
});

const styles = StyleSheet.create({
  topGlow: {
    position: "absolute",
    top: -120,
    left: -60,
    right: -60,
    height: 240,
    borderRadius: 200,
    backgroundColor: "rgba(181,109,255,0.12)",
    transform: [{ rotate: "-6deg" }],
  },
  midGlow: {
    position: "absolute",
    top: 140,
    left: -90,
    right: -90,
    height: 200,
    borderRadius: 200,
    backgroundColor: "rgba(255,79,216,0.08)",
    transform: [{ rotate: "8deg" }],
  },

  glassBase: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.strokeDim,
    overflow: "hidden",
    backgroundColor: THEME.glass,
  },

  card: {
    padding: 16,
    borderRadius: 20,
    borderColor: THEME.stroke,
    backgroundColor: THEME.glass2,
    shadowColor: THEME.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardTitle: { color: THEME.text, fontSize: 16, fontWeight: "700" },
  cardSubtitle: { color: THEME.textDim, marginTop: 6, fontSize: 13 },

  badgeWrap: { marginLeft: 14, alignItems: "flex-end", justifyContent: "center" },
  badgeInner: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: THEME.stroke,
    backgroundColor: "rgba(181,109,255,0.18)",
  },
  badgeText: { color: THEME.text, fontWeight: "700", fontSize: 12 },

  choiceRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderColor: THEME.strokeDim,
    backgroundColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  choiceLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 12 },
  choiceIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.strokeDim,
    backgroundColor: "rgba(181,109,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceIconText: { color: THEME.text, fontSize: 12, fontWeight: "800" },
  choiceText: { color: THEME.text, fontSize: 15, fontWeight: "600", flex: 1 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.strokeDim,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { borderColor: THEME.stroke, backgroundColor: "rgba(255,79,216,0.18)" },
  checkboxTick: { color: THEME.text, fontWeight: "900" },

  ghostBtn: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: THEME.strokeDim,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: { color: THEME.text, fontWeight: "700" },

  primaryBtnOuter: { flex: 1 },
  primaryBtn: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: THEME.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  primaryBtnText: { color: THEME.text, fontWeight: "900", letterSpacing: 0.2 },
});
