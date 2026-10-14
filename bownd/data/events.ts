export type EventItem = {
  id: string;
  title: string;
  venueId: string; // must match VENUES[].id
  startISO: string;
  category: "spotlight" | "featured" | "standard";
  vibeTags: string[];
  audienceTags: string[];
  priceLabel: string;
};

const isoInHours = (h: number) =>
  new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

export const EVENTS: EventItem[] = [
  // --- Spotlight (first 10) ---
  {
    id: "e_001",
    title: "Sporty Parents: Family Fun Pickleball Night",
    venueId: "Chicken N Pickle",
    startISO: isoInHours(6),
    category: "spotlight",
    vibeTags: ["sporty", "fun"],
    audienceTags: ["parents"],
    priceLabel: "$",
  },
  {
    id: "e_002",
    title: "Couples Date Night: Jazz + Cocktails",
    venueId: "Green Lady Lounge",
    startISO: isoInHours(8),
    category: "spotlight",
    vibeTags: ["relaxed", "fun"],
    audienceTags: ["couples"],
    priceLabel: "$$",
  },
  {
    id: "e_003",
    title: "Singles: Live DJ + Dance Floor",
    venueId: "The Ship",
    startISO: isoInHours(10),
    category: "spotlight",
    vibeTags: ["fun"],
    audienceTags: ["singles"],
    priceLabel: "$$",
  },
  {
    id: "e_004",
    title: "Parents: Kid-Friendly Movie Night",
    venueId: "Union Station",
    startISO: isoInHours(28),
    category: "spotlight",
    vibeTags: ["relaxed", "fun"],
    audienceTags: ["parents"],
    priceLabel: "$",
  },
  {
    id: "e_005",
    title: "Sporty: Indoor Rock Climb Meetup",
    venueId: "ROKC Climbing Gym",
    startISO: isoInHours(30),
    category: "spotlight",
    vibeTags: ["sporty"],
    audienceTags: ["singles"],
    priceLabel: "$$",
  },
  {
    id: "e_006",
    title: "Couples: River Market Stroll + Treats",
    venueId: "City Market",
    startISO: isoInHours(34),
    category: "spotlight",
    vibeTags: ["relaxed"],
    audienceTags: ["couples"],
    priceLabel: "$",
  },
  {
    id: "e_007",
    title: "Parents: Family Bowling + Arcade",
    venueId: "Main Event Entertainment",
    startISO: isoInHours(40),
    category: "spotlight",
    vibeTags: ["fun", "sporty"],
    audienceTags: ["parents"],
    priceLabel: "$$",
  },
  {
    id: "e_008",
    title: "Singles: Trivia Night (Teams Welcome)",
    venueId: "Up-Down KC",
    startISO: isoInHours(46),
    category: "spotlight",
    vibeTags: ["fun"],
    audienceTags: ["singles"],
    priceLabel: "$",
  },
  {
    id: "e_009",
    title: "Couples: Candlelit Dessert Crawl",
    venueId: "Country Club Plaza",
    startISO: isoInHours(52),
    category: "spotlight",
    vibeTags: ["relaxed", "fun"],
    audienceTags: ["couples"],
    priceLabel: "$$",
  },
  {
    id: "e_010",
    title: "Parents: Weekend Park Run + Coffee",
    venueId: "Loose Park",
    startISO: isoInHours(58),
    category: "spotlight",
    vibeTags: ["sporty", "relaxed"],
    audienceTags: ["parents"],
    priceLabel: "Free",
  },

  // --- Featured (next 20) ---
  {
    id: "e_011",
    title: "KC Comedy Night",
    venueId: "The Comedy Club of Kansas City",
    startISO: isoInHours(12),
    category: "featured",
    vibeTags: ["fun"],
    audienceTags: ["singles", "couples"],
    priceLabel: "$$",
  },
  {
    id: "e_012",
    title: "Museum Late Hours",
    venueId: "The Nelson-Atkins Museum of Art",
    startISO: isoInHours(14),
    category: "featured",
    vibeTags: ["relaxed"],
    audienceTags: ["couples", "singles"],
    priceLabel: "Free",
  },
  {
    id: "e_013",
    title: "Family Science Activity Night",
    venueId: "Science City",
    startISO: isoInHours(26),
    category: "featured",
    vibeTags: ["fun"],
    audienceTags: ["parents"],
    priceLabel: "$",
  },
  {
    id: "e_014",
    title: "Indoor Soccer Open Play",
    venueId: "Sporting KC Training Facility",
    startISO: isoInHours(32),
    category: "featured",
    vibeTags: ["sporty"],
    audienceTags: ["singles", "parents"],
    priceLabel: "$",
  },
  {
    id: "e_015",
    title: "Brunch + Walk",
    venueId: "Westport",
    startISO: isoInHours(36),
    category: "featured",
    vibeTags: ["relaxed", "fun"],
    audienceTags: ["couples", "singles"],
    priceLabel: "$$",
  },
  {
    id: "e_016",
    title: "Family Craft Hour",
    venueId: "Crown Center",
    startISO: isoInHours(42),
    category: "featured",
    vibeTags: ["fun"],
    audienceTags: ["parents"],
    priceLabel: "$",
  },
  {
    id: "e_017",
    title: "Spin Class Pop-Up",
    venueId: "CycleBar",
    startISO: isoInHours(44),
    category: "featured",
    vibeTags: ["sporty"],
    audienceTags: ["singles", "couples"],
    priceLabel: "$$",
  },
  {
    id: "e_018",
    title: "Date Night Cooking Class",
    venueId: "Taste Buds Kitchen",
    startISO: isoInHours(48),
    category: "featured",
    vibeTags: ["fun", "relaxed"],
    audienceTags: ["couples"],
    priceLabel: "$$",
  },
  {
    id: "e_019",
    title: "Parents Night Out (Kids Activities)",
    venueId: "YMCA",
    startISO: isoInHours(54),
    category: "featured",
    vibeTags: ["fun"],
    audienceTags: ["parents"],
    priceLabel: "$$",
  },
  {
    id: "e_020",
    title: "Outdoor Yoga Flow",
    venueId: "Berkley Riverfront Park",
    startISO: isoInHours(60),
    category: "featured",
    vibeTags: ["sporty", "relaxed"],
    audienceTags: ["singles", "couples", "parents"],
    priceLabel: "$",
  },

  // --- Standard (last 30) ---
  ...Array.from({ length: 30 }).map((_, i) => {
    const n = i + 21; // e_021..e_050
    const id = `e_${String(n).padStart(3, "0")}`;

    const audiencePool = ["singles", "couples", "parents"] as const;
    const vibePool = ["fun", "relaxed", "sporty"] as const;

    const audience = audiencePool[i % audiencePool.length];
    const vibe = vibePool[i % vibePool.length];

    const venueId =
      i % 6 === 0
        ? "City Market"
        : i % 6 === 1
        ? "Westport"
        : i % 6 === 2
        ? "Crossroads Arts District"
        : i % 6 === 3
        ? "Power & Light District"
        : i % 6 === 4
        ? "Union Station"
        : "The Plaza";

    const priceLabel =
      i % 5 === 0 ? "Free" : i % 5 === 1 ? "$" : i % 5 === 2 ? "$$" : "$$$";

    return {
      id,
      title:
        audience === "parents"
          ? `Standard: Parents Plan #${i + 1} (Family-Friendly)`
          : audience === "couples"
          ? `Standard: Couples Plan #${i + 1} (Date Idea)`
          : `Standard: Singles Plan #${i + 1} (Meetup Vibes)`,
      venueId,
      startISO: isoInHours(6 + i * 3),
      category: "standard",
      vibeTags: [vibe],
      audienceTags: [audience],
      priceLabel,
    } satisfies EventItem;
  }),
];
