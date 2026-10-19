// app/(tabs)/personal.tsx
// Reference visuals (App.tsx) + real backend wiring (lib/store.ts).
// - NO search input, NO top segmented tabs, NO TopTabs: the reference
//   Personal screen is "Personal" title + gear, hero, then the light panel.
// - Hero: App.tsx elements ONLY + a small Sign in / Sign out button
//   under next-tier. Tier lives in the Rewards card, gear covers persona.
// - Points are REAL (profile?.points ?? 0). QR tokens come from
//   generateQrToken() (server-verified) — never client-generated.
// - Adventures are REAL redemption history for signed-in users; guests
//   see a sign-in prompt, never demo adventures.
// - Unconfigured-backend messaging is PRESERVED exactly as the base
//   screen surfaced it: generateQrToken() throws a "Backend is not
//   configured..." error surfaced via the catch Alert, and redeemCode()
//   returns BACKEND_UNCONFIGURED mapped to "Backend is not configured
//   yet." No Firebase values appear anywhere in this file.
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

import { useAuth } from "../../lib/auth";
import {
  generateQrToken,
  getFavorites,
  getRedemptionHistory,
  redeemCode,
  tierFor,
  TIER_VIP_AT,
  type FavoriteItem,
  type RedemptionHistoryItem,
} from "../../lib/store";
import { BottomNav, refStyles } from "../ui/reference";
import { MemberCode } from "../../components/ui/MemberCode";
import { CardBackground } from "../../components/ui/CardBackground";
import { resolveCardImage, categoryForVenueName, resolveEventCardImage } from "../../lib/placeholders";

type PanelTab = "All" | "QR" | "Rewards";

