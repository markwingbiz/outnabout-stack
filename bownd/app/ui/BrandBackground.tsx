// app/ui/BrandBackground.tsx
// Premium pass (2026-11-15): retuned to the brochure plum family —
// the shared screen gradient plus soft deep-plum depth glows. The
// old magenta glow blob (#FF3EA5 family) is gone everywhere this
// background renders (detail, list, vibe).
// Plum pass (2026-11-15): the blobs were the vivid brand ramp
// (#5B34E0 / #2F6BFF / #7A2BD0); they are now the mockup's deep plum
// tones at higher opacity — plum depth, not purple glow.
import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { premium } from "./theme";

export function BrandBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[...premium.screenGradient]}
        locations={[...premium.screenGradientLocations]}
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
    opacity: 0.4,
  },
  blob1: {
    top: -220,
    left: -180,
    backgroundColor: "#2A1650",
  },
  blob2: {
    top: 120,
    right: -220,
    backgroundColor: "#271D47",
  },
  blob3: {
    bottom: -260,
    left: -120,
    backgroundColor: "#1D1440",
  },
});
