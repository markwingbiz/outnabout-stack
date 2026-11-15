import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { premium } from "../ui/theme";
import { usePremiumFonts } from "../ui/premium";
import { Section, refStyles } from "../ui/reference";

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
  const fonts = usePremiumFonts();
  const insets = useSafeAreaInsets();

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
  // Premium restyle (owner, 2026-11-15: "give it the same premium
  // upgrades"): this screen was the last one on the old SpaceUI
  // language (gradient wash + glow blobs + Glass) and its root was a
  // plain View, so the content added by the personalization update
  // overflowed with no way to scroll. It now uses the same shell as
  // the approved tab screens — flat deep-plum screenGradient, a real
  // ScrollView, premium surfaces/hairlines, Poppins titles, Manrope
  // body, gold for selected states, and the brand gradient only on
  // the primary Continue action (the mockup's .cta accent rule).

  return (
    <View style={refStyles.root}>
      <LinearGradient
        colors={[...premium.screenGradient]}
        locations={[...premium.screenGradientLocations]}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          refStyles.scroll,
          { paddingTop: 16 + insets.top, paddingBottom: 26 + insets.bottom },
        ]}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0A0616" />

        <Text style={[refStyles.pageTitle, fonts.display]}>
          Pick a vibe. Pick a plan.
        </Text>

        {/* Audience Card */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, fonts.displayBold]}>
            For: {audienceLabel}
          </Text>
          <Text style={[styles.cardSub, fonts.bodySemiBold]}>
            Choose who this experience is for
          </Text>

          <View style={styles.audienceGrid}>
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
                    styles.audienceCell,
                    { opacity: pressed ? 0.94 : 1 },
                  ]}
                >
                  <View style={[styles.pill, active && styles.pillOn]}>
                    <Text
                      style={[
                        styles.pillText,
                        fonts.bodyExtraBold,
                        active && styles.pillTextOn,
                      ]}
                    >
                      {a.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Vibe Options */}
        <View style={styles.rows}>
          {activeVibeOptions.map((o) => {
            const active = vibe === o.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => setVibe(o.id)}
                style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
              >
                <View style={[styles.row, active && styles.rowOn]}>
                  <Text style={[styles.rowLabel, fonts.bodyExtraBold]}>
                    {o.label}
                  </Text>
                  <Text style={styles.rowIcon}>{o.icon}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Your view — content controls (owner model 2026-11-15).
            Same premium row language as the vibe rows above: a row
            per control, gold-highlighted while on. Enforced on
            Events. */}
        <Section title="Your view" subtitle="Control what shows up in Events" />
        <View style={styles.rowsTight}>
          {viewOptions.map((o) => {
            const on = viewPrefs[o.key];
            return (
              <Pressable
                key={o.key}
                onPress={() => setViewPrefs((p) => ({ ...p, [o.key]: !p[o.key] }))}
                style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
              >
                <View style={[styles.row, on && styles.rowOn]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.rowLabel, fonts.bodyExtraBold]}>
                      {o.label}
                    </Text>
                    <Text style={[styles.rowHint, fonts.bodySemiBold]}>
                      {o.hint}
                    </Text>
                  </View>
                  <Text style={styles.rowIcon}>{o.icon}</Text>
                  <Text
                    style={[
                      styles.toggleText,
                      fonts.bodyExtraBold,
                      on && styles.toggleTextOn,
                    ]}
                  >
                    {on ? "ON" : "OFF"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Bottom Actions — end of the scroll content, so they are
            always reachable now that the page scrolls. */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={[styles.btn, styles.btnGhost]}
          >
            <Text style={[styles.btnGhostText, fonts.bodyExtraBold]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onContinue}
            activeOpacity={0.88}
            style={styles.btn}
          >
            <LinearGradient
              colors={[...premium.brandGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
              <Text style={[styles.btnPrimaryText, fonts.bodyExtraBold]}>
                Continue
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: premium.radius,
    padding: 16,
    marginTop: 6,
  },
  cardTitle: { color: premium.ink, fontSize: 18, fontWeight: "700" },
  cardSub: { color: premium.muted, fontSize: 12.5, fontWeight: "600", marginTop: 5 },
  audienceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  audienceCell: { flexGrow: 1, flexBasis: "46%" },
  pill: {
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  pillOn: {
    backgroundColor: premium.goldSoft,
    borderColor: premium.goldBorder,
  },
  pillText: { color: premium.ink2, fontSize: 13, fontWeight: "800" },
  pillTextOn: { color: premium.ink },

  rows: { marginTop: 14, gap: 12 },
  rowsTight: { gap: 12 },
  row: {
    backgroundColor: premium.surface,
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowOn: {
    backgroundColor: premium.goldSoft,
    borderColor: premium.goldBorder,
  },
  rowLabel: { color: premium.ink, fontSize: 15.5, fontWeight: "800" },
  rowHint: { color: premium.muted, fontSize: 12, fontWeight: "600", marginTop: 3 },
  rowIcon: { color: premium.ink, fontSize: 18 },
  toggleText: {
    color: premium.muted,
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 12,
  },
  toggleTextOn: { color: premium.gold },

  actions: { flexDirection: "row", gap: 12, marginTop: 22 },
  btn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  btnGhost: {
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
    alignItems: "center",
    justifyContent: "center",
    height: 50,
  },
  btnGhostText: { color: premium.ink2, fontSize: 14, fontWeight: "800" },
  btnGradient: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  btnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
