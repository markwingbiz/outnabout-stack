// Livework+ admin push composer (push-notifications-plan.md §1.7).
//
// The composer is a client of the push-send Edge Function — it enqueues
// like every other sender; there is no second sending path. Flow:
// compose → audience (with resolved count) → deep link → preview →
// test send to the operator's own device (mandatory before the first
// audience send) → explicit confirm → send now or schedule. History and
// scheduled drafts are listed below, non-editable.
//
// CROSS-APP (§1.7): the FIRST choice is the target app — Bownd, Livework
// or Livework+. Segments resolve within that app and deep-link options
// follow the target app's routes.
//
// Access: gated on the app's existing operator pattern
// (useOperatorStatus / checkIsOperator in lib/forge.ts) — operator
// (Mark) only today; the admin model is deferred and no roles or
// permission paths are invented here. Nothing in this screen reads,
// references, or links into the private Dates/Connections content.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { THEME } from "../../lib/theme";
import { useAuth } from "../../lib/auth";
import { formatDate, useOperatorStatus } from "../../lib/forge";
import {
  PUSH_TARGET_APPS,
  TRANSACTIONAL_REASONS,
  categoriesForApp,
  fetchAdminPushState,
  fetchAudienceCount,
  fetchPushLinkOptions,
  listAdminPushHistory,
  listScheduledAdminPushes,
  cancelScheduledAdminPush,
  scheduleAdminPush,
  segmentsForApp,
  sendAdminPushNow,
  sendAdminTestPush,
  type AdminPushHistoryRow,
  type PushAudience,
  type PushDraft,
  type PushLinkOptions,
  type PushSegment,
  type PushSendClass,
  type PushTargetApp,
  type ScheduledPush,
  type TransactionalReason,
} from "../../lib/pushAdmin";

