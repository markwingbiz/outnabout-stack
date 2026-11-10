// bownd/components/ui/CardBackground.tsx
// Card background image + readability scrim. Wraps card content in an
// ImageBackground (TEMP placeholder art or a real photo — see
// lib/placeholders.ts) with a bottom-weighted dark gradient so title text
// stays readable over the image. The scrim is a gradient, not a flat
// overlay, so the image still shows at the top of the card.
import React from "react";
import {
  ImageBackground,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  source: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  /** Padding / alignment for the content inside the scrim. */
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function CardBackground({ source, style, contentStyle, children }: Props) {
  return (
    <ImageBackground source={source} style={[styles.bg, style]} resizeMode="cover">
      <LinearGradient
        colors={["rgba(8,5,18,0.08)", "rgba(8,5,18,0.30)", "rgba(8,5,18,0.62)"]}
        locations={[0, 0.45, 1]}
        style={[styles.scrim, contentStyle]}
      >
        {children}
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { overflow: "hidden" },
  scrim: { flex: 1 },
});
