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
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { clearAllTokens } from "../../lib/qrTokens";
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
import { InfoRow, usePremiumFonts } from "../ui/premium";
import { premium } from "../ui/theme";
import {
  loadPersona,
  DEFAULT_PERSONA,
  type PersonaProfile,
} from "../../lib/personaStore";
import NotificationSettings from "../../components/push/NotificationSettings";
import { MemberCode } from "../../components/ui/MemberCode";
import { CardBackground } from "../../components/ui/CardBackground";
import { resolveCardImage, categoryForVenueName, resolveEventCardImage } from "../../lib/placeholders";

type PanelTab = "All" | "QR" | "Rewards";

export default function PersonalScreen() {
  const router = useRouter();
  const fonts = usePremiumFonts();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut, refreshProfile } = useAuth();

  const [panel, setPanel] = useState<PanelTab>("All");

  // Rewards — real points from the signed-in profile (0 for guests).
  const points = profile?.points ?? 0;
  const progress = Math.min(1, points / TIER_VIP_AT);
  const tier = tierFor(points);

  // Persona lives in this hub (premium pass): shown as a summary card
  // with an edit link to the persona screen; it still drives the
  // Events tab's Tailored For You rail.
  const [persona, setPersona] = useState<PersonaProfile>(DEFAULT_PERSONA);

  // QR — verifiable token (generated on demand).
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [qrValue, setQrValue] = useState<string>("");
  const [qrBusy, setQrBusy] = useState(false);
  const [redeemInput, setRedeemInput] = useState<string>("");

  // Favorites + redemption history (real backend when signed in).
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [history, setHistory] = useState<RedemptionHistoryItem[]>([]);

  // Account deletion (in-app flow, required by both app stores).
  const [deleteBoxOpen, setDeleteBoxOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function executeDeleteAccount() {
    if (!user || deleteBusy) return;
    if (!user.email) {
      Alert.alert(
        "Could not delete account",
        "This account has no email address on file. Please use the deletion request page on our website instead."
      );
      return;
    }
    if (!db) {
      Alert.alert(
        "Could not delete account",
        "Backend is not configured yet, so deletion can't be recorded. Please try again later."
      );
      return;
    }
    setDeleteBusy(true);
    try {
      // 1. Re-authenticate — Firebase requires a recent login before
      //    the auth user can be deleted.
      const credential = EmailAuthProvider.credential(
        user.email,
        deletePassword
      );
      try {
        await reauthenticateWithCredential(user, credential);
      } catch {
        Alert.alert(
          "Password didn't match",
          "That password doesn't match your account, so nothing was deleted. Check it and try again."
        );
        return;
      }

      // 2. Record the deletion request for the backend workflow, which
      //    deletes/anonymizes the remaining account data (profile,
      //    favorites, points, redemption history) within 30 days.
      await setDoc(doc(db, "deletion_requests", user.uid), {
        uid: user.uid,
        email: user.email,
        status: "requested",
        source: "in_app",
        requested_at: serverTimestamp(),
        requested_at_iso: new Date().toISOString(),
      });

      // 3. Invalidate this device's QR tokens right away.
      try {
        await clearAllTokens();
      } catch {
        // Local token clearing is best-effort; the backend workflow
        // invalidates the account's tokens server-side as well.
      }

      // 4. Delete the Firebase Auth user.
      try {
        await deleteUser(user);
      } catch (e: any) {
        if (e?.code === "auth/requires-recent-login") {
          Alert.alert(
            "Please sign in again",
            "For your security, sign in again and retry deletion. Your deletion request has been recorded, so we will also follow up from our side."
          );
        } else {
          Alert.alert(
            "Deletion did not complete",
            "Your deletion request has been recorded, but your sign-in could not be removed just now. Please try again, or we will complete it from your request."
          );
        }
        return;
      }

      // 5. Clear local auth state and land signed out.
      setDeletePassword("");
      setDeleteBoxOpen(false);
      try {
        await signOut();
      } catch {
        // Auth user is already deleted; context state clears on the
        // next auth-state change either way.
      }
      Alert.alert(
        "Account deleted",
        "Your Bownd account has been deleted. Your profile, favorites, and points are removed and your redemption history is anonymized."
      );
      router.replace("/(tabs)");
    } catch {
      Alert.alert(
        "Deletion did not complete",
        "Something went wrong before anything was deleted. Please try again."
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  function onConfirmDeleteAccount() {
    if (!deletePassword) {
      Alert.alert(
        "Password required",
        "Enter your password to confirm this is really you."
      );
      return;
    }
    Alert.alert(
      "Delete your account?",
      "This cannot be undone. Your sign-in, profile, favorites, and points will be deleted, and your redemption history will be anonymized.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, delete my account",
          style: "destructive",
          onPress: () => {
            void executeDeleteAccount();
          },
        },
      ]
    );
  }

  const loadBackend = useCallback(async () => {
    try {
      const [favs, hist, pers] = await Promise.all([
        getFavorites(user?.uid ?? null),
        user ? getRedemptionHistory(user.uid) : Promise.resolve([]),
        loadPersona(),
      ]);
      setFavorites(favs);
      setHistory(hist);
      setPersona(pers);
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

  // Points-account framing (Mark's free-tier rule): a points account
  // is created on paid-tier activation, so until a signed-in profile
  // shows real points activity (a balance or redemption history),
  // points are framed as a MEMBER BENEFIT — never displayed as a fake
  // $0 balance. Guests get the same framing.
  const hasPointsAccount = !!user && (points > 0 || history.length > 0);

  const showQr = panel === "All" || panel === "QR";
  const showRewards = panel === "All" || panel === "Rewards";
  // Favorite venues live under "All" only. The old "Venue" panel tab is
  // now the "What's Close" button — it opens the map page instead of
  // switching the panel.

  return (
    <View style={refStyles.root}>
      <LinearGradient
        colors={[...premium.screenGradient]}
        locations={[...premium.screenGradientLocations]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 70 + insets.bottom + 16 }}
        >
          <StatusBar barStyle="light-content" backgroundColor="#0A0616" />
          {/* Hero — premium pass: the old sunset band is now the deep
              plum family (no magenta/orange stops), over the shared
              screen gradient; the panel below is dark throughout. */}
          <LinearGradient
            colors={["#2A1650", "#1B1035", "#0F0A1F"]}
            locations={[0, 0.52, 1]}
            style={refStyles.personalHero}
          >
            <View style={refStyles.personalHead}>
              <Text style={[refStyles.personalTitle, fonts.display]}>Rewards</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/persona")} hitSlop={8}>
                <Ionicons name="settings-outline" color="white" size={22} />
              </TouchableOpacity>
            </View>
            <Text style={refStyles.personalSub}>Points · Favorites · Adventures</Text>
            <View style={refStyles.avatarRing}>
              <View style={refStyles.avatar}>
                <Ionicons name="person" size={40} color="#eeeaf3" />
              </View>
            </View>
            {hasPointsAccount ? (
              <>
                <Text style={[refStyles.points, fonts.display]}>{points} pts</Text>
                <Text style={refStyles.nextTier}>Next tier at {TIER_VIP_AT}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.heroBenefit, fonts.display]}>Points are a member benefit</Text>
                <Text style={refStyles.nextTier}>Free accounts buy · Members earn</Text>
              </>
            )}
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
                  <Ionicons name="chevron-forward" color={premium.muted} size={22} />
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
                      placeholderTextColor="#968FB2"
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

            {/* Rewards section — premium pass: real balance card for
                points accounts; member-benefit framing otherwise.
                Plus earn rates, the member rules in plain sight, and
                partner perks (one hub: Rewards + Personal + persona). */}
            {showRewards && (
              <>
                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>Rewards</Text>
                {hasPointsAccount ? (
                  <LinearGradient
                    colors={[...premium.rewardsGradient]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.balanceCard}
                  >
                    <View style={styles.rewardsTopRow}>
                      <Text style={styles.balanceLabel}>Bownd Points</Text>
                      <TouchableOpacity onPress={() => setPanel("QR")} style={styles.showQrBtn}>
                        <Text style={styles.showQrBtnText}>Show QR</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.balanceValue, fonts.display]}>
                      {points.toLocaleString()} <Text style={styles.balanceUnit}>pts</Text>
                    </Text>
                    <Text style={styles.balanceSub}>
                      = ${(points / 100).toFixed(2)} in checkout credit · 100 pts = $1.00
                    </Text>
                    <View style={styles.balanceTrack}>
                      <View
                        style={[
                          styles.balanceFillClip,
                          { width: `${Math.max(3, progress * 100)}%` },
                        ]}
                      >
                        <LinearGradient
                          colors={[...premium.brandGradient]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.balanceFill}
                        />
                      </View>
                    </View>
                    <View style={styles.rewardsMetaRow}>
                      <Text style={styles.balanceMeta}>Current: {tier}</Text>
                      <Text style={styles.balanceMeta}>
                        {tier === "VIP"
                          ? "Top tier"
                          : `${TIER_VIP_AT - points} pts to VIP at ${TIER_VIP_AT}`}
                      </Text>
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={refStyles.tokenCard}>
                    <Text style={styles.rewardsPoints}>Bownd Points — a member benefit</Text>
                    <Text style={styles.rewardsHint}>
                      Free accounts can buy tickets and bundles like everyone else. Points,
                      member-only special events and partner perks start with a paid plan —
                      your points account opens the moment you upgrade, and points are never
                      sold or shown as a $0 balance before then.
                    </Text>
                  </View>
                )}

                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>How you earn</Text>
                <InfoRow
                  glyph="1"
                  title="1 pt per $1 on tickets"
                  body="Counted when the payment verifies server-side — never on a tap alone."
                />
                <InfoRow
                  glyph="50"
                  title="Venue check-in · 50 pts"
                  body="Scan in at a partner venue, once per visit."
                />
                <InfoRow
                  glyph="25"
                  title="Show up · 25 pts"
                  body="Attendance confirmed at the door scan."
                />

                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>
                  Member rules, in plain sight
                </Text>
                <InfoRow
                  icon="heart"
                  title="Points never expire while you're paid"
                  body="Downgrade to Free and the balance freezes — unspendable, never forfeited — with 12 months to re-upgrade before it expires. Points only ever go down by spending them."
                />
                <InfoRow
                  icon="information-circle"
                  title="Free accounts buy, members earn"
                  body="Anyone can purchase tickets and bundles. Points, member-only events and partner perks are paid-tier benefits."
                />

                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>Partner perks</Text>
                <InfoRow
                  icon="gift"
                  title="A standing free perk at every partner"
                  body="Each partner venue defines a free perk for paid members at onboarding. Claim one free perk per partner, per calendar quarter, on a verified member scan at the door."
                />
              </>
            )}

            {/* Notifications — push category toggles (plan §1.6) */}
            {panel === "All" && (
              <>
                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>Notifications</Text>
                <NotificationSettings />
              </>
            )}

            {/* Persona — lives in this hub (premium pass). The summary
                is real (lib/personaStore); editing happens on the
                persona screen, same as the gear icon. Persona still
                drives Tailored For You in Events. */}
            {panel === "All" && (
              <>
                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>Your Persona</Text>
                <View style={refStyles.tokenCard}>
                  <View style={styles.rewardsTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rewardsPoints}>
                        {persona.audience.charAt(0).toUpperCase() + persona.audience.slice(1)} ·{" "}
                        {persona.vibe.charAt(0).toUpperCase() + persona.vibe.slice(1)}
                      </Text>
                      <Text style={styles.rewardsHint}>
                        Your persona shapes your Events list.
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push("/(tabs)/persona")}
                      style={styles.showQrBtn}
                    >
                      <Text style={styles.showQrBtnText}>Edit</Text>
                    </TouchableOpacity>
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
                            pathname: "/detail",
                            params: { id: item.id, kind: "venue" },
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
                          source={resolveEventCardImage(undefined, item.title, item.subtitle)}
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
                      <Ionicons name="sparkles" size={18} color={premium.gold} />
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

            {/* Account — deletion entry point (stores require in-app deletion) */}
            {user && (
              <>
                <Text style={[refStyles.darkHeading, styles.sectionHeading]}>Account</Text>
                <View style={refStyles.tokenCard}>
                  <Text style={styles.accountEmail}>{user.email ?? "Signed in"}</Text>
                  {!deleteBoxOpen ? (
                    <TouchableOpacity
                      onPress={() => setDeleteBoxOpen(true)}
                      style={styles.deleteOpenBtn}
                    >
                      <Text style={styles.deleteOpenBtnText}>Delete account</Text>
                    </TouchableOpacity>
                  ) : (
                    <View>
                      <Text style={styles.deleteExplain}>
                        Deleting your account permanently deletes your sign-in, profile,
                        favorites, and points. Your redemption history is anonymized —
                        your name, email, and QR tokens are removed so it can no longer
                        be linked to you. Any unused tickets or offers tied to your
                        account may stop working. Deletion is completed within 30 days,
                        and most of it happens right away. This cannot be undone.
                      </Text>
                      <Text style={styles.deleteLabel}>
                        Enter your password to confirm it&apos;s you
                      </Text>
                      <TextInput
                        value={deletePassword}
                        onChangeText={setDeletePassword}
                        placeholder="Your password"
                        placeholderTextColor="#88848f"
                        style={styles.deleteInput}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!deleteBusy}
                      />
                      <TouchableOpacity
                        onPress={onConfirmDeleteAccount}
                        style={[styles.deleteConfirmBtn, deleteBusy && { opacity: 0.6 }]}
                        disabled={deleteBusy}
                      >
                        <Text style={styles.deleteConfirmBtnText}>
                          {deleteBusy ? "Deleting…" : "Delete my account"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setDeleteBoxOpen(false);
                          setDeletePassword("");
                        }}
                        style={styles.deleteCancelBtn}
                        disabled={deleteBusy}
                      >
                        <Text style={styles.deleteCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
      <View style={{ backgroundColor: "#0F0A1F", paddingBottom: insets.bottom }}>
        <BottomNav active="Rewards" onNavigate={go} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  authBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: premium.surface2,
    borderWidth: 1,
    borderColor: premium.line2,
  },
  authBtnText: { color: premium.ink, fontWeight: "700", fontSize: 13 },
  accountEmail: { fontSize: 13, color: premium.muted, fontWeight: "800", marginBottom: 12 },
  deleteOpenBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#b3261e",
    backgroundColor: "transparent",
  },
  deleteOpenBtnText: { color: "#e05260", fontWeight: "900", fontSize: 12 },
  deleteExplain: { fontSize: 12, color: premium.ink2, lineHeight: 17, marginBottom: 12 },
  deleteLabel: { fontSize: 12, color: premium.ink, fontWeight: "800", marginBottom: 8 },
  deleteInput: {
    borderWidth: 1,
    borderColor: premium.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: premium.ink,
    backgroundColor: premium.surface2,
    marginBottom: 12,
  },
  deleteConfirmBtn: {
    height: 45,
    borderRadius: 13,
    backgroundColor: "#b3261e",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteConfirmBtnText: { color: "#fff", fontWeight: "700" },
  deleteCancelBtn: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  deleteCancelBtnText: { color: premium.muted, fontWeight: "800", fontSize: 13 },
  memberHeading: {
    fontSize: 17,
    fontWeight: "700",
    color: premium.ink,
    fontFamily: "Poppins_700Bold",
    marginTop: 18,
    marginBottom: 10,
  },
  qrPlaceholderText: { fontSize: 12, color: "#514a5a", fontWeight: "700", marginTop: 8 },
  scanBtn: {
    marginTop: 12,
    height: 45,
    borderRadius: 13,
    backgroundColor: premium.violet,
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
  rewardsPoints: { fontSize: 17, fontWeight: "800", color: premium.ink },
  rewardsHint: { marginTop: 6, fontSize: 12, color: premium.muted, lineHeight: 17 },
  showQrBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: premium.violet,
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
    borderColor: premium.line2,
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
    backgroundColor: premium.surface,
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: premium.line,
    marginBottom: 9,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: premium.surface3,
  },
  rowTitle: { fontSize: 13.5, fontWeight: "800", color: premium.ink },
  rowSub: { marginTop: 2, fontSize: 12, color: premium.muted, fontWeight: "600" },
  rowMeta: { marginTop: 4, fontSize: 11, color: premium.muted, fontWeight: "700" },
  // Premium pass — hero member-benefit framing + dark balance card.
  heroBenefit: {
    color: "white",
    fontSize: 25,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
    lineHeight: 31,
  },
  balanceCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(232,196,118,0.38)",
    padding: 18,
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: premium.gold,
  },
  balanceValue: { color: "#fff", fontSize: 38, fontWeight: "800", lineHeight: 42, marginTop: 8 },
  balanceUnit: { fontSize: 14, color: premium.gold, fontWeight: "800" },
  balanceSub: { fontSize: 13, color: premium.ink2, fontWeight: "600", marginTop: 5 },
  balanceTrack: {
    marginTop: 14,
    height: 8,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  // Mockup .bar: the fill is the brand gradient, not a gold block.
  balanceFillClip: { height: "100%", borderRadius: 99, overflow: "hidden" },
  balanceFill: { flex: 1 },
  balanceMeta: { fontSize: 12, color: premium.ink2, fontWeight: "700" },
});