export default function PersonalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut, refreshProfile } = useAuth();

  const [panel, setPanel] = useState<PanelTab>("All");

  // Rewards — real points from the signed-in profile (0 for guests).
  const points = profile?.points ?? 0;
  const progress = Math.min(1, points / TIER_VIP_AT);
  const tier = tierFor(points);

  // QR — verifiable token (generated on demand).
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [qrValue, setQrValue] = useState<string>("");
  const [qrBusy, setQrBusy] = useState(false);
  const [redeemInput, setRedeemInput] = useState<string>("");

  // Favorites + redemption history (real backend when signed in).
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [history, setHistory] = useState<RedemptionHistoryItem[]>([]);

  const loadBackend = useCallback(async () => {
    try {
      const [favs, hist] = await Promise.all([
        getFavorites(user?.uid ?? null),
        user ? getRedemptionHistory(user.uid) : Promise.resolve([]),
      ]);
      setFavorites(favs);
      setHistory(hist);
    } catch {
      // Keep previous data on error.
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      loadBackend();
    }, [loadBackend])
  );

  const favoriteVenues = useMemo(
    () => favorites.filter((f) => f.kind === "venue"),
    [favorites]
  );

  const favoriteEvents = useMemo(
    () => favorites.filter((f) => f.kind === "event"),
    [favorites]
  );

  // Adventures = REAL redemption history for signed-in users.
  // Guests see no adventures (never fake demo adventures).
  const recentAdventures = useMemo(
    () =>
      user
        ? history.map((h) => ({
            id: h.token,
            title: h.experienceId || "Redeemed offer",
            subtitle: `+${h.pointsAwarded} pts`,
            dateLabel: new Date(h.redeemedAt).toLocaleDateString(),
          }))
        : [],
    [user, history]
  );

  async function onGenerateQr() {
    if (!user) {
      Alert.alert("Sign in required", "Sign in to generate a verifiable QR token.", [
        { text: "Sign in", onPress: () => router.push("/(auth)/login") },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    if (qrBusy) return;
    setQrBusy(true);
    try {
      const { token, qrValue: value } = await generateQrToken("bownd-reward");
      setGeneratedCode(token);
      setQrValue(value);
    } catch (e: any) {
      // Preserved: when the backend is unconfigured, generateQrToken()
      // throws its "Backend is not configured..." message, surfaced here.
      Alert.alert("Could not generate code", e?.message ?? "Try again.");
    } finally {
      setQrBusy(false);
    }
  }

  async function onRedeem() {
    const val = redeemInput.trim();
    if (!val) return;
    try {
      const res = await redeemCode(val, user?.uid ?? null);
      if (res.ok) {
        Alert.alert(
          "Redeemed!",
          res.pointsAwarded > 0
            ? `+${res.pointsAwarded} points added to your account.`
            : "Code validated. Sign in to earn points on redemptions."
        );
        setRedeemInput("");
        await loadBackend();
        await refreshProfile();
      } else {
        const msg =
          res.reason === "ALREADY_REDEEMED"
            ? "This code was already redeemed."
            : res.reason === "EXPIRED"
              ? "This code has expired."
              : res.reason === "BACKEND_UNCONFIGURED"
                ? "Backend is not configured yet."
                : "Code not found. Check the code and try again.";
        Alert.alert("Could not redeem", msg);
      }
    } catch {
      Alert.alert("Could not redeem", "Something went wrong. Try again.");
    }
  }

  function onOpenScanner() {
    router.push("/scan");
  }

  function go(route: string) {
    router.replace(route);
  }

  const showQr = panel === "All" || panel === "QR";
  const showRewards = panel === "All" || panel === "Rewards";
  // Favorite venues live under "All" only. The old "Venue" panel tab is
  // now the "What's Close" button — it opens the map page instead of
  // switching the panel.

  return (
    <View style={refStyles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 70 + insets.bottom + 16 }}
        >
          <StatusBar barStyle="light-content" backgroundColor="#1d1642" />
          {/* Hero — App.tsx elements + sign in/out under next-tier */}
          <LinearGradient
            colors={["#1d1642", "#6a45b8", "#cc8d9f", "#18112c"]}
            locations={[0, 0.32, 0.72, 1]}
            style={refStyles.personalHero}
          >
            <View style={refStyles.personalHead}>
              <Text style={refStyles.personalTitle}>Personal</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/persona")} hitSlop={8}>
                <Ionicons name="settings-outline" color="white" size={22} />
              </TouchableOpacity>
            </View>
            <Text style={refStyles.personalSub}>Rewards · Favorites · Adventures</Text>
            <View style={refStyles.avatarRing}>
              <View style={refStyles.avatar}>
                <Ionicons name="person" size={68} color="#eeeaf3" />
              </View>
            </View>
            <Text style={refStyles.points}>{points} pts</Text>
            <Text style={refStyles.nextTier}>Next tier at {TIER_VIP_AT}</Text>
            {user ? (
              <TouchableOpacity onPress={() => signOut()} style={styles.authBtn}>
                <Text style={styles.authBtnText}>Sign out</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => router.push("/(auth)/login")} style={styles.authBtn}>
                <Text style={styles.authBtnText}>Sign in</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>

          {/* Light panel */}
          <View style={refStyles.lightPanel}>
            <View style={refStyles.panelTabs}>
              {(["All", "QR", "Rewards"] as PanelTab[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPanel(p)}
                  style={[refStyles.panelTab, panel === p && refStyles.panelTabSelected]}
                >
                  <Text style={[refStyles.panelTabText, panel === p && { color: "white" }]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => router.push("/whats-close")}
                style={refStyles.panelTab}
              >
                <Text style={refStyles.panelTabText}>What&apos;s Close</Text>
              </TouchableOpacity>
            </View>

            {/* QR section */}
            {showQr && (
              <>
                <TouchableOpacity onPress={() => setPanel("QR")} style={refStyles.qrHeader}>
                  <Text style={refStyles.darkHeading}>QR Codes</Text>
                  <Ionicons name="chevron-forward" color="#615e69" size={22} />
                </TouchableOpacity>
                <View style={refStyles.tokenCard}>
                  <View style={refStyles.tokenRow}>
                    <Text style={refStyles.tokenTitle}>Your QR Token</Text>
                    <TouchableOpacity onPress={onGenerateQr} style={refStyles.newButton}>
                      <Ionicons name="refresh" color="white" size={18} />
                      <Text style={{ color: "white", fontWeight: "700" }}>New</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={refStyles.tokenBox}>
                    <Text numberOfLines={1} style={refStyles.tokenText}>
                      {generatedCode || "—"}
                    </Text>
                  </View>
                  <View style={refStyles.qrBox}>
                    {qrValue ? (
                      <QRCode value={qrValue} size={160} color="#393743" backgroundColor="#e9e6ef" />
                    ) : (
                      <>
                        <Ionicons name="qr-code-outline" size={80} color="rgba(0,0,0,0.55)" />
                        <Text style={styles.qrPlaceholderText}>
                          {user ? "Tap New to generate your code" : "Sign in to generate a code"}
                        </Text>
                      </>
                    )}
                  </View>
                  <Text style={refStyles.redeemHeading}>Redeem a Code</Text>
                  <View style={refStyles.redeemRow}>
                    <TextInput
                      value={redeemInput}
                      onChangeText={setRedeemInput}
                      placeholder="Paste or type code"
                      placeholderTextColor="#88848f"
                      style={refStyles.redeemInput}
                      autoCapitalize="characters"
                    />
                    <TouchableOpacity onPress={onRedeem} style={refStyles.redeemButton}>
                      <Text style={{ color: "white", fontWeight: "700" }}>Redeem</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={onOpenScanner} style={styles.scanBtn}>
                    <Ionicons name="scan-outline" size={18} color="#fff" />
                    <Text style={styles.scanBtnText}>Open Camera Scanner</Text>
                  </TouchableOpacity>

                  {/* Member Card — the signed-in member's real QR + barcode. */}
                  <Text style={styles.memberHeading}>Member Card</Text>
                  <MemberCode uid={user?.uid ?? null} />
                </View>
              </>
            )}

            {/* Rewards section */}
            {showRewards && (
              <>
                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>Rewards</Text>
                <View style={refStyles.tokenCard}>
                  <View style={styles.rewardsTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rewardsPoints}>{points} points</Text>
                      <Text style={styles.rewardsHint}>
                        Earn points by redeeming offers + going on adventures.
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setPanel("QR")} style={styles.showQrBtn}>
                      <Text style={styles.showQrBtnText}>Show QR</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  </View>
                  <View style={styles.rewardsMetaRow}>
                    <Text style={styles.metaText}>Current: {tier}</Text>
                    <Text style={styles.metaText}>Next: {tier === "VIP" ? "Max" : "VIP"}</Text>
                  </View>
                </View>
              </>
            )}

            {/* Favorite venues — under the All panel */}
            {panel === "All" && (
              <>
                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>Favorite Venues</Text>
                {favoriteVenues.length === 0 ? (
                  <Text style={refStyles.panelNote}>No favorite venues yet.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {favoriteVenues.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() =>
                          router.push({
                            pathname: "/(tabs)/events",
                            params: { venueId: item.id, venue: item.title },
                          })
                        }
                        style={[styles.tile, { padding: 0 }]}
                      >
                        <CardBackground
                          source={resolveCardImage(undefined, categoryForVenueName(item.title))}
                          style={styles.tileBg}
                          contentStyle={styles.tileContent}
                        >
                          <Text style={styles.tileBadge}>{item.badge ?? "Favorite"}</Text>
                          <Text style={styles.tileTitle} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={styles.tileSub} numberOfLines={1}>
                            {item.subtitle || "Kansas City"}
                          </Text>
                          <Text style={styles.tileMeta}>Tap to view</Text>
                        </CardBackground>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {/* All tab also shows: Favorite Events + Recent Adventures */}
            {panel === "All" && (
              <>
                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>Favorite Events</Text>
                {favoriteEvents.length === 0 ? (
                  <Text style={refStyles.panelNote}>No favorite events yet.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {favoriteEvents.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() =>
                          router.push({ pathname: "/detail", params: { id: item.id, kind: "event" } })
                        }
                        style={[styles.tile, { padding: 0 }]}
                      >
                        <CardBackground
                          source={resolveEventCardImage(undefined)}
                          style={styles.tileBg}
                          contentStyle={styles.tileContent}
                        >
                          <Text style={styles.tileBadge}>{item.badge ?? "Saved"}</Text>
                          <Text style={styles.tileTitle} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={styles.tileSub} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                          {!!item.when && (
                            <Text style={styles.tileWhen} numberOfLines={1}>
                              {item.when}
                            </Text>
                          )}
                        </CardBackground>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>Recent Adventures</Text>
                {!user && (
                  <Text style={refStyles.panelNote}>Sign in to see your adventures.</Text>
                )}
                {user && recentAdventures.length === 0 && (
                  <Text style={refStyles.panelNote}>
                    No adventures yet — redeem an offer to start earning.
                  </Text>
                )}
                {recentAdventures.map((a) => (
                  <View key={a.id} style={styles.rowCard}>
                    <View style={styles.rowIcon}>
                      <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {a.title}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {a.subtitle}
                      </Text>
                      <Text style={styles.rowMeta}>{a.dateLabel}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
      <View style={{ backgroundColor: "#161120", paddingBottom: insets.bottom }}>
        <BottomNav active="Personal" onNavigate={go} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  authBtn: {
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  authBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  memberHeading: { fontSize: 18, fontWeight: "700", color: "#231e29", marginTop: 18, marginBottom: 10 },
  qrPlaceholderText: { fontSize: 12, color: "#514a5a", fontWeight: "700", marginTop: 8 },
  scanBtn: {
    marginTop: 12,
    height: 45,
    borderRadius: 13,
    backgroundColor: "#3654b5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  scanBtnText: { color: "#fff", fontWeight: "700" },
  sectionHeading: { paddingVertical: 14 },
  rewardsTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  rewardsPoints: { fontSize: 18, fontWeight: "900", color: "#221c2a" },
  rewardsHint: { marginTop: 6, fontSize: 12, color: "#514a5a", lineHeight: 16 },
  showQrBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#3654b5",
  },
  showQrBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  progressTrack: {
    marginTop: 12,
    height: 10,
    borderRadius: 10,
    backgroundColor: "#e4e0ed",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 10, backgroundColor: "#6242bb" },
  rewardsMetaRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between" },
  metaText: { fontSize: 12, color: "#514a5a", fontWeight: "800" },
  tile: {
    width: 200,
    height: 150,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d5d0df",
    marginRight: 12,
  },
  tileBg: { flex: 1, borderRadius: 18 },
  tileContent: { flex: 1, padding: 14, justifyContent: "flex-end" },
  tileBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 11,
    marginBottom: 10,
  },
  tileTitle: { color: "#ffffff", fontSize: 16, fontWeight: "900", lineHeight: 20 },
  tileSub: { color: "rgba(255,255,255,0.85)", marginTop: 6, fontSize: 12, fontWeight: "800" },
  tileWhen: { marginTop: 8, color: "#ffffff", fontSize: 12, fontWeight: "900" },
  tileMeta: { marginTop: 8, color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "800" },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d5d0df",
    marginBottom: 10,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6242bb",
  },
  rowTitle: { fontSize: 14, fontWeight: "900", color: "#221c2a" },
  rowSub: { marginTop: 3, fontSize: 12, color: "#514a5a", fontWeight: "800" },
  rowMeta: { marginTop: 6, fontSize: 11, color: "#88848f", fontWeight: "900" },
});
