import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  subtitle?: string;
};

export function GlowOption({ label, subtitle, onPress, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={14} // ✅ more touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed, style]}
    >
      {/* Outer glow halo (subtle) */}
      <LinearGradient
        colors={[
          "rgba(168,85,247,0.26)", // violet glow
          "rgba(255,92,138,0.16)", // pink glow
          "rgba(0,0,0,0)", // fade
        ]}
        start={{ x: 0.15, y: 0.15 }}
        end={{ x: 0.95, y: 0.95 }}
        style={styles.glow}
      />

      {/* Glass button body */}
      <LinearGradient
        colors={[
          "rgba(255,255,255,0.12)",
          "rgba(255,255,255,0.07)",
          "rgba(255,255,255,0.04)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* highlight stripe */}
        <LinearGradient
          colors={["rgba(255,255,255,0.18)", "rgba(255,255,255,0.00)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.highlight}
        />

        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 18,
  },

  glow: {
    position: "absolute",
    left: -10,
    right: -10,
    top: -12,
    bottom: -12,
    borderRadius: 26,
    opacity: 0.9,
  },

  // ✅ “big box” sizing
  card: {
    minHeight: 78,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",

    // iOS shadow
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 14,

    // Android
    elevation: 8,
  },

  highlight: {
    position: "absolute",
    left: 1,
    right: 1,
    top: 1,
    height: 28,
    borderTopLeftRadius: 21,
    borderTopRightRadius: 21,
    opacity: 0.9,
  },

  label: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "700",
  },

  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
