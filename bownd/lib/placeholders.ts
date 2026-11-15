// bownd/lib/placeholders.ts
// Placeholder imagery for Bownd cards and heroes.
//
// OWNER DIRECTION (2026-11-15): the approved premium mockup's event
// pictures ARE the app's placeholder pictures. Every picture below is
// bundled from the mockup source (v11 assets) as
// assets/placeholders/mockup-*.jpg. They stand in ONLY until real
// photography arrives from venues:
//
//   A real photoUrl (http/https) ALWAYS wins over every placeholder —
//   that rule is the owner's stated plan and must not change. When a
//   listing gets a real photo, set photoUrl on the Firestore doc and
//   it replaces the mockup picture automatically — no code change.
//
// Mapping (deterministic, driven by the keyword categories below):
//
//   EVENT cards (resolveEventCardImage):
//     NYE / New Year text ......... mockup-nye.jpg      champagne + sparkler
//     music ....................... mockup-concert.jpg  arena crowd + stage lights
//     food ........................ mockup-dining.jpg   candlelit restaurant
//     family ...................... mockup-plaza.jpg    Plaza holiday lights
//     nightlife ................... mockup-rooftop.jpg  rooftop cocktails, city lights
//     arts ........................ mockup-skyline.jpg  KC skyline / Union Station
//     default ..................... mockup-crowd.jpg    the mockup's generic crowd filler
//
//   VENUE + generic cards (resolveCardImage / PLACEHOLDER_IMAGES):
//     music ....................... mockup-jazz.jpg     jazz trio in a dim club
//     food ........................ mockup-dining.jpg
//     family ...................... mockup-plaza.jpg
//     nightlife ................... mockup-rooftop.jpg
//     arts ........................ mockup-concert.jpg
//     default ..................... mockup-skyline.jpg
//
//   CAMPAIGN / NYE heroes (resolveCampaignImage):
//     no real image ............... mockup-nye.jpg (the sparkler picture)
//
// Known resolution notes: mockup-nye.jpg is 384px wide (portrait) and
// mockup-crowd.jpg is 1199x135 — both are the best versions the mockup
// itself ships; they will soften on large heroes. All others >= 600px.
//
// Superseded by this mapping (no longer referenced): the abstract
// category art (placeholder-*.jpg) and the single TEMP scene photo
// (temp-event-scene.jpg) that used to back every event card.
import type { ImageSourcePropType } from "react-native";

export type PlaceholderCategory = "music" | "food" | "family" | "nightlife" | "arts" | "default";

/** The mockup's NYE picture — champagne and a sparkler. Campaign hero default. */
export const CAMPAIGN_PLACEHOLDER_IMAGE: ImageSourcePropType = require("../assets/placeholders/mockup-nye.jpg");

// Venue / generic card placeholders: the mockup's pictures, per category.
export const PLACEHOLDER_IMAGES: Record<PlaceholderCategory, ImageSourcePropType> = {
  music: require("../assets/placeholders/mockup-jazz.jpg"),
  food: require("../assets/placeholders/mockup-dining.jpg"),
  family: require("../assets/placeholders/mockup-plaza.jpg"),
  nightlife: require("../assets/placeholders/mockup-rooftop.jpg"),
  arts: require("../assets/placeholders/mockup-concert.jpg"),
  default: require("../assets/placeholders/mockup-skyline.jpg"),
};

// Event card placeholders: the mockup's pictures, per category.
export const EVENT_PLACEHOLDER_IMAGES: Record<PlaceholderCategory, ImageSourcePropType> = {
  music: require("../assets/placeholders/mockup-concert.jpg"),
  food: require("../assets/placeholders/mockup-dining.jpg"),
  family: require("../assets/placeholders/mockup-plaza.jpg"),
  nightlife: require("../assets/placeholders/mockup-rooftop.jpg"),
  arts: require("../assets/placeholders/mockup-skyline.jpg"),
  default: require("../assets/placeholders/mockup-crowd.jpg"),
};

