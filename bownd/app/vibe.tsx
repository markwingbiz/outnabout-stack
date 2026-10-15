// app/vibe.tsx (or wherever your VibeScreen file is)
import React from "react";
import { SafeAreaView, View, Text, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BrandBackground } from "./ui/BrandBackground";
import { BrandCard } from "./ui/BrandCard";
import BrandHeader from "./ui/BrandHeader";
import { radii, spacing, theme } from "./ui/theme";
import type { Vibe } from "../data/experiences";
import { GlowPill } from "./ui/GlowPill";

export default function VibeScreen() {
  const { persona } = useLocalSearchParams<{ persona?: string }>();

  const vibes: Vibe[] =
    persona === "Parents"
      ? ["Fun", "Relaxed", "Sporty", "Adventurous"]
      : persona === "Singles"
      ? ["Spicy", "Fun", "Relaxed", "Adventurous"]
      : ["Spicy", "Fun", "Relaxed", "Adventurous"];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <BrandBackground />

      <View style={{ padding: spacing.page, flex: 1 }}>
        <BrandHeader tagline="Pick a vibe. Pick a plan." />

        <BrandCard>
          <Text style={styles.h2}>For: {persona ?? "—"}</Text>
          <Text style={styles.sub}>Choose a vibe.</Text>

          <View style={{ marginTop: spacing.md }}>
            {vibes.map((v) => (
              <GlowPill
                key={v}
                label={v}
                onPress={() =>
                  router.push({
                    pathname: "/list",
                    params: { persona: persona ?? "", vibe: v },
                  })
                }
              />
            ))}
          </View>
        </BrandCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  h2: { color: theme.text, fontSize: 18, fontWeight: "900" },
  sub: { color: theme.subtext, marginTop: 6, fontWeight: "700" },
});
