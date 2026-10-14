// app/(tabs)/personal.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  FlatList,
  Dimensions,
  TextInput,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
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

const { width: SCREEN_W } = Dimensions.get("window");

type FavoriteVenue = { id: string; name: string; neighborhood?: string; badge?: string };
type FavoriteEvent = { id: string; title: string; venue: string; when: string; badge?: string };
type Adventure = { id: string; title: string; subtitle: string; dateLabel: string };

export default function PersonalScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { user, profile, signOut, refreshProfile } = useAuth();

  // ✅ Top search + pills
  const [searchText, setSearchText] = useState("");
  // NOTE:
  // - "events" pill now routes to Events page
  // - "favs" pill does what the old "events" pill did (opens Favorite Events section)
  const [activePill, setActivePill] = useState<"all" | "home" | "qr" | "rewards" | "venues" | "favs" | "adventures">(
    "all"
  );

  // collapsible sections
  const [rewardsOpen, setRewardsOpen] = useState(true);
  const [venuesOpen, setVenuesOpen] = useState(true);
  const [eventsOpen, setEventsOpen] = useState(true);
  const [adventuresOpen, setAdventuresOpen] = useState(true);
  const [qrOpen, setQrOpen] = useState(true);

  // Rewards — real points from the signed-in profile (0 for guests).
  const points = profile?.points ?? 0;
  const nextTierAt = TIER_VIP_AT;
  const progress = Math.min(1, points / nextTierAt);
  const tier = tierFor(points);

  // QR — verifiable Firestore token (generated on demand).
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [qrValue, setQrValue] = useState<string>("");
  const [qrBusy, setQrBusy] = useState(false);
  const [redeemInput, setRedeemInput] = useState<string>("");

  // Favorites + redemption history (Firestore when signed in, local otherwise).
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

  const favoriteVenues: FavoriteVenue[] = useMemo(
    () =>
      favorites
        .filter((f) => f.kind === "venue")
        .map((f) => ({
          id: f.id,
          name: f.title,
          neighborhood: f.subtitle,
          badge: f.badge,
        })),
    [favorites]
  );

  const favoriteEvents: FavoriteEvent[] = useMemo(
    () =>
      favorites
        .filter((f) => f.kind === "event")
        .map((f) => ({
          id: f.id,
          title: f.title,
          venue: f.subtitle,
          when: f.when ?? "",
          badge: f.badge,
        })),
    [favorites]
  );

  // Signed-in users see real redemption history; guests see demo examples.
  const demoAdventures: Adventure[] = useMemo(
    () => [
      { id: "a1", title: "Jazz + Dessert Hop", subtitle: "Green Lady → Betty Rae’s", dateLabel: "Last weekend" },
      { id: "a2", title: "Downtown Lights", subtitle: "Union Station + Streetcar", dateLabel: "2 weeks ago" },
      { id: "a3", title: "Family Fun Run", subtitle: "Park + Hot Cocoa", dateLabel: "3 weeks ago" },
    ],
    []
  );

  const recentAdventures: Adventure[] = useMemo(
    () =>
      user
        ? history.map((h) => ({
            id: h.token,
            title: h.experienceId || "Redeemed offer",
            subtitle: `+${h.pointsAwarded} pts`,
            dateLabel: new Date(h.redeemedAt).toLocaleDateString(),
          }))
        : demoAdventures,
    [user, history, demoAdventures]
  );

  // ✅ Search filtering (no UI changes, only filters data)
  const q = searchText.trim().toLowerCase();

  const filteredVenues = useMemo(() => {
    if (!q) return favoriteVenues;
    return favoriteVenues.filter((v) => {
      const s = `${v.name} ${v.neighborhood ?? ""} ${v.badge ?? ""}`.toLowerCase();
      return s.includes(q);
    });
  }, [favoriteVenues, q]);

  const filteredEvents = useMemo(() => {
    if (!q) return favoriteEvents;
    return favoriteEvents.filter((e) => {
      const s = `${e.title} ${e.venue} ${e.when} ${e.badge ?? ""}`.toLowerCase();
      return s.includes(q);
    });
  }, [favoriteEvents, q]);

  const filteredAdventures = useMemo(() => {
    if (!q) return recentAdventures;
    return recentAdventures.filter((a) => {
      const s = `${a.title} ${a.subtitle} ${a.dateLabel}`.toLowerCase();
      return s.includes(q);
    });
  }, [recentAdventures, q]);

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

  // ✅ Pills behavior
  function applyPill(next: typeof activePill) {
    // Home pill routes home (personal page only logic)
    if (next === "home") {
      router.replace("/(tabs)");
      return;
    }

    // Events pill routes to Events page
    if (next === "events" as any) {
      // (kept for safety if someone passes "events" manually)
      router.replace("/(tabs)/events");
      return;
    }

    setActivePill(next);

    if (next === "all") {
      setQrOpen(true);
      setRewardsOpen(true);
      setVenuesOpen(true);
      setEventsOpen(true);
      setAdventuresOpen(true);
    } else {
      setQrOpen(next === "qr");
      setRewardsOpen(next === "rewards");
      setVenuesOpen(next === "venues");
      setEventsOpen(next === "favs"); // ✅ "Favs" controls Favorite Events section
      setAdventuresOpen(next === "adventures");
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }

  // ✅ route handler for Events pill (keeps pill row clean)
  function goToEvents() {
    // If your events screen is app/events.tsx, use "/events"
    // If your events screen is app/(tabs)/events.tsx, use "/(tabs)/events"
    router.replace("/(tabs)/events");
  }

  return (
    <View style={styles.root}>
      {/* Hero */}
      <LinearGradient
        colors={["#6A35FF", "#B46CFF", "#FFD57A"]}
        start={{ x: 0.1, y: 0.0 }}
        end={{ x: 0.9, y: 1.0 }}
        style={styles.hero}
      >
        <SafeAreaView style={styles.safe}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.heroTitle}>Personal</Text>
              <Text style={styles.heroSubtitle}>Rewards • Favorites • Adventures</Text>
            </View>

            <Pressable style={styles.changePersonaBtn} onPress={() => router.push("/persona")}>
              <Ionicons name="sparkles-outline" size={16} color="#fff" />
              <Text style={styles.changePersonaText}>Change Persona</Text>
            </Pressable>
          </View>

          <View style={styles.illustrationWrap}>
            <View style={styles.orb} />
            <View style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <Ionicons name="person" size={42} color="#FFFFFF" />
              </View>
            </View>

            <Text style={styles.heroBigStat}>{points} pts</Text>
            <Text style={styles.heroSmallStat}>Next tier at {nextTierAt}</Text>
            {user ? (
              <Pressable onPress={() => signOut()} style={{ marginTop: 8, padding: 6 }}>
                <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 12 }}>
                  Sign out
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push("/(auth)/login")} style={{ marginTop: 8, padding: 6 }}>
                <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 12 }}>
                  Sign in to save rewards →
                </Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* White sheet */}
      <View style={styles.sheet}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          {/* ✅ Top Search Bar + Pills */}
          <View style={styles.topToolsWrap}>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color="#6F6F6F" />
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search rewards, venues, events..."
                placeholderTextColor="#9A9A9A"
                style={styles.searchInput}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {!!searchText && (
                <Pressable onPress={() => setSearchText("")} hitSlop={10} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={18} color="#9A9A9A" />
                </Pressable>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
              <Pill label="Home" active={activePill === "home"} onPress={() => applyPill("home")} />

{/* 👇 swapped */}
<Pill label="Events" active={false} onPress={goToEvents} />
<Pill label="All" active={activePill === "all"} onPress={() => applyPill("all")} />

<Pill label="QR" active={activePill === "qr"} onPress={() => applyPill("qr")} />
<Pill label="Rewards" active={activePill === "rewards"} onPress={() => applyPill("rewards")} />
<Pill label="Venues" active={activePill === "venues"} onPress={() => applyPill("venues")} />
<Pill label="Favs" active={activePill === "favs"} onPress={() => applyPill("favs")} />
<Pill label="Adventures" active={activePill === "adventures"} onPress={() => applyPill("adventures")} />

            </ScrollView>
          </View>

          {/* QR */}
          <SectionHeader title="QR Codes" open={qrOpen} onPress={() => setQrOpen((s) => !s)} />
          {qrOpen && (
            <View style={styles.qrCard}>
              <Text style={styles.qrHint}>Generate a code to show a venue, or redeem a code from a venue.</Text>

              {/* Generator */}
              <View style={styles.qrBlock}>
                <View style={styles.qrTopRow}>
                  <Text style={styles.qrBlockTitle}>Your QR Token</Text>
                  <Pressable style={styles.smallBtn} onPress={onGenerateQr}>
                    <Ionicons name="refresh-outline" size={16} color="#fff" />
                    <Text style={styles.smallBtnText}>New</Text>
                  </Pressable>
                </View>

                <View style={styles.qrToken}>
                  <Text style={styles.qrTokenText} numberOfLines={1}>
                    {generatedCode || "—"}
                  </Text>
                </View>

                <View style={styles.qrFake}>
                  {qrValue ? (
                    <View style={styles.qrBox}>
                      <QRCode value={qrValue} size={160} />
                    </View>
                  ) : (
                    <>
                      <Ionicons name="qr-code-outline" size={80} color="rgba(0,0,0,0.55)" />
                      <Text style={styles.qrFakeText}>
                        {user ? "Tap New to generate your code" : "Sign in to generate a code"}
                      </Text>
                    </>
                  )}
                </View>
              </View>

              {/* Redeemer */}
              <View style={styles.qrBlock}>
                <Text style={styles.qrBlockTitle}>Redeem a Code</Text>
                <View style={styles.redeemRow}>
                  <TextInput
                    value={redeemInput}
                    onChangeText={setRedeemInput}
                    placeholder="Paste or type code"
                    placeholderTextColor="#9A9A9A"
                    style={styles.redeemInput}
                    autoCapitalize="characters"
                  />
                  <Pressable style={styles.redeemBtn} onPress={onRedeem}>
                    <Text style={styles.redeemBtnText}>Redeem</Text>
                  </Pressable>
                </View>

                <Pressable style={styles.scanBtn} onPress={onOpenScanner}>
                  <Ionicons name="scan-outline" size={18} color="#fff" />
                  <Text style={styles.scanBtnText}>Open Camera Scanner</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Rewards */}
          <SectionHeader title="Rewards" open={rewardsOpen} onPress={() => setRewardsOpen((s) => !s)} />
          {rewardsOpen && (
            <View style={styles.rewardsCard}>
              <View style={styles.rewardsTopRow}>
                <View>
                  <Text style={styles.rewardsPoints}>{points} points</Text>
                  <Text style={styles.rewardsHint}>Earn points by redeeming offers + going on adventures.</Text>
                </View>

                <Pressable style={styles.claimBtn} onPress={() => applyPill("qr")}>
                  <Text style={styles.claimBtnText}>Redeem</Text>
                </Pressable>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>

              <View style={styles.rewardsMetaRow}>
                <Text style={styles.metaText}>Current: {tier}</Text>
                <Text style={styles.metaText}>Next: {tier === "VIP" ? "Max" : "VIP"}</Text>
              </View>
            </View>
          )}

          {/* Favorite Venues */}
          <SectionHeader title="Favorite Venues" open={venuesOpen} onPress={() => setVenuesOpen((s) => !s)} />
          {venuesOpen && (
            <FlatList
              data={filteredVenues}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hListPad}
              renderItem={({ item }) => (
                <Pressable style={styles.tile} onPress={() => {}}>
                  <LinearGradient
                    colors={["#A56CFF", "#6A35FF", "#2D6BFF"]}
                    start={{ x: 0.0, y: 0.0 }}
                    end={{ x: 1.0, y: 1.0 }}
                    style={styles.tileBg}
                  >
                    <Text style={styles.tileBadge}>{item.badge ?? "Favorite"}</Text>
                    <Text style={styles.tileTitle} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.tileSub} numberOfLines={1}>
                      {item.neighborhood ?? "Kansas City"}
                    </Text>
                  </LinearGradient>
                </Pressable>
              )}
            />
          )}

          {/* Favorite Events */}
          <SectionHeader title="Favorite Events" open={eventsOpen} onPress={() => setEventsOpen((s) => !s)} />
          {eventsOpen && (
            <FlatList
              data={filteredEvents}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hListPad}
              renderItem={({ item }) => (
                <Pressable style={[styles.tile, { width: Math.min(240, SCREEN_W * 0.62) }]} onPress={() => {}}>
                  <LinearGradient
                    colors={["#FFD57A", "#B46CFF", "#6A35FF"]}
                    start={{ x: 0.0, y: 0.1 }}
                    end={{ x: 1.0, y: 1.0 }}
                    style={styles.tileBg}
                  >
                    <View style={styles.eventBadgeRow}>
                      <Text style={styles.tileBadge}>{item.badge ?? "Saved"}</Text>
                    </View>

                    <Text style={styles.tileTitle} numberOfLines={2}>
                      {item.title}
                    </Text>

                    <Text style={styles.tileSub} numberOfLines={1}>
                      {item.venue}
                    </Text>

                    <Text style={styles.eventWhen} numberOfLines={1}>
                      {item.when}
                    </Text>
                  </LinearGradient>
                </Pressable>
              )}
            />
          )}

          {/* Recent Adventures */}
          <SectionHeader title="Recent Adventures" open={adventuresOpen} onPress={() => setAdventuresOpen((s) => !s)} />
          {adventuresOpen && (
            <View style={styles.listWrap}>
              {user && filteredAdventures.length === 0 && (
                <Text style={{ fontSize: 13, color: "#6F6F6F", fontWeight: "800", padding: 4 }}>
                  No adventures yet — redeem an offer to start earning.
                </Text>
              )}
              {filteredAdventures.map((a) => (
                <Pressable key={a.id} style={styles.rowCard} onPress={() => {}}>
                  <View style={styles.rowLeft}>
                    <LinearGradient
                      colors={["#6A35FF", "#B46CFF", "#FFD57A"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.rowIcon}
                    >
                      <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                    </LinearGradient>
                  </View>

                  <View style={styles.rowMid}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {a.title}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {a.subtitle}
                    </Text>
                    <Text style={styles.rowMeta}>{a.dateLabel}</Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color="#A0A0A0" />
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ height: 26 }} />
        </ScrollView>
      </View>
    </View>
  );
}

function SectionHeader({ title, open, onPress }: { title: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onPress}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={18} color="#9A9A9A" />
    </Pressable>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0B12" },

  hero: {
    height: 320,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 6 },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 10,
    gap: 12,
  },
  heroTitle: { color: "#fff", fontSize: 30, fontWeight: "900" },
  heroSubtitle: { color: "rgba(255,255,255,0.88)", fontSize: 12, marginTop: 6, fontWeight: "700" },

  changePersonaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    marginLeft: -39,
  },
  changePersonaText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  illustrationWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 16 },
  orb: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255,255,255,0.18)",
    transform: [{ translateY: 8 }],
  },
  avatarRing: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  avatarInner: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "rgba(30,30,45,0.35)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  heroBigStat: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 4 },
  heroSmallStat: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 4, fontWeight: "800" },

  sheet: {
    flex: 1,
    marginTop: -34,
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
  },
  sheetContent: { paddingHorizontal: 18, paddingTop: 14 },

  // top search + pills
  topToolsWrap: { gap: 10, marginBottom: 6 },
  searchWrap: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#F7F7FB",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, height: "100%", fontWeight: "800", color: "#1B1B1B" },
  clearBtn: { paddingLeft: 2 },

  pillsRow: { paddingVertical: 2, gap: 10, paddingRight: 8 },
  pill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#F7F7FB",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: "#2D6BFF", borderColor: "rgba(45,107,255,0.25)" },
  pillText: { fontWeight: "900", fontSize: 12, color: "#1B1B1B" },
  pillTextActive: { color: "#fff" },

  sectionHeader: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#1B1B1B" },

  // QR
  qrCard: {
    backgroundColor: "#F7F7FB",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: 8,
    gap: 12,
  },
  qrHint: { fontSize: 12, color: "#6F6F6F", fontWeight: "700", lineHeight: 16 },
  qrBlock: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  qrTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  qrBlockTitle: { fontSize: 13, fontWeight: "900", color: "#1B1B1B" },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2D6BFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  smallBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  qrToken: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "#F7F7FB",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  qrTokenText: { fontWeight: "900", color: "#1B1B1B" },

  qrFake: {
    marginTop: 12,
    height: 150,
    borderRadius: 16,
    backgroundColor: "#F7F7FB",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  qrFakeText: { fontSize: 11, color: "#9A9A9A", fontWeight: "800" },

  qrBox: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },

  redeemRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  redeemInput: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#F7F7FB",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    fontWeight: "800",
    color: "#1B1B1B",
  },
  redeemBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#6A35FF",
    alignItems: "center",
    justifyContent: "center",
  },
  redeemBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  scanBtn: {
    marginTop: 10,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#2D6BFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  scanBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  // Rewards
  rewardsCard: {
    backgroundColor: "#F7F7FB",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: 8,
  },
  rewardsTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  rewardsPoints: { fontSize: 18, fontWeight: "900", color: "#141414" },
  rewardsHint: { marginTop: 6, fontSize: 12, color: "#6F6F6F", maxWidth: 230, lineHeight: 16 },
  claimBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: "#2D6BFF" },
  claimBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  progressTrack: { marginTop: 12, height: 10, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.08)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 10, backgroundColor: "#6A35FF" },
  rewardsMetaRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between" },
  metaText: { fontSize: 12, color: "#6F6F6F", fontWeight: "800" },

  // lists
  hListPad: { paddingBottom: 6, paddingTop: 2, paddingRight: 8, gap: 12 },
  tile: { width: Math.min(200, SCREEN_W * 0.55), height: 150, borderRadius: 18, overflow: "hidden" },
  tileBg: { flex: 1, padding: 14, justifyContent: "flex-end" },
  tileBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    marginBottom: 10,
  },
  tileTitle: { color: "#fff", fontSize: 16, fontWeight: "900", lineHeight: 20 },
  tileSub: { color: "rgba(255,255,255,0.9)", marginTop: 6, fontSize: 12, fontWeight: "800" },

  eventBadgeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eventWhen: { marginTop: 8, color: "rgba(255,255,255,0.95)", fontSize: 12, fontWeight: "900" },

  listWrap: { gap: 10, paddingBottom: 8 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F7F7FB",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  rowLeft: { width: 36, alignItems: "center", justifyContent: "center" },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowMid: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "900", color: "#1B1B1B" },
  rowSub: { marginTop: 3, fontSize: 12, color: "#6F6F6F", fontWeight: "800" },
  rowMeta: { marginTop: 6, fontSize: 11, color: "#9A9A9A", fontWeight: "900" },
});
