// app/ui/GlowPill.tsx
import React from "react";
import { Pressable, Text, View, StyleSheet, ViewStyle } from "react-native";
import { colors, radii, shadow } from "./theme";

export function GlowPill({
  label,
  onPress,
  rightIcon,
  style,
}: {
  label: string;
  onPress: () => void;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, style, pressed && styles.pressed]}>
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.inner}>
        <Text style={styles.text}>{label}</Text>
        {rightIcon ? <View style={{ marginLeft: 12 }}>{rightIcon}</View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    borderRadius: radii.lg,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.lg,
    backgroundColor: colors.glowPurple,
    opacity: 0.18,
    ...shadow.glow,
  },
  inner: {
    borderRadius: radii.lg,
    paddingVertical: 22, // bigger touch target like your drawn boxes
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  text: {
    color: colors.textPrimary,
    fontWeight: "900",
    fontSize: 18,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
