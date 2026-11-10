import AsyncStorage from "@react-native-async-storage/async-storage";

export type PersonaProfile = {
  audience: "singles" | "couples" | "parents";
  vibe: "spicy" | "fun" | "relaxed" | "adventurous" | "sporty";
};

const KEY = "BOWND_PERSONA_V1";
const LEGACY_KEY = "OUTNABOUT_PERSONA_V1";

export const DEFAULT_PERSONA: PersonaProfile = {
  audience: "singles",
  vibe: "fun",
};

function normalizePersona(p: any): PersonaProfile {
  const audience: PersonaProfile["audience"] =
    p?.audience === "couples" || p?.audience === "parents" ? p.audience : "singles";

  let vibe: PersonaProfile["vibe"] = p?.vibe;

  // ✅ backward compat + guard rails
  const allowed: PersonaProfile["vibe"][] = ["spicy", "fun", "relaxed", "adventurous", "sporty"];
  if (!allowed.includes(vibe)) vibe = "fun";

  // ✅ if parents had "spicy" saved before, auto-switch to sporty
  if (audience === "parents" && vibe === "spicy") vibe = "sporty";

  return { audience, vibe };
}

export async function loadPersona(): Promise<PersonaProfile> {
  try {
    let raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      // One-time migration from the pre-rebrand key: carry the saved
      // persona over, then drop the legacy key.
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      if (legacy) {
        raw = legacy;
        await AsyncStorage.setItem(KEY, legacy);
        await AsyncStorage.removeItem(LEGACY_KEY);
      }
    }
    if (!raw) return DEFAULT_PERSONA;
    return normalizePersona(JSON.parse(raw));
  } catch {
    return DEFAULT_PERSONA;
  }
}

export async function savePersona(p: PersonaProfile) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(normalizePersona(p)));
  } catch {
    // silent fail in dev
  }
}
