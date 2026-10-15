// app/ui/theme.ts
export const colors = {
  // Background gradient
  bgTop: "#070A14",
  bgMid: "#140B2A",
  bgBot: "#0A061A",

  // Text
  textPrimary: "rgba(255,255,255,0.95)",
  textSecondary: "rgba(255,255,255,0.72)",

  // Surfaces
  card: "rgba(255,255,255,0.06)",
  cardBorder: "rgba(255,255,255,0.14)",

  // Glows
  glowPurple: "rgba(124,58,237,0.55)",
  glowMagenta: "rgba(255,62,165,0.45)",
  glowBlue: "rgba(59,130,246,0.45)",

  // Button gradient
  purple: "#7C3AED",
  magenta: "#FF3EA5",
};

export const radii = {
  xl: 28,
  lg: 22,
  pill: 999,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  page: 18,
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  // Softer/lighter variant used by GlassCard.
  soft: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  glow: {
    shadowColor: "#A855F7",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
};

// Backwards-compatible with your current imports (theme.bg / theme.text etc.)
export const theme = {
  bg: colors.bgTop,
  text: colors.textPrimary,
  subtext: colors.textSecondary,
  card: colors.card,
  cardBorder: colors.cardBorder,
};
