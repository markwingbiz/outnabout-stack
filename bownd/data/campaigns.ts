// bownd/data/campaigns.ts
// Campaign slot config (premium UI pass, 2026-11-11).
//
// The campaign page is a REUSABLE SLOT, not an NYE one-off (Mark,
// 2026-11-11): one config entry per campaign — name, dates, theme,
// linked-event matching, headline ticket tiers — and the Home banner +
// campaign page render from it. When a campaign ends, the next entry
// (Valentine's Day, then the next major holiday/event campaign) takes
// the slot by config change alone. First entry: "Bownd presents KC NYE".
//
// Rules that hold for every campaign:
// - Linked events are matched from the REAL catalog (never invented).
//   Discovered (link-out-only) events can never join a campaign.
// - The campaign page's Featured section is SELLABLE INVENTORY shown
//   as display + a contact action only. There is NO billing and NO
//   checkout here: paid placement activates only on verified payment
//   (Stripe build), and a placement already included in a package
//   (Event Launch / Major Event Partner) is never charged twice.
// - Ticket tiers are the campaign's own configured prices for its
//   headline event. The fee math uses Bownd's decided fee
//   (2.5% + $0.99/ticket) with the full total shown before purchase.
import type { EventItem } from "../lib/store";

export type CampaignTier = {
  id: string;
  name: string;
  blurb: string;
  priceCents: number;
};

export type Campaign = {
  id: string;
  /** Short brand line, e.g. "Bownd presents". */
  presenter: string;
  name: string;
  tagline: string;
  description: string;
  datesLabel: string;
  /** Banner shows from this ISO date (local) until endsISO. */
  displayFromISO: string;
  endsISO: string;
  /** Theme gradient for the banner + page hero. */
  gradient: readonly [string, string, string];
  /** Lowercase substrings matched against event title + tags. */
  matchTags: string[];
  /** Optional calendar match (local month 1-12 + day) for the headline date. */
  matchMonth?: number;
  matchDay?: number;
  /** Headline-event ticket tiers (campaign's own configured prices). */
  ticketTiers?: CampaignTier[];
  refundLabel?: string;
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "kc-nye-2026",
    presenter: "Bownd presents",
    name: "KC NYE",
    tagline: "The Big Night — Kansas City's New Year's Eve, gathered by Bownd.",
    description:
      "Bownd's launch night. The rooms, the countdowns, and one QR at the door — no paper, no screenshots, no second scan.",
    datesLabel: "Wed, Dec 31 · 9:00 PM – 1:00 AM",
    displayFromISO: "2026-11-01T00:00:00",
    endsISO: "2027-01-01T06:00:00",
    gradient: ["#151833", "#4c2a85", "#8a3b8f"],
    matchTags: ["nye", "new year", "new year's eve", "new years eve"],
    matchMonth: 12,
    matchDay: 31,
    ticketTiers: [
      { id: "ga", name: "General Admission", blurb: "Entry + midnight toast", priceCents: 4500 },
      { id: "premium", name: "Premium", blurb: "Fast-lane entry + lounge access", priceCents: 8500 },
      { id: "table", name: "Table for the night", blurb: "Reserved table + bottle service credit", priceCents: 15000 },
    ],
    refundLabel: "Flexible",
  },
];

/** The campaign whose display window contains `now`, if any. */
export function getActiveCampaign(now: Date = new Date()): Campaign | undefined {
  const t = now.getTime();
  return CAMPAIGNS.find((c) => {
    const from = Date.parse(c.displayFromISO);
    const until = Date.parse(c.endsISO);
    return Number.isFinite(from) && Number.isFinite(until) && t >= from && t <= until;
  });
}

/**
 * Events linked to a campaign: real catalog events whose title/tags
 * match the campaign, or that start on the campaign's headline date.
 * Discovered (link-out-only) events are excluded — a campaign never
 * sells or features an outside listing.
 */
export function campaignEvents(campaign: Campaign, events: EventItem[]): EventItem[] {
  return events.filter((e) => {
    if (e.discovered) return false;
    const hay = [e.title, ...(e.vibeTags || []), ...(e.audienceTags || [])]
      .join(" ")
      .toLowerCase();
    if (campaign.matchTags.some((t) => hay.includes(t))) return true;
    if (campaign.matchMonth && campaign.matchDay) {
      const d = new Date(e.startISO);
      if (!Number.isNaN(d.getTime())) {
        return d.getMonth() + 1 === campaign.matchMonth && d.getDate() === campaign.matchDay;
      }
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Sellable Featured inventory inside a campaign (decided prices,
// 2026-10-21). Display + interest action only — activation happens on
// verified payment through the payments build, never in this UI.
// ---------------------------------------------------------------------------

export type FeaturedRate = { label: string; price: string };

export const FEATURED_VENUE_RATES: FeaturedRate[] = [
  { label: "Per day", price: "$10" },
  { label: "Per week", price: "$49" },
  { label: "Per month", price: "$149" },
];

export const SPOTLIGHT_EVENT_RATES: FeaturedRate[] = [
  { label: "Per day", price: "$20" },
  { label: "Per week", price: "$99" },
  { label: "Per month", price: "$299" },
];

export const FEATURED_NO_DOUBLE_CHARGE_NOTE =
  "Already included in your package? Event Launch includes a week of Spotlight and Major Event Partner includes two — included placement is never charged twice.";
