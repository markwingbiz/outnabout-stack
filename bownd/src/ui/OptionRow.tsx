// src/ui/OptionRow.tsx
import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "./theme";

export function OptionRow({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.92 }]}>
      <View style={styles.shell}>
        <LinearGradient
          colors={[
            "rgba(255,255,255,0.10)",
            "rgba(255,255,255,0.06)",
            "rgba(255,255,255,0.04)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.border} />
        <Text style={styles.text}>{label}</Text>

        {/* Tiny right-side glow nub */}
        <View pointerEvents="none" style={styles.glowNub} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: 64,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 18,
    alignItems: "flex-start",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  text: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  glowNub: {
    position: "absolute",
    right: -22,
    top: "50%",
    width: 90,
    height: 90,
    borderRadius: 45,
    transform: [{ translateY: -45 }],
    backgroundColor: "rgba(181,107,255,0.25)",
  },
});
