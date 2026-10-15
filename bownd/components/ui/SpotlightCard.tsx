import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing } from "react-native";

type Props = {
  title: string;
  subtitle?: string;
  rightLabel?: string;
  rightEmoji?: string;
  onPress?: () => void;
  delayMs?: number;
};

export default function SpotlightCard({ title, subtitle, rightLabel, rightEmoji, onPress, delayMs = 0 }: Props) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const floatY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -2, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );

    const t = setTimeout(() => anim.start(), delayMs);
    return () => {
      clearTimeout(t);
      anim.stop();
    };
  }, [floatY, delayMs]);

  const onPressIn = () => {
    Animated.spring(pressScale, { toValue: 0.985, useNativeDriver: true, speed: 28, bounciness: 6 }).start();
  };
  const onPressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }).start();
  };

  const transform = useMemo(() => [{ translateY: floatY }, { scale: pressScale }], [floatY, pressScale]);

  return (
    <Animated.View style={{ transform }}>
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={s.card}>
        <View style={s.inner}>
          <View style={s.textCol}>
            <Text style={s.title}>{title}</Text>
            {!!subtitle && <Text style={s.sub}>{subtitle}</Text>}
          </View>

          <View style={s.pill}>
            <Text style={s.pillText}>{rightEmoji ?? rightLabel ?? ""}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    height: 84,
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
  textCol: { flex: 1, paddingRight: 12 },
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