// Keyword -> category. First match wins; order is deliberate (family and
// music checked before broader buckets like food/nightlife).
const KEYWORD_MAP: Array<{ category: Exclude<PlaceholderCategory, "default">; words: string[] }> = [
  {
    category: "family",
    words: ["family", "parents", "kid", "children", "pickleball", "picnic", "storytime", "easter"],
  },
  {
    category: "music",
    words: [
      "music",
      "jazz",
      "concert",
      "indie",
      "rock",
      "pop",
      "dj",
      "live music",
      "band",
      "symphony",
      "hip hop",
      "country",
      "blues",
      "soul",
      "motown",
    ],
  },
  {
    category: "food",
    words: [
      "food",
      "wine",
      "brunch",
      "farmers",
      "market",
      "pizza",
      "beer",
      "coffee",
      "dinner",
      "tasting",
      "culinary",
      "sips",
      "bakery",
      "bbq",
      "barbecue",
    ],
  },
  {
    category: "nightlife",
    words: ["nightlife", "club", "cocktail", "party", "dance", "late night", "lounge", "bar crawl"],
  },
  {
    category: "arts",
    words: [
      "art",
      "comedy",
      "theatre",
      "theater",
      "improv",
      "gallery",
      "film",
      "movie",
      "paint",
      "ballet",
      "opera",
      "musical",
      "cabaret",
    ],
  },
];

export function categoryForText(...texts: Array<string | undefined | null>): PlaceholderCategory {
  const haystack = texts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!haystack.trim()) return "default";
  for (const { category, words } of KEYWORD_MAP) {
    if (words.some((w) => haystack.includes(w))) return category;
  }
  return "default";
}

export function categoryForVenueName(name?: string | null): PlaceholderCategory {
  return categoryForText(name);
}

/** True when the texts mark an NYE / New Year listing (sparkler picture). */
function isNyeText(...texts: Array<string | undefined | null>): boolean {
  const haystack = texts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("nye") || haystack.includes("new year");
}

/**
 * Resolve the background for an EVENT card. A real photoUrl (http/https)
 * always wins; otherwise the mockup picture for the event's category —
 * pass the event's title / venue / tags as texts so the mapping can see
 * them. NYE / New Year events get the sparkler picture.
 */
export function resolveEventCardImage(
  photoUrl: string | undefined | null,
  ...texts: Array<string | undefined | null>
): ImageSourcePropType {
  const url = typeof photoUrl === "string" ? photoUrl.trim() : "";
  if (url && /^https?:\/\//i.test(url)) {
    return { uri: url };
  }
  if (isNyeText(...texts)) return CAMPAIGN_PLACEHOLDER_IMAGE;
  return EVENT_PLACEHOLDER_IMAGES[categoryForText(...texts)];
}

/**
 * Resolve a CAMPAIGN hero (NYE tab hero, campaign banners). A real
 * image (http/https) always wins; otherwise the mockup's NYE sparkler
 * picture.
 */
export function resolveCampaignImage(photoUrl: string | undefined | null): ImageSourcePropType {
  const url = typeof photoUrl === "string" ? photoUrl.trim() : "";
  if (url && /^https?:\/\//i.test(url)) {
    return { uri: url };
  }
  return CAMPAIGN_PLACEHOLDER_IMAGE;
}

/**
 * Resolve the image for a card. A real photoUrl (http/https) always wins;
 * otherwise the mockup picture for the category is used.
 */
export function resolveCardImage(
  photoUrl: string | undefined | null,
  category: PlaceholderCategory = "default"
): ImageSourcePropType {
  const url = typeof photoUrl === "string" ? photoUrl.trim() : "";
  if (url && /^https?:\/\//i.test(url)) {
    return { uri: url };
  }
  return PLACEHOLDER_IMAGES[category];
}
