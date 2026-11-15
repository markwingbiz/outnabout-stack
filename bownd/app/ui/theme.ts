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

  // Glows (deep plum since 2026-11-15 — was vivid violet rgba(124,58,237,…))
  glowPurple: "rgba(42,22,80,0.55)",
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
    shadowColor: "#2A1650",
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
// #0A0616) and hairlines are champagne-gold tinted.
//
// 2026-11-15 (Mark): replace the purple with the mockup's DEEP PLUM.
// Surface treatments (gradient, violet solid, glows) are plum now;
// the vivid blue -> violet ramp survives ONLY as the brand mark
// (the pin emblem) — the mockup itself labels that ramp "brand only".
export const premium = {
  // Page base (brochure midnight plum-navy)
  bg: "#0A0616",

  // Screen base (mockup .screen background: --bg2). Tab screens paint
  // the screenGradient below over this.
  bg2: "#0F0A1F",

  // Surfaces (mockup --surface / --surface2 / --surface3, verbatim)
  surface: "#171129",
  surface2: "#1E1733",
  surface3: "#271D47",
  // Hairlines are the mockup's NEUTRAL white lines (--line .07 /
  // --line2 .12) — gold is an accent, never the border system.
  line: "rgba(255,255,255,0.07)",
  line2: "rgba(255,255,255,0.12)",

  // Text on dark (mockup --ink / --ink2 / --muted, verbatim)
  ink: "#F5F3FB",
  ink2: "#C8C3DC",
  muted: "#968FB2",

  // Accents
  gold: "#e8c476",
  goldSoft: "rgba(232,196,118,0.13)",
  goldBorder: "rgba(232,196,118,0.40)",
  green: "#3ddc97",
  blue: "#2F6BFF",
  // Solid plum for small filled controls (new/redeem/scan buttons, the
  // wordmark dot). Was vivid #5B34E0; the value is the mockup file's
  // own plum "on" solid (.cur-pill.on background) — deep plum, not purple.
  violet: "#4A4368",
  link: "#9DB9FF",

  // Surface gradient — DEEP PLUM (owner direction 2026-11-15): the
  // mockup's plum surface family, blue-plum direction kept but deepened
  // (#1D1440 venue-hero plum -> #271D47 surface3 -> #2A1650 rewards
  // plum). Drives the header avatar, active pills/chips, playlist tag,
  // bottom-nav active dot and the rewards progress fill.
  gradient: ["#1D1440", "#271D47", "#2A1650"] as const,

  // Brand gradient (mockup --grad: royal blue -> violet -> deep
  // violet) — BRAND MARK ONLY (the pin emblem in premium.tsx, whose
  // SVG stops are the same values). Never a surface treatment.
  brandGradient: ["#2F6BFF", "#5B34E0", "#7A2BD0"] as const,

  // Screen background: FLAT mockup bg2, settling to the deep bg only
  // at the very bottom edge. The mockup's .screen is a flat --bg2
  // (#0F0A1F) — measured on its rendered phones, the background is
  // rgb(15,10,31), luminance 12.6, at EVERY height on every screen.
  // The previous top stop (#21153F) rendered at luminance ~25 across
  // the top of every app screen, which is why the app read lighter /
  // more purple than the mockup despite matching token values
  // (owner follow-up, 2026-11-15: "the deep plum still is not as
  // dark as the mock up" — judged on rendered pixels, not tokens).
  screenGradient: ["#0F0A1F", "#0F0A1F", "#0A0616"] as const,
  screenGradientLocations: [0, 0.55, 1] as const,

  // Rewards balance card gradient (mockup .rw-card, 135deg)
  rewardsGradient: ["#130D28", "#2A1650"] as const,

  radius: 18,
};

// Venue icon-tile palette (mockup venue tiles): one solid color per
// placeholder category, white glyph on top. Deterministic per venue so
// a venue keeps its color across screens. Colors are the mockup's own
// tile colors (v11 Venues view): violet #7c3aed, gold #b98a1d, teal
// #0ea5a4, coral #e05260, blue #2e7cf6, pink #db2777 — saturated, not
// deepened; the 2026-11-13 "deepened" variants read muddy on screen.
export const venueTilePalette: Record<string, string> = {
  music: "#7C3AED",
  nightlife: "#DB2777",
  food: "#E05260",
  family: "#0EA5A4",
  arts: "#2F6BFF",
  default: "#B98A1D",
};
