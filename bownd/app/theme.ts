// app/ui/theme.ts

export const radii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  page: 20,
};

export const colors = {
  // Background gradient
  bgTop: "#070A14",
  bgMid: "#140B2A",
  bgBot: "#0A061A",

  // Glass
  glass: "rgba(255,255,255,0.08)",
  glass2: "rgba(255,255,255,0.06)",
  glassBorder: "rgba(255,255,255,0.14)",

  // Text
  text: "rgba(255,255,255,0.94)",
  subtext: "rgba(255,255,255,0.70)",

  // Accent
  purple: "#7C3AED",
  magenta: "#FF3EA5",
  blue: "#3B82F6",

  // Glow colors used by GlowButton & Background blobs
  glowPurple: "rgba(124,58,237,0.55)",
  glowMagenta: "rgba(255,62,165,0.45)",
  glowBlue: "rgba(59,130,246,0.45)",
};

export const theme = {
  bg: colors.bgTop,
  text: colors.text,
  subtext: colors.subtext,
  card: colors.glass,
  card2: colors.glass2,
  cardBorder: colors.glassBorder,
};

export const shadow = {
  glow: {
    shadowColor: colors.glowPurple,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  soft: {
    shadowColor: "rgba(0,0,0,0.55)",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
};
