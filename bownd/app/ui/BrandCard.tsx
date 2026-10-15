// app/ui/BrandCard.tsx
import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { radii, shadow, spacing, theme } from "./theme";

export function BrandCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.outer, style]}>
      <LinearGradient
        colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.05)", "rgba(0,0,0,0.10)"]}
        locations={[0, 0.55, 1]}
        style={styles.card}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    ...shadow.card,
  },
  card: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    overflow: "hidden",
    backgroundColor: theme.card,
  },
});
