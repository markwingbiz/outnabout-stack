// bownd/data/showcase.ts
// AUTHORIZED SHOWCASE FALLBACK — demo-only sample listings.
//
// - These listings are shown ONLY when Firestore returns an empty catalog
//   (no real events AND no real venues). The fallback is wholesale: demo
//   data is NEVER mixed with real data.
// - Demo data is NEVER written to Firestore, NEVER purchasable, NEVER
//   redeemable, and NEVER presented as live inventory. Screens render an
//   honest "Showcase preview" chip/badge whenever demo data is shown.
// - All start times are computed dynamically from `new Date()` so every
//   demo event is in the future at module load. No calendar date is
//   hardcoded here (a hardcoded date would go stale and the Events time
//   filters would drop past events).
// - Demo ids are prefixed `demo-` and can never collide with Firestore
//   doc ids. `isShowcaseId()` is the single check for demo identity.
// - Venue lat/lng are approximate downtown-KC coordinates, flagged demo,
//   display-only. Nothing renders maps from them.

import type { EventItem, Venue } from "../lib/store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShowcaseEvent = EventItem & { isDemo: true; featured?: boolean };
export type ShowcaseVenue = Venue & { isDemo: true; featured?: boolean };

// ---------------------------------------------------------------------------
// Dynamic date helpers — every result is in the future at call time.
// ---------------------------------------------------------------------------

