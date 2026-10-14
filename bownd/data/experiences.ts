export type Persona = "Singles" | "Couples" | "Parents";
export type Vibe = "Spicy" | "Fun" | "Relaxed" | "Adventurous" | "Sporty";

export type Experience = {
  id: string;
  title: string;
  personas: Persona[];
  vibes: Vibe[];
  neighborhood: string;
  price: "$" | "$$" | "$$$";
  duration: string;
  description: string;
  website?: string;
  mapsQuery?: string;
};

export const EXPERIENCES: Experience[] = [
  {
    id: "1",
    title: "Green Lady Lounge – Live Jazz",
    personas: ["Couples"],
    vibes: ["Relaxed"],
    neighborhood: "Crossroads",
    price: "$$",
    duration: "Evening",
    description: "Candlelit jazz lounge vibe—classic KC date-night energy.",
    website: "https://greenladylounge.com",
    mapsQuery: "Green Lady Lounge Kansas City",
  },
  {
    id: "2",
    title: "Pinot’s Palette – Paint & Sip",
    personas: ["Couples", "Singles"],
    vibes: ["Fun", "Spicy"],
    neighborhood: "Plaza",
    price: "$$",
    duration: "2 hours",
    description: "Guided paint-and-sip with a playful Valentine’s vibe.",
    website: "https://www.pinotspalette.com",
    mapsQuery: "Pinot's Palette Country Club Plaza",
  },
  {
    id: "3",
    title: "Boulevard Brewing – Tour & Tasting",
    personas: ["Couples", "Singles"],
    vibes: ["Fun", "Relaxed"],
    neighborhood: "West Bottoms",
    price: "$$",
    duration: "1.5 hours",
    description: "A social, very KC brewery tour with tastings.",
    website: "https://www.boulevard.com",
    mapsQuery: "Boulevard Brewing Company Kansas City",
  },
  {
    id: "4",
    title: "Up-Down Arcade Bar – Party Night",
    personas: ["Singles", "Couples"],
    vibes: ["Fun", "Adventurous", "Spicy"],
    neighborhood: "Crossroads",
    price: "$",
    duration: "Evening",
    description: "Games + drinks + music. Great for groups or a bold date.",
    website: "https://www.updownarcadebar.com",
    mapsQuery: "Up-Down Arcade Bar Kansas City",
  },
  {
    id: "5",
    title: "KC Current + River Market Walk",
    personas: ["Parents", "Couples"],
    vibes: ["Sporty", "Relaxed"],
    neighborhood: "Downtown",
    price: "$",
    duration: "2–3 hours",
    description: "Sporty + family-friendly energy with food nearby after.",
    mapsQuery: "River Market Kansas City",
  },
];
