// src/ui/PrimaryButton.tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "./theme";

export function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { transform: [{ scale: 0.99 }] }]}>
      <View style={styles.outerGlow} pointerEvents="none" />
      <LinearGradient
        colors={[theme.colors.btnTop, theme.colors.btnMid, theme.colors.btnBottom]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.btn}
      >
        <View pointerEvents="none" style={styles.border} />
        <Text style={styles.text}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  outerGlow: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 8,
    bottom: -6,
    borderRadius: 999,
    backgroundColor: "rgba(255,92,244,0.16)",
  },
  btn: {
    height: 64,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
