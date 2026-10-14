import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

type Props = {
  value: "Home" | "Events" | "Persona";
  onChange: (v: Props["value"]) => void;
};

export default function HomeTabs({ value, onChange }: Props) {
  const tabs: Props["value"][] = ["Home", "Events", "Persona"];

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        {tabs.map((t) => {
          const active = value === t;
          return (
            <Pressable
              key={t}
              onPress={() => onChange(t)}
              style={({ pressed }) => [
                s.tab,
                active && s.tabActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[s.tabText, active && s.tabTextActive]}>{t}</Text>
              {active ? <View style={s.underline} /> : <View style={s.underlineOff} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginTop: 14,
    marginBottom: 18,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 26,
  },
  tab: {
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tabActive: {},
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: "rgba(255,255,255,0.95)",
  },
  underline: {
    marginTop: 8,
    height: 2,
    width: 36,
    borderRadius: 2,
    backgroundColor: "rgba(194,126,255,0.95)",
  },
  underlineOff: {
    marginTop: 8,
    height: 2,
    width: 36,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
});
