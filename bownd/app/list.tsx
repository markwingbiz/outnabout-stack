import React, { useMemo } from "react";
import { SafeAreaView, View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BrandBackground } from "./ui/BrandBackground";
import { BrandCard } from "./ui/BrandCard";
import BrandHeader from "./ui/BrandHeader";
import { radii, spacing, theme } from "./ui/theme";
import { EXPERIENCES, Persona, Vibe } from "../data/experiences";

export default function ListScreen() {
  const { persona, vibe } = useLocalSearchParams<{ persona?: Persona; vibe?: Vibe }>();

  const items = useMemo(() => {
    return EXPERIENCES.filter((e) => {
      const okPersona = persona ? e.personas.includes(persona) : true;
      const okVibe = vibe ? e.vibes.includes(vibe) : true;
      return okPersona && okVibe;
    });
  }, [persona, vibe]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <BrandBackground />
      <View style={{ padding: spacing.page, flex: 1 }}>
        <BrandHeader tagline={`${persona ?? "All"} • ${vibe ?? "All vibes"}`} />

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.cardPress, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: "/detail", params: { id: item.id } })}
            >
              <BrandCard>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.neighborhood} • {item.price} • {item.duration}
                </Text>
                <Text style={styles.desc} numberOfLines={2}>
                  {item.description}
                </Text>
              </BrandCard>
            </Pressable>
          ))}

          {items.length === 0 && (
            <BrandCard>
              <Text style={styles.title}>No matches yet</Text>
              <Text style={styles.desc}>Try a different vibe or add more experiences.</Text>
            </BrandCard>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cardPress: { marginBottom: 12 },
  title: { color: theme.text, fontWeight: "900", fontSize: 16 },
  meta: { color: theme.subtext, marginTop: 6, fontWeight: "700" },
  desc: { color: "rgba(255,255,255,0.82)", marginTop: 8, lineHeight: 18 },
  pressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
});
