// Circular progress ring (Relationship Score, Profile Strength).
import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { THEME } from "../lib/theme";

export default function Ring({
  pct,
  size = 84,
  stroke = 7,
  center,
  sub,
  color = THEME.purpleBright,
}: {
  pct: number; // 0-100
  size?: number;
  stroke?: number;
  center: string;
  sub?: string;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>{center}</Text>
      {!!sub && (
        <Text style={{ color: THEME.textMuted, fontSize: 11, fontWeight: "800" }}>{sub}</Text>
      )}
    </View>
  );
}
