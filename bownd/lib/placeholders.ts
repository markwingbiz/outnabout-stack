// bownd/lib/placeholders.ts
// TEMPORARY placeholder card artwork. These bundled images are ABSTRACT
// gradient/shape art (generated, not photos) used as card backgrounds until
// a venue supplies a real photo. They are NEVER presented as real venue
// photos, never hotlinked, never stock-photo URLs, and never remote.
//
// Rule: if a listing has a real photoUrl (a real venue-supplied photo),
// the real photo wins. Placeholders are fallback only. When a listing
// gets a real photo, set photoUrl on the Firestore doc — no code change.
import type { ImageSourcePropType } from "react-native";

export type PlaceholderCategory = "music" | "food" | "family" | "nightlife" | "arts" | "default";

// TEMP: abstract placeholder art, not photos of real places.
export const PLACEHOLDER_IMAGES: Record<PlaceholderCategory, ImageSourcePropType> = {
  music: require("../assets/placeholders/placeholder-music.jpg"),
  food: require("../assets/placeholders/placeholder-food.jpg"),
  family: require("../assets/placeholders/placeholder-family.jpg"),
  nightlife: require("../assets/placeholders/placeholder-nightlife.jpg"),
  arts: require("../assets/placeholders/placeholder-arts.jpg"),
  default: require("../assets/placeholders/placeholder-default.jpg"),
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

// TEMP: "Your City. Your Scene." photo (cropped from Mark's brand board,
// caption text excluded) — TEMP background for EVENT cards only. Venue
// cards keep the v1 per-category abstract placeholders below. A real
// photoUrl still wins over this TEMP image (see resolveEventCardImage).
export const EVENT_CARD_IMAGE: ImageSourcePropType = require(
  "../assets/placeholders/temp-event-scene.jpg"
);

/**
 * Resolve the background for an EVENT card. A real photoUrl (http/https)
 * always wins; otherwise the TEMP Scene photo is used.
 */
export function resolveEventCardImage(photoUrl: string | undefined | null): ImageSourcePropType {
  const url = typeof photoUrl === "string" ? photoUrl.trim() : "";
  if (url && /^https?:\/\//i.test(url)) {
    return { uri: url };
  }
  return EVENT_CARD_IMAGE;
}

/**
 * Resolve the image for a card. A real photoUrl (http/https) always wins;
 * otherwise the TEMP abstract placeholder for the category is used.
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
