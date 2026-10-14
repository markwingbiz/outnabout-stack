// Shared design tokens for Livework+ (matched to the supplied mockups).
export const THEME = {
  bg: "#0A0A14",
  bgElevated: "#14121F",
  card: "#1A1730",
  cardBorder: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.62)",
  textFaint: "rgba(255,255,255,0.42)",
  purple: "#8B5CF6",
  purpleBright: "#A855F7",
  purpleDeep: "#7C3AED",
  pink: "#E879F9",
  blue: "#38BDF8",
  green: "#34D399",
  orange: "#F59E0B",
  radius: 20,
  radiusSm: 14,
} as const;

export const FUNNEL_ACCENTS = {
  lead: { icon: "filter", color: "#A855F7", bar: "#8B5CF6" },
  sales: { icon: "people", color: "#38BDF8", bar: "#38BDF8" },
  delivery: { icon: "clipboard", color: "#34D399", bar: "#34D399" },
  retention: { icon: "trophy", color: "#F59E0B", bar: "#F59E0B" },
} as const;
