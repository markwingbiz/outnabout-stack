// src/screens/PlanningScreen.tsx
import React from "react";
import { Image, SafeAreaView, StyleSheet, Text, View, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../ui/theme";
import { GlassCard } from "../ui/GlassCard";
import { OptionRow } from "../ui/OptionRow";
import { PrimaryButton } from "../ui/PrimaryButton";

export default function PlanningScreen() {
  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Base gradient */}
      <LinearGradient
        colors={[theme.colors.bgTop, theme.colors.bgMid, theme.colors.bgBottom]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Nebula texture PNG (KEEP YOUR EXISTING FILE) */}
      <Image
        source={require("../../assets/backgrounds/nebula.png")} // <-- change to your existing PNG
        resizeMode="cover"
        style={styles.nebula}
      />

      {/* Soft orb glows (KEEP YOUR EXISTING FILES or reuse one glow blob PNG) */}
      <Image
        source={require("../../assets/overlays/orb.png")} // <-- change to your existing PNG
        resizeMode="contain"
        style={styles.orbTopRight}
      />
      <Image
        source={require("../../assets/overlays/orb.png")} // <-- change to your existing PNG
        resizeMode="contain"
        style={styles.orbMidLeft}
      />
      <Image
        source={require("../../assets/overlays/orb.png")} // <-- change to your existing PNG
        resizeMode="contain"
        style={styles.orbBottom}
      />

      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>OutnAbout</Text>
          {/* If you have a logo PNG, place it here */}
          {/* <Image source={require("../../assets/logo.png")} style={{ width: 28, height: 28, marginLeft: 8 }} /> */}
        </View>

        <Text style={styles.title}>Pick a vibe. Pick a plan.</Text>

        <GlassCard style={styles.card}>
          <Text style={styles.question}>Who are you planning for?</Text>

          <View style={styles.list}>
            <OptionRow label="Singles" />
            <OptionRow label="Couples" />
            <OptionRow label="Parents" />
          </View>

          <View style={{ height: 14 }} />

          <PrimaryButton label="Venue Scan Mode (QR)" />
        </GlassCard>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bgBottom },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10 },

  header: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  brand: {
    color: "rgba(214, 179, 255, 0.9)",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 18,
  },

  card: {
    marginTop: 8,
  },
  question: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 14,
  },
  list: {
    gap: 12,
  },

  nebula: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.34, // Android-safe (don’t go too high)
  },

  orbTopRight: {
    position: "absolute",
    right: -90,
    top: -50,
    width: 280,
    height: 280,
    opacity: 0.55,
  },
  orbMidLeft: {
    position: "absolute",
    left: -120,
    top: 210,
    width: 330,
    height: 330,
    opacity: 0.35,
  },
  orbBottom: {
    position: "absolute",
    left: -40,
    bottom: -160,
    width: 520,
    height: 520,
    opacity: 0.45,
  },
});
