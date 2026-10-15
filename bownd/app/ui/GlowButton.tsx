// app/ui/GlowButton.tsx
import React from "react";
import { Pressable, Text, View, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radii, shadow } from "./theme";

type Props = {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  variant?: "primary" | "ghost";
};

export function GlowButton({
  label,
  onPress,
  style,
  textStyle,
  variant = "primary",
}: Props) {
  const isGhost = variant === "ghost";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, style, pressed && styles.pressed]}>
      {/* glow layer */}
      {!isGhost ? <View style={styles.glow} pointerEvents="none" /> : null}

      {isGhost ? (
        <View style={styles.ghostBtn}>
          <Text style={[styles.ghostText, textStyle]}>{label}</Text>
        </View>
      ) : (
        <LinearGradient
          colors={[colors.purple, colors.magenta]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          <Text style={[styles.text, textStyle]}>{label}</Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.pill,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.pill,
    backgroundColor: colors.glowPurple,
    opacity: 0.22,
    ...shadow.glow,
  },
  btn: {
    borderRadius: radii.pill,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  text: {
    color: colors.textPrimary,
    fontWeight: "900",
    fontSize: 18,
    textAlign: "center",
  },
  ghostBtn: {
    borderRadius: radii.pill,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  ghostText: {
    color: colors.textPrimary,
    fontWeight: "900",
    fontSize: 18,
    textAlign: "center",
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
