// src/ui/GlassCard.tsx
import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { theme } from "./theme";

export function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.shell, style]}>
      {/* Low blur for Android performance */}
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />

      {/* Glass gradient overlay */}
      <LinearGradient
        colors={[theme.colors.glass, theme.colors.glass2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle border */}
      <View pointerEvents="none" style={styles.border} />

      {/* Content */}
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: theme.radius.xl,
    overflow: "hidden",
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  inner: {
    padding: 18,
  },
});