function atDay(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Today at hour:minute, or tomorrow at that time if it already passed. */
function tonightAt(hour: number, minute: number): Date {
  const now = new Date();
  const t = atDay(now, hour, minute);
  if (t.getTime() <= now.getTime()) {
    t.setDate(t.getDate() + 1);
  }
  return t;
}

/** Tomorrow at hour:minute (always in the future). */
function tomorrowAt(hour: number, minute: number): Date {
  const now = new Date();
  const t = atDay(now, hour, minute);
  t.setDate(t.getDate() + 1);
  return t;
}

/**
 * Next occurrence of the given weekday (0 = Sunday … 6 = Saturday) at
 * hour:minute. If today is that weekday and the time is still ahead, it
 * is today; otherwise it is the following week's occurrence.
 */
function nextWeekdayAt(weekday: number, hour: number, minute: number): Date {
  const now = new Date();
  const today = atDay(now, hour, minute);
  let diff = (weekday - now.getDay() + 7) % 7;
  if (diff === 0 && today.getTime() <= now.getTime()) diff = 7;
  const t = atDay(now, hour, minute);
  t.setDate(t.getDate() + diff);
  return t;
}

// ---------------------------------------------------------------------------
// Demo venues (6)
// ---------------------------------------------------------------------------

const SHOWCASE_VENUES: ShowcaseVenue[] = [
  {
    id: "demo-venue-chicken-n-pickle",
    name: "Chicken N Pickle",
    lat: 39.11,
    lng: -94.58,
    isDemo: true,
  },
  {
    id: "demo-venue-green-lady",
    name: "Green Lady Lounge",
    lat: 39.099,
    lng: -94.578,
    isDemo: true,
  },
  {
    id: "demo-venue-kc-winery",
    name: "KC Winery",
    lat: 39.1,
    lng: -94.57,
    isDemo: true,
  },
  {
    id: "demo-venue-arvest",
    name: "Arvest Bank Theatre",
    lat: 39.099,
    lng: -94.58,
    isDemo: true,
  },
  {
    id: "demo-venue-city-market",
    name: "City Market",
    lat: 39.11,
    lng: -94.58,
    isDemo: true,
  },
  {
    id: "demo-venue-comedy-cabaret",
    name: "KC Comedy Cabaret",
    lat: 39.1,
    lng: -94.58,
    isDemo: true,
  },
];

// ---------------------------------------------------------------------------
// Demo events (10) — start times computed dynamically, always future.
// ---------------------------------------------------------------------------

const SHOWCASE_EVENTS: ShowcaseEvent[] = [
  {
    id: "demo-event-pickleball",
    title: "Family Fun Pickleball Night",
    venueId: "demo-venue-chicken-n-pickle",
    startISO: tonightAt(19, 0).toISOString(),
    category: "spotlight",
    vibeTags: ["Sporty", "Fun"],
    audienceTags: ["Parents", "Family"],
    priceLabel: "$",
    isDemo: true,
    featured: true,
  },
  {
    id: "demo-event-jazz",
    title: "Jazz + Cocktails",
    venueId: "demo-venue-green-lady",
    startISO: tonightAt(21, 0).toISOString(),
    category: "spotlight",
    vibeTags: ["Relaxed", "Music"],
    audienceTags: ["Couples"],
    priceLabel: "$$",
    isDemo: true,
  },
  {
    id: "demo-event-yoga-wine",
    title: "Yoga & Wine Night",
    venueId: "demo-venue-kc-winery",
    startISO: tomorrowAt(18, 30).toISOString(),
    category: "standard",
    vibeTags: ["Wellness", "Wine"],
    audienceTags: ["Couples"],
    priceLabel: "$$",
    isDemo: true,
  },
  {
    id: "demo-event-comedy",
    title: "Stand-Up Showcase",
    venueId: "demo-venue-comedy-cabaret",
    startISO: tonightAt(20, 0).toISOString(),
    category: "standard",
    vibeTags: ["Fun", "Comedy"],
    audienceTags: ["Singles", "Couples"],
    priceLabel: "$$",
    isDemo: true,
  },
  {
    id: "demo-event-farmers-market",
    title: "Saturday Farmers Market & Live Music",
    venueId: "demo-venue-city-market",
    startISO: nextWeekdayAt(6, 9, 0).toISOString(),
    category: "standard",
    vibeTags: ["Fun", "Music"],
    audienceTags: ["Family", "Parents"],
    priceLabel: "Free",
    isDemo: true,
  },
  {
    id: "demo-event-indie",
    title: "Live Indie Night",
    venueId: "demo-venue-arvest",
    startISO: nextWeekdayAt(5, 20, 0).toISOString(),
    category: "standard",
    vibeTags: ["Music"],
    audienceTags: ["Couples", "Singles"],
    priceLabel: "$$",
    isDemo: true,
  },
  {
    id: "demo-event-date-duel",
    title: "Date Night Duel",
    venueId: "demo-venue-chicken-n-pickle",
    startISO: tomorrowAt(19, 0).toISOString(),
    category: "standard",
    vibeTags: ["Sporty", "Fun"],
    audienceTags: ["Couples"],
    priceLabel: "$",
    isDemo: true,
  },
  {
    id: "demo-event-sunset-sips",
    title: "Sunset Sips",
    venueId: "demo-venue-kc-winery",
    startISO: nextWeekdayAt(6, 18, 0).toISOString(),
    category: "standard",
    vibeTags: ["Wine", "Relaxed"],
    audienceTags: ["Couples"],
    priceLabel: "$$",
    isDemo: true,
  },
  {
    id: "demo-event-jazz-brunch",
    title: "Sunday Jazz Brunch",
    venueId: "demo-venue-green-lady",
    startISO: nextWeekdayAt(0, 11, 0).toISOString(),
    category: "standard",
    vibeTags: ["Relaxed", "Music"],
    audienceTags: ["Couples", "Family"],
    priceLabel: "$$",
    isDemo: true,
  },
  {
    id: "demo-event-improv",
    title: "Family Improv Matinee",
    venueId: "demo-venue-comedy-cabaret",
    startISO: nextWeekdayAt(6, 14, 0).toISOString(),
    category: "standard",
    vibeTags: ["Fun", "Comedy"],
    audienceTags: ["Family", "Parents", "Kids"],
    priceLabel: "$",
    isDemo: true,
  },
];

export function getShowcaseEvents(): ShowcaseEvent[] {
  return [...SHOWCASE_EVENTS];
}

export function getShowcaseVenues(): ShowcaseVenue[] {
  return [...SHOWCASE_VENUES];
}

// ---------------------------------------------------------------------------
// Demo identity + lookup
// ---------------------------------------------------------------------------

export function isShowcaseId(id: string): boolean {
  return id.startsWith("demo-");
}

export function findShowcaseEvent(id: string): ShowcaseEvent | undefined {
  return SHOWCASE_EVENTS.find((e) => e.id === id);
}

export function findShowcaseVenue(id: string): ShowcaseVenue | undefined {
  return SHOWCASE_VENUES.find((v) => v.id === id || v.name === id);
}

// ---------------------------------------------------------------------------
// Featured playlists
// ---------------------------------------------------------------------------

export type Playlist = {
  id: string;
  title: string;
  subtitle: string;
  itemIds: string[];
  match: (e: EventItem, venueName: string) => boolean;
};

export type ResolvedPlaylistItem =
  | { kind: "event"; event: EventItem }
  | { kind: "venue"; venue: Venue };

export type ResolvedPlaylist = {
  id: string;
  title: string;
  subtitle: string;
  items: ResolvedPlaylistItem[];
};

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startsToday(e: EventItem): boolean {
  const d = new Date(e.startISO);
  if (Number.isNaN(d.getTime())) return false;
  return sameCalendarDay(d, new Date());
}

function hasTag(tags: string[] | undefined, ...wanted: string[]): boolean {
  const lower = (tags || []).map((t) => t.toLowerCase());
  return wanted.some((w) => lower.includes(w.toLowerCase()));
}

export const PLAYLISTS: Playlist[] = [
  {
    id: "tonight-in-kc",
    title: "Tonight in KC",
    subtitle: "Happening tonight",
    itemIds: ["demo-event-pickleball", "demo-event-jazz", "demo-event-comedy"],
    match: (e) => startsToday(e),
  },
  {
    id: "date-night",
    title: "Date Night",
    subtitle: "Couples picks",
    itemIds: [
      "demo-event-jazz",
      "demo-event-yoga-wine",
      "demo-event-sunset-sips",
      "demo-event-date-duel",
    ],
    match: (e) =>
      hasTag(e.audienceTags, "Couples") || hasTag(e.vibeTags, "Wine"),
  },
  {
    id: "family-fun",
    title: "Family Fun",
    subtitle: "Bring the whole crew",
    itemIds: [
      "demo-event-pickleball",
      "demo-event-farmers-market",
      "demo-event-improv",
    ],
    match: (e) => hasTag(e.audienceTags, "Family", "Parents", "Kids"),
  },
];

function venueNameFor(venueId: string, venues: Venue[]): string {
  const v = venues.find((x) => x.id === venueId || x.name === venueId);
  return v?.name ?? (venueId || "Venue");
}

/**
 * Resolve playlists against a catalog (events AND venues).
 * - itemIds resolve first (events, then venues).
 * - Then catalog events matching the playlist predicate are added.
 * - Deduped by kind+id. Only playlists with >= 1 item are returned.
 * - Venue entries resolve from itemIds ONLY (demo-mode only: no
 *   predicate ever adds a venue — predicates match events).
 */
export function resolvePlaylists(
  events: EventItem[],
  venues: Venue[]
): ResolvedPlaylist[] {
  const out: ResolvedPlaylist[] = [];
  for (const p of PLAYLISTS) {
    const items: ResolvedPlaylistItem[] = [];
    const seen = new Set<string>();
    for (const id of p.itemIds) {
      const ev = events.find((e) => e.id === id);
      if (ev) {
        items.push({ kind: "event", event: ev });
        seen.add(`event:${ev.id}`);
        continue;
      }
      const venue = venues.find((v) => v.id === id || v.name === id);
      if (venue) {
        items.push({ kind: "venue", venue });
        seen.add(`venue:${venue.id}`);
      }
    }
    for (const e of events) {
      const key = `event:${e.id}`;
      if (seen.has(key)) continue;
      if (p.match(e, venueNameFor(e.venueId, venues))) {
        items.push({ kind: "event", event: e });
        seen.add(key);
      }
    }
    if (items.length >= 1) {
      out.push({ id: p.id, title: p.title, subtitle: p.subtitle, items });
    }
  }
  return out;
}
