// app/detail.tsx
import React, { useMemo } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BrandBackground } from "./ui/BrandBackground";
import { BrandCard } from "./ui/BrandCard";
import BrandHeader from "./ui/BrandHeader";
import { spacing, theme } from "./ui/theme";
import { EXPERIENCES } from "../data/experiences";

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const item = useMemo(
    () => EXPERIENCES.find((e) => e.id === id),
    [id]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <BrandBackground />

      <View style={styles.container}>
        <BrandHeader tagline="Pick a vibe. Pick a plan." />

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {!item ? (
            <BrandCard>
              <Text style={styles.h2}>Not found</Text>
              <Text style={styles.sub}>
                We couldn't find that experience. Try picking another one.
              </Text>
            </BrandCard>
          ) : (
            <BrandCard>
              <Text style={styles.h2}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.neighborhood} • {item.price} • {item.duration}
              </Text>
              <Text style={styles.sub}>{item.description}</Text>

              <View style={styles.tagRow}>
                {[...item.personas, ...item.vibes].map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))}
              </View>
            </BrandCard>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
  },

  h2: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "900",
  },

  meta: {
    color: theme.subtext,
    marginTop: 8,
    fontWeight: "700",
  },

  sub: {
    color: theme.subtext,
    marginTop: 8,
    fontWeight: "700",
    lineHeight: 20,
  },

  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },

  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  tagText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "800",
  },
});
