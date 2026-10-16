// app/(tabs)/personal.tsx
// Bownd recreate restyle (Personal screen) — visual restyle only.
// Behavior preserved from the pre-restyle file (see notes below):
// - Guests never see demo adventures: signed-in users see real redemption
//   history, guests see a sign-in prompt (never fake demo adventures).
// - Favorite venue tiles navigate to /(tabs)/events filtered to that venue.
//   Favorite event tiles navigate to /detail. Previously both were dead.
// - Adventure rows are redemption-history records, not navigable content:
//   plain rows (no onPress, no chevron).
// - "Change Persona" points at the canonical /(tabs)/persona route.
// - Rewards "Show QR" scrolls to the QR section; it never redeems anything.
//   The old "Redeem" label implied it did, so the label says what it does.
// - All points / tokens / QR values come from the real backend
//   (profile, lib/store generateQrToken, lib/store redeemCode).
//   No mockup example values are hardcoded anywhere in this file.
// - Tabs adapted to the mockup set All | QR | Rewards | Venue:
//   All shows every section; QR shows QR only; Rewards shows Rewards only;
//   Venue shows the venue-related sections (Favorite Venues + Favorite
//   Events). Favorite Events and Adventures content is unchanged and still
//   reachable under All. Home / Events navigation moved to SegmentedTabs
//   (top) and BottomNav (bottom), same destinations as the old pills.
// - Gear icon: no dedicated settings route exists in this app, so the gear
//   reuses the existing /(tabs)/persona route (the file's settings-adjacent
//   destination) instead of inventing a new route.
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
import {
  SearchBar,
  SegmentedTabs,
  BottomNav,
  TagPill,
  PhotoCard,
  rc,
  rr,
  rs,
  rtype,
  rshadow,
  type TabKey,
} from "../ui/recreate";

const { width: SCREEN_W } = Dimensions.get("window");

const VENUE_GRADIENT: [string, string] = ["#7C3AED", "#4F46E5"];
const EVENT_GRADIENT: [string, string] = ["#F6A58A", "#7C3AED"];
const PROFILE_GRADIENT: [string, string, string] = ["#7C3AED", "#A855F7", "#F6A58A"];

type FavoriteVenue = { id: string; name: string; neighborhood?: string; badge?: string };
type FavoriteEvent = { id: string; title: string; venue: string; when: string; badge?: string };
type Adventure = { id: string; title: string; subtitle: string; dateLabel: string };

