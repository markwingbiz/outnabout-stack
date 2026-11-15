// bownd/lib/viewPrefs.ts
// View controls (owner model 2026-11-15): "users can control their
// view — hide drug-related, sports-related, or spicy content, or
// family-friendly-only. Maybe not persona but a view change."
//
// The prefs live on-device in AsyncStorage and are edited on the
// persona screen (the settings surface reached from Personal).
// Enforcement happens on the EVENTS page only: Tailored, Spotlight,
// and All Events all pass through passesViewPrefs, so a control
// never lies (a family-only user does not meet spicy in Spotlight
// either). Home does not enforce these yet — Home is frozen by the
// owner; extending enforcement there is a flagged follow-up.
//
// Classification runs over the event's own title + vibeTags +
// audienceTags, reusing the app's categorization machinery
// (categoryForText). Keyword sets are grounded in the catalog's
// actual tag vocabulary (data/showcase.ts + the persona vibe set):
//   vibeTags seen:     Fun, Music, Sporty, Relaxed, Wine, Wellness,
//                      Comedy (+ Spicy in the persona vibe set)
//   audienceTags seen: Couples, Family, Parents, Singles, Kids
import AsyncStorage from "@react-native-async-storage/async-storage";

import { categoryForText } from "./placeholders";

export type ViewPrefs = {
  hideDrugs: boolean;
  hideSports: boolean;
  hideSpicy: boolean;
  familyOnly: boolean;
};

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
  hideDrugs: false,
  hideSports: false,
  hideSpicy: false,
  familyOnly: false,
};

const KEY = "BOWND_VIEW_PREFS_V1";

function normalizePrefs(p: any): ViewPrefs {
  return {
    hideDrugs: p?.hideDrugs === true,
    hideSports: p?.hideSports === true,
    hideSpicy: p?.hideSpicy === true,
    familyOnly: p?.familyOnly === true,
  };
}

export async function loadViewPrefs(): Promise<ViewPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_VIEW_PREFS;
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_VIEW_PREFS;
  }
}

export async function saveViewPrefs(prefs: ViewPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(normalizePrefs(prefs)));
  } catch {
    // silent fail — prefs re-ask next launch
  }
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/** The slice of an event the classifier is allowed to see. */
export type ClassifiableEvent = {
  title: string;
  vibeTags?: string[] | null;
  audienceTags?: string[] | null;
};

// Drug-related: cannabis / 420 vocabulary. Alcohol is deliberately
// NOT here — wine/beer/cocktails are core nightlife inventory in
// this catalog (vibeTag "Wine", placeholders' food keywords), not
// what the owner means by drug-related.
const DRUG_WORDS = [
  "420",
  "cannabis",
  "marijuana",
  "weed",
  "thc",
  "cbd",
  "dispensary",
  "edibles",
  "hemp",
  "kush",
  "stoner",
  "smoke shop",
];

// Sports-related: the "Sporty" vibeTag (present in the catalog),
// KC's teams (this is a Kansas City catalog), and the common
// sport / game-day vocabulary, incl. pickleball (showcase title
// "Family Fun Pickleball Night").
const SPORTS_WORDS = [
  "sport",
  "football",
  "basketball",
  "baseball",
  "softball",
  "soccer",
  "hockey",
  "tennis",
  "golf",
  "pickleball",
  "volleyball",
  "boxing",
  "mma",
  "wrestling",
  "tailgate",
  "watch party",
  "game day",
  "gameday",
  "chiefs",
  "royals",
  "sporting kc",
  "nfl",
  "nba",
  "mlb",
  "nhl",
];

function haystack(e: ClassifiableEvent): string {
  return [e.title, ...(e.vibeTags || []), ...(e.audienceTags || [])]
    .join(" ")
    .toLowerCase();
}

function hasWord(hay: string, words: string[]): boolean {
  return words.some((w) => hay.includes(w));
}

export function isDrugRelated(e: ClassifiableEvent): boolean {
  return hasWord(haystack(e), DRUG_WORDS);
}

export function isSportsRelated(e: ClassifiableEvent): boolean {
  return hasWord(haystack(e), SPORTS_WORDS);
}

/** Spicy = the "spicy" vibe (persona vibe vocabulary) in tags/title. */
export function isSpicyEvent(e: ClassifiableEvent): boolean {
  return haystack(e).includes("spicy");
}

/**
 * Family-friendly = the app's own family bucket (categoryForText:
 * family/parents/kid/children/pickleball/picnic/storytime/easter)
 * or an explicit family audience tag (Family / Parents / Kids are
 * all real audienceTags in the catalog).
 */
export function isFamilyFriendly(e: ClassifiableEvent): boolean {
  if (categoryForText(e.title, ...(e.vibeTags || []), ...(e.audienceTags || [])) === "family") {
    return true;
  }
  const aud = (e.audienceTags || []).map((s) => s.toLowerCase());
  return aud.includes("family") || aud.includes("parents") || aud.includes("kids");
}

/**
 * The one gate every Events-page list passes through.
 * familyOnly short-circuits: only family-friendly items pass, so
 * the individual hides are moot while it is on.
 */
export function passesViewPrefs(e: ClassifiableEvent, prefs: ViewPrefs): boolean {
  if (prefs.familyOnly) return isFamilyFriendly(e);
  if (prefs.hideDrugs && isDrugRelated(e)) return false;
  if (prefs.hideSports && isSportsRelated(e)) return false;
  if (prefs.hideSpicy && isSpicyEvent(e)) return false;
  return true;
}
