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
import {
  loadViewPrefs,
  saveViewPrefs,
  DEFAULT_VIEW_PREFS,
  type ViewPrefs,
} from "../../lib/viewPrefs";
import { useAuth } from "../../lib/auth";
import { syncPersona } from "../../lib/store";

type Audience = "all" | "singles" | "couples" | "parents";
type Vibe = "fun" | "relaxed" | "adventurous" | "spicy" | "sporty";

export default function Persona() {
  const router = useRouter();
  const { user } = useAuth();

  /* ---------------- AUDIENCE OPTIONS ---------------- */

  const audienceOptions = useMemo(
    () => [
      // All Persona first (owner model 2026-11-15): the All that
      // means no narrowing — and the starting default for everyone.
      { id: "all" as const, label: "All Persona" },
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

  const [audience, setAudience] = useState<Audience>("all");
  const [vibe, setVibe] = useState<Vibe>("fun");

  /* ---------------- VIEW CONTROLS ---------------- */
  // Owner model 2026-11-15: "users can control their view" — hide
  // drug-related / sports-related / spicy, or family-friendly-only.
  // Edited here (the settings surface reached from Personal) and
  // enforced on the Events page. Loaded on mount, saved with the
  // persona on Continue — this screen's existing save contract.
  const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(DEFAULT_VIEW_PREFS);

  useEffect(() => {
    let alive = true;
    loadViewPrefs()
      .then((p) => {
        if (alive) setViewPrefs(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const viewOptions: Array<{
    key: keyof ViewPrefs;
    label: string;
    hint: string;
    icon: string;
  }> = [
    { key: "hideDrugs", label: "Hide drug-related", hint: "No 420 / cannabis listings", icon: "🚫" },
    { key: "hideSports", label: "Hide sports-related", hint: "No games, watch parties, or sporty nights", icon: "🏟️" },
    { key: "hideSpicy", label: "Hide spicy", hint: "No spicy-vibe listings", icon: "🌶️" },
    { key: "familyOnly", label: "Family-friendly only", hint: "Only family-friendly listings show", icon: "👨‍👩‍👧" },
  ];

  /* ---------------- AUTO-FIX INVALID COMBOS ---------------- */

  useEffect(() => {
    if (audience === "parents" && vibe === "spicy") {
      setVibe("sporty");
    }
  }, [audience, vibe]);

  const activeVibeOptions =
    audience === "parents" ? vibeOptionsParents : vibeOptionsDefault;

  const audienceLabel =
    audience === "all"
      ? "All Persona"
      : audience === "singles"
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

    // View controls save alongside the persona (same Continue).
    try {
      await saveViewPrefs(viewPrefs);
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

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {audienceOptions.map((a) => {
            const active = audience === a.id;
            return (
              <Pressable
                key={a.id}
                onPress={() => setAudience(a.id)}
                // Four options now (All Persona joined the three):
                // a 2×2 wrap keeps every label on one line at the
                // row's 13px — four-across squeezed "All Persona"
                // into a two-line pill.
                style={({ pressed }) => [
                  { opacity: pressed ? 0.94 : 1, flexGrow: 1, flexBasis: "46%" },
                ]}
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

      {/* Your view — content controls (owner model 2026-11-15).
          Same Glass language as the vibe rows above: a row per
          control, highlighted while on. Enforced on Events. */}
      <View style={{ marginTop: 22 }}>
        <Text style={{ color: THEME.text, fontSize: 18, fontWeight: "800" }}>
          Your view
        </Text>
        <Text style={{ color: THEME.textDim, marginTop: 6 }}>
          Control what shows up in Events
        </Text>
      </View>
      <View style={{ marginTop: 12, gap: 12 }}>
        {viewOptions.map((o) => {
          const on = viewPrefs[o.key];
          return (
            <Pressable
              key={o.key}
              onPress={() => setViewPrefs((p) => ({ ...p, [o.key]: !p[o.key] }))}
              style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
            >
              <Glass
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 18,
                  borderRadius: 18,
                  borderColor: on ? THEME.stroke : THEME.strokeDim,
                  backgroundColor: on
                    ? "rgba(181,109,255,0.18)"
                    : "rgba(255,255,255,0.10)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: THEME.text, fontSize: 16, fontWeight: "700" }}>
                    {o.label}
                  </Text>
                  <Text style={{ color: THEME.textDim, fontSize: 12, marginTop: 3 }}>
                    {o.hint}
                  </Text>
                </View>
                <Text style={{ color: THEME.text, fontSize: 18 }}>{o.icon}</Text>
                <Text
                  style={{
                    color: on ? THEME.text : THEME.textDim,
                    fontSize: 13,
                    fontWeight: "900",
                    marginLeft: 12,
                  }}
                >
                  {on ? "ON" : "OFF"}
                </Text>
              </Glass>
            </Pressable>
          );
        })}
      </View>

      {/* Bottom Actions */}
      <View style={uiStyles.bottomRow}>
        <GhostButton label="Cancel" onPress={() => router.back()} />
        <PrimaryButton label="Continue" onPress={onContinue} />
      </View>
    </SpaceBackground>
  );
}
