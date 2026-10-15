import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type HomeFilter =
  | "tonight"
  | "tomorrow"
  | "weekend"
  | "week"
  | "personalized"
  | "all";

const PILL_COLORS: Record<HomeFilter, string> = {
  tonight: "#FF4DB8",
  tomorrow: "#4FC3FF",
  weekend: "#FFD166",
  week: "#B08CFF",
  personalized: "#6DDF7D",
  all: "#FFFFFF",
};

const PILL_TEXT: Record<HomeFilter, string> = {
  tonight: "Tonight",
  tomorrow: "Tomorrow",
  weekend: "Weekend",
  week: "This Week",
  personalized: "Personalized",
  all: "All",
};

type Props = {
  value: HomeFilter;
  onChange: (v: HomeFilter) => void;
};

export default function PillRow({ value, onChange }: Props) {
  const order: HomeFilter[] = ["tonight", "tomorrow", "weekend", "week"];

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {order.map((k) => (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            style={[
              styles.pill,
              {
                backgroundColor: PILL_COLORS[k],
                opacity: value === k ? 1 : 0.78,
              },
            ]}
          >
            <Text style={styles.pillText}>{PILL_TEXT[k]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.row, { marginTop: 10 }]}>
        {(["all", "personalized"] as HomeFilter[]).map((k) => {
          const isAll = k === "all";
          return (
            <Pressable
              key={k}
              onPress={() => onChange(k)}
              style={[
                styles.pill,
                isAll ? styles.pillAll : null,
                {
                  backgroundColor: PILL_COLORS[k],
                  opacity: value === k ? 1 : 0.78,
                },
              ]}
            >
              <Text style={[styles.pillText, isAll ? styles.pillAllText : null]}>
                {PILL_TEXT[k]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, marginBottom: 12 },
  row: { flexDirection: "row", gap: 10 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    minWidth: 82,
    alignItems: "center",
  },
  pillText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  pillAll: { borderWidth: 1, borderColor: "rgba(0,0,0,0.10)" },
  pillAllText: { color: "#222" },
});
