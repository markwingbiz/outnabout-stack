// app/ui/BrandBackground.tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "./theme";

export function BrandBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[colors.bgTop, colors.bgMid, colors.bgBot]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />
      <View style={[styles.blob, styles.blob3]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: "absolute",
    width: 520,
    height: 520,
    borderRadius: 520,
    opacity: 0.28,
  },
  blob1: {
    top: -220,
    left: -180,
    backgroundColor: colors.glowPurple,
  },
  blob2: {
    top: 120,
    right: -220,
    backgroundColor: colors.glowMagenta,
  },
  blob3: {
    bottom: -260,
    left: -120,
    backgroundColor: colors.glowBlue,
  },
});