export default function PersonalScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { user, profile, signOut, refreshProfile } = useAuth();

  const [searchText, setSearchText] = useState("");
  // Mockup tabs: All | QR | Rewards | Venue.
  const [activePill, setActivePill] = useState<"all" | "qr" | "rewards" | "venue">("all");

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

  // Adventures = REAL redemption history for signed-in users.
  // Guests see no adventures (never fake demo adventures).
  const recentAdventures: Adventure[] = useMemo(
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

  // Search filtering (filters data only).
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

  function goToTab(t: TabKey) {
    if (t === "home") {
      router.replace("/(tabs)");
      return;
    }
    if (t === "events") {
      router.replace("/(tabs)/events");
      return;
    }
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function applyPill(next: typeof activePill) {
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
      // Venue tab shows the venue-related sections.
      setVenuesOpen(next === "venue");
      setEventsOpen(next === "venue");
      setAdventuresOpen(false);
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.heroTitle}>Personal</Text>
              <Text style={styles.heroSubtitle}>Rewards · Favorites · Adventures</Text>
            </View>
            <Pressable
              style={styles.gearBtn}
              onPress={() => router.push("/(tabs)/persona")}
              accessibilityLabel="Settings"
              accessibilityRole="button"
            >
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <SearchBar
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search rewards, venues, events..."
            />
          </View>

          <View style={styles.segWrap}>
            <SegmentedTabs active="personal" onSelect={goToTab} />
          </View>

          {/* Profile: violet-to-peach gradient panel, concentric glow circles,
              dark avatar circle with person silhouette, real backend points. */}
          <LinearGradient
            colors={PROFILE_GRADIENT}
            start={{ x: 0.1, y: 0.0 }}
            end={{ x: 0.9, y: 1.0 }}
            style={styles.profilePanel}
          >
            <View style={styles.glowOuter}>
              <View style={styles.glowMid}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={42} color="#FFFFFF" />
                </View>
              </View>
            </View>

            <Text style={styles.heroBigStat}>{points} pts</Text>
            <Text style={styles.heroSmallStat}>Next tier at {nextTierAt}</Text>
            <View style={styles.tierRow}>
              <TagPill label={tier} />
            </View>

            <Pressable style={styles.changePersonaBtn} onPress={() => router.push("/(tabs)/persona")}>
              <Ionicons name="sparkles-outline" size={16} color="#fff" />
              <Text style={styles.changePersonaText}>Change Persona</Text>
            </Pressable>

            {user ? (
              <Pressable onPress={() => signOut()} style={styles.authLink}>
                <Text style={styles.authLinkText}>Sign out</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push("/(auth)/login")} style={styles.authLink}>
                <Text style={styles.authLinkText}>Sign in to save rewards →</Text>
              </Pressable>
            )}
          </LinearGradient>

          {/* Lower panel: light off-white / pale-lavender, overlapping gradient. */}
          <View style={styles.lightPanel}>
            {/* Tabs: All (selected) | QR | Rewards | Venue */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              <TabPill label="All" active={activePill === "all"} onPress={() => applyPill("all")} />
              <TabPill label="QR" active={activePill === "qr"} onPress={() => applyPill("qr")} />
              <TabPill
                label="Rewards"
                active={activePill === "rewards"}
                onPress={() => applyPill("rewards")}
              />
              <TabPill
                label="Venue"
                active={activePill === "venue"}
                onPress={() => applyPill("venue")}
              />
              <Ionicons
                name="chevron-forward"
                size={16}
                color={rc.lightPanelSub}
                style={styles.tabsChevron}
              />
            </ScrollView>

            {/* QR */}
            <SectionHeader title="QR Codes" open={qrOpen} onPress={() => setQrOpen((s) => !s)} />
            {qrOpen && (
              <View style={styles.card}>
                <Text style={styles.qrHint}>
                  Generate a code to show a venue, or redeem a code from a venue.
                </Text>

                {/* Generator */}
                <View>
                  <View style={styles.qrTopRow}>
                    <Text style={styles.qrBlockTitle}>Your QR Token</Text>
                    <Pressable style={styles.newBtn} onPress={onGenerateQr}>
                      <Ionicons name="refresh-outline" size={16} color="#fff" />
                      <Text style={styles.newBtnText}>New</Text>
                    </Pressable>
                  </View>

                  <View style={styles.qrToken}>
                    <Text style={styles.qrTokenText} numberOfLines={1}>
                      {generatedCode || "—"}
                    </Text>
                  </View>

                  <View style={styles.qrDisplay}>
                    {qrValue ? (
                      <View style={styles.qrBox}>
                        <QRCode value={qrValue} size={160} />
                      </View>
                    ) : (
                      <>
                        <Ionicons name="qr-code-outline" size={80} color="rgba(0,0,0,0.55)" />
                        <Text style={styles.qrEmptyText}>
                          {user ? "Tap New to generate your code" : "Sign in to generate a code"}
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                {/* Redeemer */}
                <View>
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
                    <Pressable onPress={onRedeem}>
                      <LinearGradient
                        colors={[rc.indigo, rc.violet]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.redeemBtn}
                      >
                        <Text style={styles.redeemBtnText}>Redeem</Text>
                      </LinearGradient>
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
            <SectionHeader
              title="Rewards"
              open={rewardsOpen}
              onPress={() => setRewardsOpen((s) => !s)}
            />
            {rewardsOpen && (
              <View style={styles.card}>
                <View style={styles.rewardsTopRow}>
                  <View>
                    <Text style={styles.rewardsPoints}>{points} points</Text>
                    <Text style={styles.rewardsHint}>
                      Earn points by redeeming offers + going on adventures.
                    </Text>
                  </View>

                  {/* Scrolls to the QR section. Label says what it does —
                      the old "Redeem" label implied it redeemed something. */}
                  <Pressable style={styles.claimBtn} onPress={() => applyPill("qr")}>
                    <Text style={styles.claimBtnText}>Show QR</Text>
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
            <SectionHeader
              title="Favorite Venues"
              open={venuesOpen}
              onPress={() => setVenuesOpen((s) => !s)}
            />
            {venuesOpen && (
              <FlatList
                data={filteredVenues}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hListPad}
                renderItem={({ item }) => (
                  <View style={styles.favItemWrap}>
                    <PhotoCard
                      title={item.name}
                      subtitle={item.neighborhood ?? "Kansas City"}
                      badge={item.badge ?? "Favorite"}
                      gradient={VENUE_GRADIENT}
                      height={150}
                      onPress={() =>
                        router.push({ pathname: "/(tabs)/events", params: { venue: item.name } })
                      }
                    />
                  </View>
                )}
              />
            )}

            {/* Favorite Events */}
            <SectionHeader
              title="Favorite Events"
              open={eventsOpen}
              onPress={() => setEventsOpen((s) => !s)}
            />
            {eventsOpen && (
              <FlatList
                data={filteredEvents}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hListPad}
                renderItem={({ item }) => (
                  <View style={styles.favEventWrap}>
                    <PhotoCard
                      title={item.title}
                      subtitle={item.when ? `${item.venue} · ${item.when}` : item.venue}
                      badge={item.badge ?? "Saved"}
                      gradient={EVENT_GRADIENT}
                      height={150}
                      onPress={() =>
                        router.push({ pathname: "/detail", params: { id: item.id, kind: "event" } })
                      }
                    />
                  </View>
                )}
              />
            )}

            {/* Recent Adventures — real redemption history only. */}
            <SectionHeader
              title="Recent Adventures"
              open={adventuresOpen}
              onPress={() => setAdventuresOpen((s) => !s)}
            />
            {adventuresOpen && (
              <View style={styles.listWrap}>
                {!user && (
                  <Text style={styles.emptyText}>Sign in to see your adventures.</Text>
                )}
                {user && filteredAdventures.length === 0 && (
                  <Text style={styles.emptyText}>
                    No adventures yet — redeem an offer to start earning.
                  </Text>
                )}
                {/* History records are display-only (not navigable content),
                    so rows are plain Views with no chevron — previously dead
                    pressables with a misleading chevron. */}
                {filteredAdventures.map((a) => (
                  <View key={a.id} style={styles.rowCard}>
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
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 10 }} />
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomNav active="personal" onSelect={goToTab} />
    </View>
  );
}

function SectionHeader({ title, open, onPress }: { title: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onPress}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Ionicons
        name={open ? "chevron-down" : "chevron-forward"}
        size={18}
        color={rc.lightPanelSub}
      />
    </Pressable>
  );
}

/** Light-panel tab pill: selected = dark pill per the mockup. Built with
 *  shared rc tokens; FilterPill (dark-theme) is unreadable on this surface. */
function TabPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabPill, active && styles.tabPillActive]}>
      <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: rc.bg },
  safe: { flex: 1 },
  scrollContent: { paddingHorizontal: rs.page, paddingTop: 8, paddingBottom: 16 },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 10,
    marginBottom: 16,
    gap: 12,
  },
  heroTitle: { ...rtype.display, color: "#fff" },
  heroSubtitle: { ...rtype.small, color: rc.subtext, marginTop: 4 },
  gearBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: rc.surface,
    borderWidth: 1,
    borderColor: rc.border,
    alignItems: "center",
    justifyContent: "center",
  },

  searchWrap: { marginBottom: 12 },
  segWrap: { marginBottom: 16 },

  // Profile gradient panel
  profilePanel: {
    borderRadius: rr.panel,
    overflow: "hidden",
    padding: 20,
    paddingBottom: 48,
    alignItems: "center",
    ...rshadow.card,
  },
  glowOuter: {
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  glowMid: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "#1E1B2E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  heroBigStat: { color: "#fff", fontSize: 30, fontWeight: "900", marginTop: 4 },
  heroSmallStat: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4, fontWeight: "700" },
  tierRow: { marginTop: 10 },
  changePersonaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: rr.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    marginTop: 14,
  },
  changePersonaText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  authLink: { marginTop: 10, padding: 6 },
  authLinkText: { color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 12 },

  // Lower light panel overlapping the gradient
  lightPanel: {
    marginTop: -28,
    backgroundColor: rc.lightPanel,
    borderRadius: rr.panel,
    padding: 16,
    ...rshadow.card,
  },

  tabsRow: { gap: 8, paddingBottom: 4, marginBottom: 4, alignItems: "center" },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: rr.pill,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: rc.lightBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  tabPillActive: { backgroundColor: "#1E1B2E", borderColor: "#1E1B2E" },
  tabPillText: { fontSize: 13, fontWeight: "700", color: rc.lightPanelText },
  tabPillTextActive: { color: "#fff" },
  tabsChevron: { marginLeft: 2 },

  sectionHeader: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { ...rtype.section, color: rc.lightPanelText },

  // Cards on the light panel
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: rr.card,
    padding: 14,
    borderWidth: 1,
    borderColor: rc.lightBorder,
    marginBottom: 8,
    gap: 12,
  },
  qrHint: { ...rtype.small, color: rc.lightPanelSub },
  qrTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  qrBlockTitle: { fontSize: 14, fontWeight: "800", color: rc.lightPanelText },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: rc.violet,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: rr.pill,
  },
  newBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  qrToken: {
    marginTop: 10,
    borderRadius: rr.cardSm,
    backgroundColor: rc.lightPanel,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  qrTokenText: { fontWeight: "800", color: rc.lightPanelText },

  qrDisplay: {
    marginTop: 12,
    minHeight: 170,
    borderRadius: rr.cardSm,
    backgroundColor: rc.lightPanel,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
  },
  qrEmptyText: { fontSize: 12, color: rc.lightPanelSub, fontWeight: "600", textAlign: "center" },
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
    backgroundColor: rc.lightPanel,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: rc.lightBorder,
    fontWeight: "700",
    color: rc.lightPanelText,
  },
  redeemBtn: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  redeemBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  scanBtn: {
    marginTop: 10,
    height: 46,
    borderRadius: 14,
    backgroundColor: rc.indigo,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  scanBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // Rewards
  rewardsTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  rewardsPoints: { fontSize: 20, fontWeight: "800", color: rc.lightPanelText },
  rewardsHint: { ...rtype.small, color: rc.lightPanelSub, marginTop: 6, maxWidth: 230 },
  claimBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: rc.indigo },
  claimBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  progressTrack: {
    marginTop: 12,
    height: 10,
    borderRadius: 10,
    backgroundColor: "rgba(30,27,46,0.10)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 10, backgroundColor: rc.violet },
  rewardsMetaRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between" },
  metaText: { fontSize: 12, color: rc.lightPanelSub, fontWeight: "700" },

  // Favorites lists
  hListPad: { paddingBottom: 6, paddingTop: 2, paddingRight: 8, gap: 12 },
  favItemWrap: { width: Math.min(200, SCREEN_W * 0.55) },
  favEventWrap: { width: Math.min(240, SCREEN_W * 0.62) },

  listWrap: { gap: 10, paddingBottom: 8 },
  emptyText: { fontSize: 13, color: rc.lightPanelSub, fontWeight: "700", padding: 4 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: rr.cardSm,
    padding: 12,
    borderWidth: 1,
    borderColor: rc.lightBorder,
  },
  rowLeft: { width: 36, alignItems: "center", justifyContent: "center" },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowMid: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "800", color: rc.lightPanelText },
  rowSub: { marginTop: 3, fontSize: 12, color: rc.lightPanelSub, fontWeight: "700" },
  rowMeta: { marginTop: 6, fontSize: 11, color: rc.lightPanelSub, fontWeight: "700" },
});
