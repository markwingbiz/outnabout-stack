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

// ---------------------------------------------------------------------------
// Premium design tokens (bownd premium UI pass, 2026-11-11;
// brochure restyle, 2026-11-13)
// ---------------------------------------------------------------------------
// The premium finish from the approved mockup, mapped onto the app's
// existing identity: same dark navy/purple family, lowercase bownd,
// gradient map pin. Gold is an accent only (points, campaign, featured)
// — never a surface flood. These tokens are additive: existing screens
// keep their current values unless they opt into the premium components
// in app/ui/premium.tsx.
//
// 2026-11-13 restyle (Mark, approving the brochure-cover look —
// "Perfect."): the pastel/magenta end of the old palette is gone.
// Surfaces are the brochure's deep midnight plum-navy (bg near
// #0A0616), hairlines are champagne-gold tinted, and the brand
// gradient runs royal blue -> violet -> deep violet.
export const premium = {
  // Page base (brochure midnight plum-navy)
  bg: "#0A0616",

  // Surfaces (deep plum-navy family)
  surface: "#171129",
  surface2: "#1E1733",
  surface3: "#271D47",
  line: "rgba(232,196,118,0.14)",
  line2: "rgba(232,196,118,0.26)",

  // Text on dark
  ink: "#f4f5fa",
  ink2: "#c9c2da",
  muted: "#968cab",

  // Accents
  gold: "#e8c476",
  goldSoft: "rgba(232,196,118,0.13)",
  goldBorder: "rgba(232,196,118,0.40)",
  green: "#3ddc97",
  blue: "#2F6BFF",
  violet: "#5B34E0",

  // Brand gradient (brochure pin family: royal blue -> violet -> deep violet)
  gradient: ["#2F6BFF", "#5B34E0", "#7A2BD0"] as const,

  // Rewards balance card gradient (deep plum -> violet)
  rewardsGradient: ["#171129", "#2A1B52"] as const,

  radius: 18,
};

// Venue icon-tile palette (mockup venue tiles): one solid color per
// placeholder category, white glyph on top. Deterministic per venue so
// a venue keeps its color across screens. Deepened 2026-11-13 to sit
// in the plum-navy family (no pastel ends).
export const venueTilePalette: Record<string, string> = {
  music: "#5B34E0",
  nightlife: "#8E2A6B",
  food: "#B03A44",
  family: "#0B7C7A",
  arts: "#2F6BFF",
  default: "#8A6D1F",
};
