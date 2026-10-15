import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";

type Props = {
  title: string;
  subtitle?: string;
  rightLabel?: string; // e.g. "NEW" or "QR"
  rightEmoji?: string; // e.g. "🔥"
  onPress?: () => void;
  style?: ViewStyle;
};

export default function HomeActionCard({
  title,
  subtitle,
  rightLabel,
  rightEmoji,
  onPress,
  style,
}: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { transform: [{ scale: 0.99 }] }]}>
      <View style={s.inner}>
        <View style={s.textCol}>
          <Text style={s.title}>{title}</Text>
          {!!subtitle && <Text style={s.sub}>{subtitle}</Text>}
        </View>

        <View style={s.pill}>
          {rightEmoji ? (
            <Text style={s.pillText}>{rightEmoji}</Text>
          ) : (
            <Text style={s.pillText}>{rightLabel ?? ""}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    height: 84, // 🔒 matches the “long glass bar” look
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(210,170,255,0.30)",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  textCol: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 0.2,
  },
  sub: {
    marginTop: 4,
    fontSize: 12.5,
    fontWeight: "500",
    color: "rgba(255,255,255,0.65)",
  },
  pill: {
    height: 42,
    minWidth: 62,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: "rgba(155, 90, 230, 0.26)",
    borderWidth: 1,
    borderColor: "rgba(210,170,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    color: "rgba(255,255,255,0.95)",
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