type LinkKind = "none" | "event" | "venue" | "campaign" | "offer" | "screen";
type ScheduleMode = "now" | "hour" | "tomorrow9";

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function PushComposerScreen() {
  const { user } = useAuth();
  const { isOperator, checking } = useOperatorStatus(user?.id);

  // Compose state
  const [app, setApp] = useState<PushTargetApp>("bownd");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendClass, setSendClass] = useState<PushSendClass>("marketing");
  const [reason, setReason] = useState<TransactionalReason>("service_notice");
  const [category, setCategory] = useState<string>(categoriesForApp("bownd")[0].key);
  const [segment, setSegment] = useState<PushSegment>("all");
  const [accountIdsText, setAccountIdsText] = useState("");
  const [linkKind, setLinkKind] = useState<LinkKind>("none");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [linkOptions, setLinkOptions] = useState<PushLinkOptions | null>(null);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");

  // Flow state
  const [killOff, setKillOff] = useState<boolean | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [countBusy, setCountBusy] = useState(false);
  const [testSentFor, setTestSentFor] = useState<PushTargetApp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AdminPushHistoryRow[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledPush[]>([]);

  const segments = useMemo(() => segmentsForApp(app), [app]);
  const categories = useMemo(() => categoriesForApp(app), [app]);

  const refreshLists = useCallback(async () => {
    const [h, s] = await Promise.allSettled([listAdminPushHistory(20), listScheduledAdminPushes()]);
    if (h.status === "fulfilled") setHistory(h.value);
    if (s.status === "fulfilled") setScheduled(s.value);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isOperator) return;
      void refreshLists();
      fetchAdminPushState()
        .then((st) => setKillOff(st.admin_push_enabled ? null : true))
        .catch(() => setKillOff(null));
    }, [isOperator, refreshLists]),
  );

  useEffect(() => {
    let alive = true;
    fetchPushLinkOptions(app)
      .then((opts) => {
        if (alive) setLinkOptions(opts);
      })
      .catch(() => {
        if (alive) setLinkOptions(null);
      });
    return () => {
      alive = false;
    };
  }, [app]);

  function onSelectApp(next: PushTargetApp) {
    setApp(next);
    setSegment("all");
    setCategory(categoriesForApp(next)[0].key);
    setLinkKind("none");
    setSelectedRoute("");
    setCount(null);
  }

  function parsedAccountIds(): string[] {
    return accountIdsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function buildAudience(): PushAudience | null {
    if (segment === "specific") {
      const ids = parsedAccountIds();
      if (ids.length === 0) return null;
      return { app, segment, account_ids: ids };
    }
    return { app, segment };
  }

  function buildDraft(): PushDraft | null {
    const audience = buildAudience();
    if (!audience || !title.trim() || !body.trim()) return null;
    return {
      title: title.trim(),
      body: body.trim(),
      audience,
      category,
      send_class: sendClass,
      reason: sendClass === "transactional" ? reason : undefined,
      deep_link: linkKind === "none" ? "" : selectedRoute,
    };
  }

  const draft = buildDraft();
  const testDone = testSentFor === app;
  const sendArmed = Boolean(draft) && testDone && killOff !== true;

  async function onCheckCount() {
    const audience = buildAudience();
    if (!audience) {
      setError("Add at least one account id for a specific-accounts audience.");
      return;
    }
    setCountBusy(true);
    setError(null);
    try {
      setCount(await fetchAudienceCount(audience, category));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve the audience.");
    } finally {
      setCountBusy(false);
    }
  }

  async function onTestSend() {
    if (!draft) {
      setError("Add a title, a message, and a complete audience first.");
      return;
    }
    setBusy("test");
    setError(null);
    try {
      await sendAdminTestPush(draft);
      setTestSentFor(app);
      Alert.alert("Test sent", "Check your own device for this app, then send or schedule.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed.");
    } finally {
      setBusy(null);
    }
  }

  function scheduleISO(): string {
    const now = new Date();
    if (scheduleMode === "hour") return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return t.toISOString();
  }

  function onConfirmSend() {
    if (!draft) return;
    const appLabel = PUSH_TARGET_APPS.find((a) => a.key === app)?.label ?? app;
    const segmentLabel = segments.find((s) => s.key === segment)?.label ?? segment;
    const classLabel =
      sendClass === "marketing"
        ? "Marketing"
        : `Transactional — ${TRANSACTIONAL_REASONS.find((r) => r.key === reason)?.label ?? reason}`;
    const whenLabel =
      scheduleMode === "now"
        ? "Send now"
        : scheduleMode === "hour"
          ? "Send in 1 hour"
          : "Send tomorrow at 9:00 AM";
    Alert.alert(
      "Send this push?",
      [
        `App: ${appLabel}`,
        `Audience: ${segmentLabel}${count !== null ? ` (≈${count} devices)` : ""}`,
        `Class: ${classLabel}`,
        whenLabel,
        "",
        `"${draft.title}"`,
      ].join("\n"),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: scheduleMode === "now" ? "Send" : "Schedule",
          onPress: () => void doSend(),
        },
      ],
    );
  }

  async function doSend() {
    if (!draft) return;
    setBusy("send");
    setError(null);
    try {
      if (scheduleMode === "now") {
        const res = await sendAdminPushNow(draft);
        Alert.alert(
          "Sent",
          res.recipients !== null ? `Delivered to the sender for ${res.recipients} devices.` : "Sent.",
        );
      } else {
        await scheduleAdminPush(draft, scheduleISO());
        Alert.alert("Scheduled", "It will send at the chosen time unless cancelled here.");
      }
      setCount(null);
      await refreshLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onCancelScheduled(id: string) {
    setBusy(`cancel:${id}`);
    try {
      await cancelScheduledAdminPush(id);
      await refreshLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel.");
    } finally {
      setBusy(null);
    }
  }

  if (checking) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={THEME.purpleBright} size="large" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!isOperator) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={36} color={THEME.purpleBright} />
          <Text style={styles.centerTitle}>Operator access only</Text>
          <Text style={styles.centerSub}>
            Sending pushes is restricted to the operator account.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const linkChoices =
    linkKind === "event"
      ? linkOptions?.events ?? []
      : linkKind === "venue"
        ? linkOptions?.venues ?? []
        : linkKind === "campaign"
          ? linkOptions?.campaigns ?? []
          : linkKind === "screen"
            ? linkOptions?.screens ?? []
            : [];

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Send a push</Text>
        <Text style={styles.intro}>
          Hand-written pushes go through the same sender and the same rules as automatic ones.
          Marketing sends respect each person&apos;s category choices, quiet hours, and the daily
          cap.
        </Text>

        {killOff === true && (
          <View style={styles.killBanner}>
            <Ionicons name="warning" size={18} color={THEME.orange} />
            <Text style={styles.killText}>
              Admin pushes are switched off. You can draft and test-send to your own device, but
              audience sends are blocked.
            </Text>
          </View>
        )}
        {!!error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Target app — the first choice (§1.7) */}
        <Text style={styles.sectionLabel}>Send to app</Text>
        <View style={styles.chipRow}>
          {PUSH_TARGET_APPS.map((a) => (
            <Chip key={a.key} label={a.label} active={app === a.key} onPress={() => onSelectApp(a.key)} />
          ))}
        </View>

        {/* Compose */}
        <Text style={styles.sectionLabel}>Message</Text>
        <View style={styles.card}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={THEME.textFaint}
            style={styles.input}
            maxLength={80}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Message — short and factual"
            placeholderTextColor={THEME.textFaint}
            style={[styles.input, styles.inputLast, { minHeight: 64, textAlignVertical: "top" }]}
            multiline
            maxLength={240}
          />
        </View>

        {/* Class */}
        <Text style={styles.sectionLabel}>Type</Text>
        <View style={styles.chipRow}>
          <Chip label="Marketing" active={sendClass === "marketing"} onPress={() => setSendClass("marketing")} />
          <Chip
            label="Transactional"
            active={sendClass === "transactional"}
            onPress={() => setSendClass("transactional")}
          />
        </View>
        {sendClass === "transactional" && (
          <>
            <Text style={styles.fieldLabel}>Reason (required)</Text>
            <View style={styles.chipRow}>
              {TRANSACTIONAL_REASONS.map((r) => (
                <Chip key={r.key} label={r.label} active={reason === r.key} onPress={() => setReason(r.key)} />
              ))}
            </View>
          </>
        )}
        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.chipRow}>
          {categories.map((c) => (
            <Chip key={c.key} label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} />
          ))}
        </View>

        {/* Audience */}
        <Text style={styles.sectionLabel}>Audience</Text>
        <View style={styles.chipRow}>
          {segments.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              active={segment === s.key}
              onPress={() => {
                setSegment(s.key);
                setCount(null);
              }}
            />
          ))}
        </View>
        {segment === "specific" && (
          <TextInput
            value={accountIdsText}
            onChangeText={setAccountIdsText}
            placeholder={"Account ids, one per line"}
            placeholderTextColor={THEME.textFaint}
            style={[styles.input, styles.standaloneInput]}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <View style={styles.countRow}>
          <Pressable style={styles.secondaryBtn} onPress={() => void onCheckCount()} disabled={countBusy}>
            <Text style={styles.secondaryBtnText}>{countBusy ? "Checking…" : "Check audience size"}</Text>
          </Pressable>
          {count !== null && <Text style={styles.countText}>≈ {count} devices</Text>}
        </View>

        {/* Deep link — options follow the TARGET app */}
        <Text style={styles.sectionLabel}>Link to</Text>
        <View style={styles.chipRow}>
          <Chip label="No link" active={linkKind === "none"} onPress={() => { setLinkKind("none"); setSelectedRoute(""); }} />
          {app !== "livework_plus" && (
            <Chip label="Event" active={linkKind === "event"} onPress={() => { setLinkKind("event"); setSelectedRoute(""); }} />
          )}
          {app !== "livework_plus" && (
            <Chip label="Venue" active={linkKind === "venue"} onPress={() => { setLinkKind("venue"); setSelectedRoute(""); }} />
          )}
          {app === "bownd" && (
            <Chip label="Campaign" active={linkKind === "campaign"} onPress={() => { setLinkKind("campaign"); setSelectedRoute(""); }} />
          )}
          {app === "bownd" && (
            <Chip label="Offer" active={linkKind === "offer"} onPress={() => { setLinkKind("offer"); setSelectedRoute(""); }} />
          )}
          <Chip label="App screen" active={linkKind === "screen"} onPress={() => { setLinkKind("screen"); setSelectedRoute(""); }} />
        </View>
        {linkKind === "offer" && (
          <Text style={styles.note}>No offers yet — combined offers appear here once they exist.</Text>
        )}
        {(linkKind === "event" || linkKind === "venue" || linkKind === "campaign" || linkKind === "screen") && (
          <View style={styles.card}>
            {linkOptions === null ? (
              <ActivityIndicator color={THEME.purpleBright} />
            ) : linkChoices.length === 0 ? (
              <Text style={styles.note}>Nothing to link to yet.</Text>
            ) : (
              linkChoices.map((t, i) => (
                <Pressable
                  key={`${t.id}-${i}`}
                  style={[styles.linkRow, i === linkChoices.length - 1 && styles.rowLast]}
                  onPress={() => setSelectedRoute(t.route)}
                >
                  <Text style={styles.linkLabel}>{t.label}</Text>
                  {selectedRoute === t.route ? (
                    <Ionicons name="checkmark-circle" size={20} color={THEME.purpleBright} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={20} color={THEME.textFaint} />
                  )}
                </Pressable>
              ))
            )}
            {!!linkOptions?.error && <Text style={styles.note}>{linkOptions.error}</Text>}
          </View>
        )}
        {linkKind !== "none" && linkKind !== "offer" && !!selectedRoute && (
          <Text style={styles.note}>Links to: {selectedRoute}</Text>
        )}

        {/* Preview */}
        <Text style={styles.sectionLabel}>Preview</Text>
        <View style={styles.phoneFrame}>
          <View style={styles.notch} />
          <View style={styles.notifRow}>
            <View style={styles.notifIcon}>
              <Ionicons name="notifications" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifTitle} numberOfLines={1}>
                {title.trim() || "Title"}
              </Text>
              <Text style={styles.notifBody} numberOfLines={3}>
                {body.trim() || "Message"}
              </Text>
            </View>
            <Text style={styles.notifWhen}>now</Text>
          </View>
        </View>

        {/* Test → schedule → confirm */}
        <Pressable
          style={[styles.secondaryBtn, styles.wideBtn]}
          onPress={() => void onTestSend()}
          disabled={busy !== null}
        >
          <Text style={styles.secondaryBtnText}>
            {busy === "test" ? "Sending test…" : testDone ? "Test sent ✓ — send again" : "Send a test to my device"}
          </Text>
        </Pressable>
        <Text style={styles.fieldLabel}>When</Text>
        <View style={styles.chipRow}>
          <Chip label="Send now" active={scheduleMode === "now"} onPress={() => setScheduleMode("now")} />
          <Chip label="In 1 hour" active={scheduleMode === "hour"} onPress={() => setScheduleMode("hour")} />
          <Chip label="Tomorrow 9:00 AM" active={scheduleMode === "tomorrow9"} onPress={() => setScheduleMode("tomorrow9")} />
        </View>
        <Pressable
          style={[styles.primaryBtn, !sendArmed && styles.primaryBtnDisabled]}
          onPress={onConfirmSend}
          disabled={!sendArmed || busy !== null}
        >
          <Text style={styles.primaryBtnText}>
            {busy === "send"
              ? "Working…"
              : killOff === true
                ? "Admin pushes are off"
                : !testDone
                  ? "Test-send first to arm sending"
                  : scheduleMode === "now"
                    ? "Review & send"
                    : "Review & schedule"}
          </Text>
        </Pressable>

        {/* Scheduled */}
        {scheduled.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Scheduled</Text>
            <View style={styles.card}>
              {scheduled.map((s, i) => (
                <View key={s.id} style={[styles.historyRow, i === scheduled.length - 1 && styles.rowLast]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle}>{s.title}</Text>
                    <Text style={styles.historySub}>
                      {PUSH_TARGET_APPS.find((a) => a.key === s.app)?.label ?? s.app} ·{" "}
                      {formatDate(s.send_at)}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => void onCancelScheduled(s.id)}
                    disabled={busy !== null}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}

        {/* History — non-editable audit surface */}
        <Text style={styles.sectionLabel}>History</Text>
        <View style={styles.card}>
          {history.length === 0 ? (
            <Text style={styles.note}>No admin pushes sent yet.</Text>
          ) : (
            history.map((h, i) => (
              <View key={h.id} style={[styles.historyRow, i === history.length - 1 && styles.rowLast]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle}>{h.title}</Text>
                  <Text style={styles.historySub}>
                    {PUSH_TARGET_APPS.find((a) => a.key === h.app)?.label ?? h.app}
                    {h.segment ? ` · ${h.segment}` : ""}
                    {h.recipients !== null ? ` · ${h.recipients} devices` : ""} ·{" "}
                    {formatDate(h.created_at)}
                  </Text>
                </View>
                {!!h.status && <Text style={styles.statusText}>{h.status}</Text>}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  centerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center" },
  centerSub: { color: THEME.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900" },
  intro: { color: THEME.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 8 },
  sectionLabel: { color: "#fff", fontSize: 15, fontWeight: "800", marginTop: 18, marginBottom: 10 },
  fieldLabel: { color: THEME.textMuted, fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
    paddingHorizontal: 14,
  },
  input: {
    color: "#fff",
    fontSize: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  inputLast: { borderBottomWidth: 0 },
  standaloneInput: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusSm,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 14,
    minHeight: 72,
    textAlignVertical: "top",
    marginTop: 4,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.card,
  },
  chipActive: { backgroundColor: THEME.purpleDeep, borderColor: THEME.purpleBright },
  chipText: { color: THEME.textMuted, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  countRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  countText: { color: THEME.textMuted, fontSize: 13, fontWeight: "700" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: THEME.purpleBright,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignSelf: "flex-start",
  },
  wideBtn: { alignSelf: "stretch", alignItems: "center", marginTop: 18 },
  secondaryBtnText: { color: THEME.purpleBright, fontWeight: "800", fontSize: 13 },
  primaryBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 14,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  rowLast: { borderBottomWidth: 0 },
  linkLabel: { color: "#fff", fontSize: 14, fontWeight: "700", flex: 1 },
  note: { color: THEME.textFaint, fontSize: 12, lineHeight: 16, marginTop: 8 },
  phoneFrame: {
    backgroundColor: "#05050C",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 14,
    paddingTop: 10,
  },
  notch: {
    alignSelf: "center",
    width: 72,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 12,
  },
  notifRow: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 18,
    padding: 12,
  },
  notifIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: THEME.purpleDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  notifTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  notifBody: { color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 17, marginTop: 1 },
  notifWhen: { color: THEME.textFaint, fontSize: 11, fontWeight: "700" },
  killBanner: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
    borderRadius: THEME.radiusSm,
    padding: 12,
    marginTop: 12,
  },
  killText: { color: THEME.orange, fontSize: 12, lineHeight: 17, flex: 1, fontWeight: "700" },
  errorCard: {
    backgroundColor: "rgba(236,72,153,0.10)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.35)",
    borderRadius: THEME.radiusSm,
    padding: 12,
    marginTop: 12,
  },
  errorText: { color: THEME.pink, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  historyTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  historySub: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  statusText: { color: THEME.textFaint, fontSize: 11, fontWeight: "800" },
  cancelBtn: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelBtnText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
});
