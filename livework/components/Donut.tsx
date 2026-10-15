// Donut chart for Age Range (Audience Insights).
import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

export type Slice = { pct: number; color: string };

export default function Donut({
  slices,
  size = 110,
  stroke = 16,
}: {
  slices: Slice[];
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {slices.map((s, i) => {
          const frac = s.pct / 100;
          const dash = frac * c;
          const el = (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={s.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${Math.max(dash - 2, 0)} ${c - dash + 2}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return el;
        })}
      </Svg>
    </View>
  );
}
