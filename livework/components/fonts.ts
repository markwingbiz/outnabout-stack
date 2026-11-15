// Livework premium type (visual pass, 2026-11-15): the mockup's
// Livework phone sets its wordmark, headings, stat values and chart
// numbers in Poppins, with Manrope for body/UI text — the same split
// Bownd uses. Loaded via expo-font's useFonts inside the screens
// that need it (deliberately NOT in _layout, mirroring Bownd's
// app/ui/premium.tsx). Until loading finishes (or if it fails),
// every family below is undefined and text falls back to the system
// font with its weight intact.
import { useFonts } from "expo-font";
import {
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";

export type LiveworkFontStyles = {
  loaded: boolean;
  display?: { fontFamily: string };
  displayBold?: { fontFamily: string };
  body?: { fontFamily: string };
  bodySemiBold?: { fontFamily: string };
  bodyBold?: { fontFamily: string };
  bodyExtraBold?: { fontFamily: string };
};

export function useLiveworkFonts(): LiveworkFontStyles {
  const [loaded] = useFonts({
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  if (!loaded) return { loaded: false };
  return {
    loaded: true,
    display: { fontFamily: "Poppins_800ExtraBold" },
    displayBold: { fontFamily: "Poppins_700Bold" },
    body: { fontFamily: "Manrope_400Regular" },
    bodySemiBold: { fontFamily: "Manrope_600SemiBold" },
    bodyBold: { fontFamily: "Manrope_700Bold" },
    bodyExtraBold: { fontFamily: "Manrope_800ExtraBold" },
  };
}
