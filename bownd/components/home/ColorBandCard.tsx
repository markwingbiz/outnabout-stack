import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  style?: ViewStyle;
  variant?: "spotlight" | "featured";
};

export default function ColorBandCard({ style, variant = "featured" }: Props) {
  // Two variants so Spotlight looks slightly different than Featured.
  const colors =
    variant === "spotlight"
      ? ["#2E2A7A", "#6B4CFF", "#FF79C6", "#FFB86B", "#FFE28A"]
      : ["#6B4CFF", "#FF79C6", "#FFB86B", "#FFE28A"];

  return (
    <View style={[styles.wrap, style]}>
      {/* Top solid “night” band */}
      <View style={[styles.band, { backgroundColor: "#2E2A7A", top: 0 }]} />

      {/* Curvy “separated shapes” bands */}
      <LinearGradient
        colors={[colors[1], colors[2]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.wave, { top: 18, transform: [{ rotate: "-2deg" }] }]}
      />
      <LinearGradient
        colors={[colors[2], colors[3]]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.wave, { top: 62, transform: [{ rotate: "2deg" }] }]}
      />
      <LinearGradient
        colors={[colors[3], colors[4] ?? colors[3]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.wave, { top: 108, transform: [{ rotate: "-1deg" }] }]}
      />

      {/* Soft glow */}
      <LinearGradient
        colors={["rgba(255,255,255,0.20)", "rgba(255,255,255,0.00)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.glow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    overflow: "hidden",
  },
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 64,
    opacity: 0.95,
  },
  wave: {
    position: "absolute",
    left: -40,
    right: -40,
    height: 120,
    borderRadius: 80,
    opacity: 0.85,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
  },
});
