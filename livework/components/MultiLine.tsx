// Multi-line SVG chart (Event Activity: Views / Tickets Sold / Revenue).
// Visual pass (2026-11-15): a series may opt into `area` — the
// mockup's insights charts fill under the line with a gradient of
// the line color (45% at the top fading to 0) and finish the line
// with a gold end dot. Default off: existing callers render exactly
// as before.
import React from "react";
import { View } from "react-native";
import Svg, {
  Polyline,
  Polygon,
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";

export type Series = { color: string; points: number[]; area?: boolean };

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

  function areaCoords(points: number[]) {
    const line = coords(points);
    return `${line} ${width},${height - 2} 0,${height - 2}`;
  }

  function lastPoint(points: number[]) {
    const stepX = width / Math.max(points.length - 1, 1);
    const i = points.length - 1;
    const p = points[i] ?? 0;
    return {
      x: i * stepX,
      y: height - 6 - ((p - min) / span) * (height - 12),
    };
  }

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          {series.map((s, i) =>
            s.area ? (
              <LinearGradient
                key={`g${i}`}
                id={`mlArea${i}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <Stop offset="0" stopColor={s.color} stopOpacity={0.45} />
                <Stop offset="1" stopColor={s.color} stopOpacity={0} />
              </LinearGradient>
            ) : null,
          )}
        </Defs>
        {series.map((s, i) =>
          s.area ? (
            <Polygon key={`a${i}`} points={areaCoords(s.points)} fill={`url(#mlArea${i})`} />
          ) : null,
        )}
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
        {series.map((s, i) => {
          if (!s.area || s.points.length === 0) return null;
          const lp = lastPoint(s.points);
          return <Circle key={`d${i}`} cx={lp.x} cy={lp.y} r={3.5} fill="#E8C476" />;
        })}
      </Svg>
    </View>
  );
}
