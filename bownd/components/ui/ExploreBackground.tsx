import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export default function ExploreBackground({ children, style }: Props) {
  return (
    <LinearGradient
      // night -> violet -> pink -> peach -> sunrise yellow
      colors={["#2E2A7A", "#6B4CFF", "#FF79C6", "#FFB86B", "#FFE28A"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.container, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
