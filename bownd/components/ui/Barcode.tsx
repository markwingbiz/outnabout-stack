// bownd/components/ui/Barcode.tsx
// REAL Code 128 barcode rendering (Code 128-B, ISO/IEC 15417) via the
// dependency-free encoder in lib/code128.ts, drawn with react-native-svg.
// No fake bars, no placeholder image: an empty/invalid value renders an
// honest "No code available" state instead of a barcode.
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { encodeCode128B, isEncodableCode128B } from "../../lib/code128";

const QUIET_ZONE_MODULES = 10; // mandatory 10x quiet zone on each side

type Props = {
  /** The exact string encoded in the barcode. Rendered only when non-empty and valid. */
  value: string;
  width?: number;
  height?: number;
  /** Human-readable text under the bars. Defaults to the encoded value. */
  showText?: boolean;
  barColor?: string;
  backgroundColor?: string;
};

export function Barcode({
  value,
  width = 280,
  height = 64,
  showText = true,
  barColor = "#111111",
  backgroundColor = "#ffffff",
}: Props) {
  const runs = useMemo(() => {
    if (!isEncodableCode128B(value)) return null;
    try {
      return encodeCode128B(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!runs) {
    return (
      <View style={[styles.empty, { width, backgroundColor }]}>
        <Text style={styles.emptyText}>No code available</Text>
      </View>
    );
  }

  const dataModules = runs.reduce((sum, r) => sum + r.modules, 0);
  const totalModules = dataModules + QUIET_ZONE_MODULES * 2;
  const unit = width / totalModules;
  let x = QUIET_ZONE_MODULES * unit;
  const bars: React.ReactElement[] = [];
  runs.forEach((run, i) => {
    if (run.black) {
      bars.push(
        <Rect
          key={i}
          x={x}
          y={0}
          width={run.modules * unit}
          height={height}
          fill={barColor}
        />
      );
    }
    x += run.modules * unit;
  });

  return (
    <View style={[styles.wrap, { width, backgroundColor }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {bars}
      </Svg>
      {showText && (
        <Text style={styles.text} numberOfLines={1}>
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, alignItems: "center" },
  text: { marginTop: 6, fontSize: 11, fontWeight: "700", color: "#111111" },
  empty: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { fontSize: 12, fontWeight: "700", color: "#514a5a" },
});
