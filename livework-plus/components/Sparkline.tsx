// Minimal SVG line chart (Revenue Overview sparkline).
import React from "react";
import { View } from "react-native";
import Svg, { Polyline, Defs, LinearGradient, Stop } from "react-native-svg";
import { THEME } from "../lib/theme";

export default function Sparkline({
  points,
  width = 180,
  height = 56,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const stepX = width / Math.max(points.length - 1, 1);
  const coords = points
    .map((p, i) => {
      const x = (i * stepX).toFixed(1);
      const y = (height - 4 - ((p - min) / span) * (height - 8)).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="spark" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={THEME.purpleBright} stopOpacity="0.4" />
            <Stop offset="1" stopColor={THEME.pink} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Polyline
          points={coords}
          fill="none"
          stroke="url(#spark)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
