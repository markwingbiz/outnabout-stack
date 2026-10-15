import React from "react";
import { ImageBackground, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const HOME_BG = require("../../assets/backgrounds/home-bg.jpg");

export default function AppBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ImageBackground source={HOME_BG} style={styles.bg} resizeMode="cover">
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={["rgba(0,0,0,0.2)", "rgba(0,0,0,0.6)"]}
      />
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
});
