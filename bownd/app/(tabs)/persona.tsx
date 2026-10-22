import React, { useMemo, useState, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";

import {
  SpaceBackground,
  Glass,
  GhostButton,
  PrimaryButton,
  uiStyles,
  THEME,
} from "../../components/ui/SpaceUI";

import { savePersona, DEFAULT_PERSONA } from "../../lib/personaStore";
import { useAuth } from "../../lib/auth";
import { syncPersona } from "../../lib/store";

type Audience = "singles" | "couples" | "parents";
type Vibe = "fun" | "relaxed" | "adventurous" | "spicy" | "sporty";

export default function Persona() {
  const router = useRouter();
  const { user } = useAuth();

  /* ---------------- AUDIENCE OPTIONS ---------------- */

  const audienceOptions = useMemo(
    () => [
      { id: "singles" as const, label: "Singles" },
      { id: "couples" as const, label: "Couples" },
      { id: "parents" as const, label: "Parents" },
    ],
    []
  );

  /* ---------------- VIBE OPTIONS ---------------- */

  const vibeOptionsDefault = useMemo(
    () => [
      { id: "fun" as const, label: "Fun", icon: "✨" },
      { id: "relaxed" as const, label: "Relaxed", icon: "🍃" },
      { id: "adventurous" as const, label: "Adventurous", icon: "➤" },
      { id: "spicy" as const, label: "Spicy", icon: "🔥" },
    ],
    []
  );

  const vibeOptionsParents = useMemo(
    () => [
      { id: "fun" as const, label: "Fun", icon: "✨" },
      { id: "relaxed" as const, label: "Relaxed", icon: "🍃" },
      { id: "adventurous" as const, label: "Adventurous", icon: "➤" },
      { id: "sporty" as const, label: "Sporty", icon: "🏀" },
    ],
    []
  );

  /* ---------------- STATE ---------------- */

  const [audience, setAudience] = useState<Audience>("singles");
  const [vibe, setVibe] = useState<Vibe>("fun");

  /* ---------------- AUTO-FIX INVALID COMBOS ---------------- */

  useEffect(() => {
    if (audience === "parents" && vibe === "spicy") {
      setVibe("sporty");
    }
  }, [audience, vibe]);

  const activeVibeOptions =
    audience === "parents" ? vibeOptionsParents : vibeOptionsDefault;

  const audienceLabel =
    audience === "singles"
      ? "Singles"
      : audience === "couples"
      ? "Couples"
      : "Parents";

  /* ---------------- SAVE ---------------- */

  async function onContinue() {
    const personaPayload: any = {
      ...(DEFAULT_PERSONA || {}),
      audience,
      vibe,
      audienceTags: [audience],
      vibeTags: [vibe],
    };

    try {
      await savePersona(personaPayload);
    } catch {}

    // Mirror to the signed-in user's Firestore profile (local copy stays).
    if (user) {
      try {
        await syncPersona(user.uid, {
          audience: personaPayload.audience,
          vibe: personaPayload.vibe,
        });
      } catch {}
    }

    // Phase 6: canonical route. The root /events duplicate is deleted.
    if (router.canGoBack()) router.back();
    else router.push("/(tabs)/events");
  }

  /* ---------------- UI ---------------- */

  return (
    <SpaceBackground>
      <View style={{ marginBottom: 10 }}>
        <Text style={uiStyles.brand}>Bownd</Text>
        <Text style={uiStyles.h1}>Pick a vibe. Pick a plan.</Text>
      </View>

      {/* Audience Card */}
      <Glass
        style={{
          padding: 16,
          borderRadius: 20,
          borderColor: THEME.stroke,
          backgroundColor: "rgba(181,109,255,0.16)",
        }}
      >
        <Text style={{ color: THEME.text, fontSize: 18, fontWeight: "800" }}>
          For: {audienceLabel}
        </Text>
        <Text style={{ color: THEME.textDim, marginTop: 6 }}>
          Choose who this experience is for
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          {audienceOptions.map((a) => {
            const active = audience === a.id;
            return (
              <Pressable
                key={a.id}
                onPress={() => setAudience(a.id)}
                style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1, flex: 1 }]}
              >
                <Glass
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderColor: active ? THEME.stroke : THEME.strokeDim,
                    backgroundColor: active
                      ? "rgba(181,109,255,0.22)"
                      : "rgba(255,255,255,0.08)",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: active ? THEME.text : THEME.textDim,
                      fontSize: 13,
                      fontWeight: "900",
                    }}
                  >
                    {a.label}
                  </Text>
                </Glass>
              </Pressable>
            );
          })}
        </View>
      </Glass>

      {/* Vibe Options */}
      <View style={{ marginTop: 14, gap: 12 }}>
        {activeVibeOptions.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => setVibe(o.id)}
            style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
          >
            <Glass
              style={{
                paddingVertical: 16,
                paddingHorizontal: 18,
                borderRadius: 18,
                borderColor: vibe === o.id ? THEME.stroke : THEME.strokeDim,
                backgroundColor:
                  vibe === o.id
                    ? "rgba(181,109,255,0.18)"
                    : "rgba(255,255,255,0.10)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: THEME.text, fontSize: 16, fontWeight: "700" }}>
                {o.label}
              </Text>
              <Text style={{ color: THEME.text, fontSize: 18 }}>{o.icon}</Text>
            </Glass>
          </Pressable>
        ))}
      </View>

      {/* Bottom Actions */}
      <View style={uiStyles.bottomRow}>
        <GhostButton label="Cancel" onPress={() => router.back()} />
        <PrimaryButton label="Continue" onPress={onContinue} />
      </View>
    </SpaceBackground>
  );
}
