// Livework — Verification reviews (operator only).
//
// The review queue for the venue verification gate (v1: manual review).
// Pending venue claims across ALL tenants, approve/reject via the
// review_venue_verification RPC (SECURITY DEFINER — the operator never
// needs RLS access to other vendors' rows).
//
// Why manual: this is how Groupon and DoorDash both started — a human
// reviewing each business before anything goes public. v2 phone codes
// bolt on later by writing the same verification columns.
//
// Approving flips the venue to 'verified' (method 'manual_review');
// the vendor's next publish attempt then succeeds. Rejecting leaves
// the venue unpublished with an audit row.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useRouter } from "expo-router";
import { THEME } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { isOperatorEmail } from "../lib/demo";
import {
  listPendingVerifications,
  reviewVerification,
  type PendingVerification,
} from "../lib/verification";

function addressLine(v: PendingVerification): string {
  return [v.address, v.city, v.state].filter((p) => p && p.trim()).join(", ");
}

function formatDate(iso: string | null): string {
  if (!iso) return "Date unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function VerifyReviewScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [pending, setPending] = useState<PendingVerification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const isOperator = isOperatorEmail(session?.user?.email ?? null);

  const load = useCallback(async () => {
    if (!isOperator) return;
    setError(null);
    try {
      setPending(await listPendingVerifications());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load the review queue.");
      setPending([]);
    }
  }, [isOperator]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  useFocusEffect(
    useCallback(() => {
      if (session) void load();
    }, [session, load]),
  );

  async function onReview(v: PendingVerification, approve: boolean) {
    if (actingId) return;
    if (!approve) {
      // Confirm a rejection — the venue stays unpublished either way.
      Alert.alert(
        "Reject this claim?",
        `"${v.name}" stays unpublished. The vendor can fix their details and request a review again.`,
        [
          { text: "Keep in queue", style: "cancel" },
          { text: "Reject", style: "destructive", onPress: () => void doReview(v, false) },
        ],
      );
      return;
    }
    await doReview(v, true);
  }

  async function doReview(v: PendingVerification, approve: boolean) {
    setActingId(v.id);
    try {
      await reviewVerification(v.id, approve, null);
      Alert.alert(
        approve ? "Verified" : "Rejected",
        approve
          ? `"${v.name}" is verified. The vendor's next publish to Bownd will go through.`
          : `"${v.name}" was rejected and stays unpublished.`,
      );
      await load();
    } catch (e: unknown) {
      Alert.alert(
        "Review failed",
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
    } finally {
      setActingId(null);
    }
  }

  if (authLoading || pending === null) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={THEME.purple} size="large" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!session || !isOperator) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Operators only</Text>
          <Text style={styles.centerSub}>
            Verification reviews are for the Bownd operator. Vendors request reviews from My Venues.
          </Text>
          <Pressable style={styles.centerBtn} onPress={() => router.back()}>
            <Text style={styles.centerBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Could not load the review queue</Text>
          <Text style={styles.centerSub}>{error}</Text>
          <Pressable style={styles.centerBtn} onPress={() => void load()}>
            <Text style={styles.centerBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Verification reviews</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.sub}>
          Approve a claim only when you can confirm this is really the venue — call their listed
          number, check their website, or recognize them. Claims on well-known venues get extra
          scrutiny: a duplicate name + address is flagged by review, first verified claim wins.
        </Text>

        {pending.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>Queue is empty.</Text>
            <Text style={styles.emptySub}>
              New venue claims land here when a vendor requests a verification review.
            </Text>
          </View>
        ) : (
          pending.map((v) => {
            const line = addressLine(v);
            const acting = actingId === v.id;
            return (
              <View key={v.id} style={styles.card}>
                <Text style={styles.venueName}>{v.name}</Text>
                {!!line && <Text style={styles.detail}>{line}</Text>}
                {!!v.phone && <Text style={styles.detail}>☎ {v.phone}</Text>}
                {!!v.website && <Text style={styles.detail}>{v.website}</Text>}
                <Text style={styles.meta}>Requested {formatDate(v.createdAt)}</Text>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.approveBtn, acting && styles.disabledBtn]}
                    disabled={acting}
                    onPress={() => void onReview(v, true)}
                  >
                    <Text style={styles.approveText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.rejectBtn, acting && styles.disabledBtn]}
                    disabled={acting}
                    onPress={() => void onReview(v, false)}
                  >
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  centerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center" },
  centerSub: { color: THEME.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  centerBtn: { backgroundColor: THEME.purple, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  centerBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "900" },
  sub: { color: THEME.textMuted, fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  venueName: { color: "#fff", fontSize: 16, fontWeight: "900" },
  detail: { color: THEME.textMuted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  meta: { color: THEME.textFaint, fontSize: 12, marginTop: 8 },
  empty: { color: THEME.textMuted, fontSize: 14, fontWeight: "700" },
  emptySub: { color: THEME.textFaint, fontSize: 13, marginTop: 6, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  approveBtn: {
    flex: 1,
    backgroundColor: "rgba(46,160,90,0.9)",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  approveText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  rejectBtn: {
    flex: 1,
    backgroundColor: "rgba(220,70,70,0.16)",
    borderWidth: 1,
    borderColor: "rgba(220,70,70,0.55)",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  rejectText: { color: "#ff8a8a", fontWeight: "900", fontSize: 13 },
  disabledBtn: { opacity: 0.5 },
});
