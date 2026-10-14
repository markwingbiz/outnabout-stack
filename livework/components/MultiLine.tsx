// Multi-line SVG chart (Event Activity: Views / Tickets Sold / Revenue).
import React from "react";
import { View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

export type Series = { color: string; points: number[] };

export default function MultiLine({
  series,
  width = 320,
  height = 120,
}: {
  series: Series[];
  width?: number;
  height?: number;
}) {
  const all = series.flatMap((s) => s.points);
  const max = Math.max(...all, 1);
  const min = 0;
  const span = max - min || 1;

  function coords(points: number[]) {
    const stepX = width / Math.max(points.length - 1, 1);
    return points
      .map((p, i) => {
        const x = (i * stepX).toFixed(1);
        const y = (height - 6 - ((p - min) / span) * (height - 12)).toFixed(1);
        return `${x},${y}`;
      })
      .join(" ");
  }

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {series.map((s, i) => (
          <Polyline
            key={i}
            points={coords(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    </View>
  );
}
