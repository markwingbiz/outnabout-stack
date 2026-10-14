export type PersonaProfile = {
  audience: "singles" | "couples" | "parents";
  vibe: "spicy" | "fun" | "relaxed" | "adventurous";
};

export const DEFAULT_PERSONA: PersonaProfile = {
  audience: "singles",
  vibe: "fun",
};
