// Livework+ Dates — the date-planning side of the Relationship section
// (Phase 8 Slice 5). Replaces the old dating-app date planning entirely:
// no AsyncStorage saved ideas, no budget, no matching, no editorial
// date-idea list. Contents: out dates + thoughtful dates, alternating
// every other week (2 weeks apart), with next-date-due indicator,
// list + add form (type, scheduled date, plan, status planned/done, notes).
//
// Private — operator-gated (ForgeGate) and Mark's eyes only. All rows are
// created by Mark in this app; nothing is seeded. Writes go through
// direct Supabase client calls gated by the operator-only RLS policies
// from relationship-migration.sql. If the migration hasn't been run yet,
// the screen shows the friendly "run the migration" state, never crashes.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import TopTabs from "../../components/TopTabs";
import { Ionicons } from "@expo/vector-icons";
import {
  POLL_INTERVAL_MS,
  addDaysISO,
  dueLabel,
  formatDate,
  isMissingTableError,
  parseDateOnlyMs,
  todayISO,
  usePolling,
  type DueTone,
  type RelationshipDateRow,
} from "../../lib/forge";

type DateType = "out" | "thoughtful";

function dueColor(tone: DueTone): string {
  return tone === "overdue"
    ? THEME.pink
    : tone === "due"
      ? THEME.orange
      : tone === "soon"
        ? THEME.orange
        : THEME.green;
}

function dateTypeLabel(t: string | null | undefined): string {
  return t === "thoughtful" ? "Thoughtful date" : "Out date";
}

// Date-idea templates (reference layout). These are plan starters, not
// saved content: tapping one opens the plan-a-date form below with the
// title prefilled. No photos — the app ships no image assets.
const TEMPLATES: { icon: string; color: string; title: string; sub: string }[] = [
  {
    icon: "restaurant",
    color: THEME.purpleBright,
    title: "Dinner and walk",
    sub: "Enjoy a great meal and a scenic stroll.",
  },
  {
    icon: "cafe",
    color: THEME.pink,
    title: "Coffee and bookstore",
    sub: "Good coffee, great books, better conversation.",
  },
  {
    icon: "film",
    color: THEME.blue,
    title: "At-home movie night",
    sub: "Pick a classic, make snacks, and unwind together.",
  },
];

// Date Actions. Only Schedule Date has backing (it opens the real
// plan-a-date form). Save Idea / Set Budget / View Saved have no backing
// model — the old AsyncStorage versions were removed in Phase 8 — so
// they are visibly disabled with a reason, never dead buttons.
const DISABLED_ACTIONS: { icon: string; color: string; title: string; sub: string }[] = [
  { icon: "bookmark", color: THEME.pink, title: "Save Idea", sub: "Not built yet" },
  { icon: "wallet", color: THEME.blue, title: "Set Budget", sub: "Not built yet" },
  { icon: "list", color: THEME.green, title: "View Saved", sub: "Not built yet" },
];

export default function DatesScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <DatesContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function DatesContent() {
  const [dates, setDates] = useState<RelationshipDateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // The plan-a-date form mounts at the "All dates" section, far below the
  // fold. Tapping a template or Schedule Date used to set showForm with no
  // visible effect, because the form opened off-screen. Scroll to the form
  // whenever it opens so the tap visibly does something.
  const scrollViewRef = useRef<ScrollView>(null);
  const formAnchorY = useRef<number | null>(null);

  function openForm(prefillTitle?: string) {
    if (prefillTitle !== undefined) setTitle(prefillTitle);
    setShowForm(true);
  }

  useEffect(() => {
    if (showForm && formAnchorY.current !== null) {
      const y = Math.max(0, formAnchorY.current - 12);
      const t = setTimeout(() => scrollViewRef.current?.scrollTo({ y, animated: true }), 50);
      return () => clearTimeout(t);
    }
  }, [showForm]);

  const [dateType, setDateType] = useState<DateType>("out");
  const [scheduledDate, setScheduledDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const { data, error: qError } = await supabase
        .from("relationship_dates")
        .select("*")
        .order("scheduled_date", { ascending: false })
        .limit(100);
      if (qError) throw qError;
      setDates((data ?? []) as RelationshipDateRow[]);
      setMigrationMissing(false);
    } catch (e) {
      if (isMissingTableError(e)) {
        setMigrationMissing(true);
      } else {
        setError(e instanceof Error ? e.message : "Could not load dates.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePolling(() => void refresh(), POLL_INTERVAL_MS);

  const nextDate = useMemo(() => {
    if (dates.length === 0) return null;
    const sorted = [...dates].sort((a, b) =>
      String(b.scheduled_date ?? "").localeCompare(String(a.scheduled_date ?? "")),
    );
    const last = sorted[0];
    if (!last?.scheduled_date) return null;
    const due = addDaysISO(last.scheduled_date, 14);
    if (!due) return null;
    const nextType: DateType = last.date_type === "out" ? "thoughtful" : "out";
    return { due, last, nextType };
  }, [dates]);

  function resetForm() {
    setDateType("out");
    setScheduledDate(todayISO());
    setTitle("");
    setNotes("");
  }

  async function saveDate() {
    if (!supabase) return;
    setFormError(null);
    if (Number.isNaN(parseDateOnlyMs(scheduledDate))) {
      setFormError("Scheduled date must be YYYY-MM-DD.");
      return;
    }
    if (!title.trim()) {
      setFormError("Give the date a plan/title first.");
      return;
    }
    setSaving(true);
    try {
      const { error: e } = await supabase.from("relationship_dates").insert({
        date_type: dateType,
        scheduled_date: scheduledDate.trim(),
        title: title.trim(),
        notes: notes.trim() || null,
        status: "planned",
      });
      if (e) throw e;
      resetForm();
      setShowForm(false);
      await refresh();
    } catch (e) {
      if (isMissingTableError(e)) setMigrationMissing(true);
      else setFormError(e instanceof Error ? e.message : "Could not save date.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: RelationshipDateRow) {
    if (!supabase) return;
    const next = row.status === "done" ? "planned" : "done";
    try {
      const { error: e } = await supabase
        .from("relationship_dates")
        .update({ status: next })
        .eq("id", row.id);
      if (e) throw e;
      await refresh();
    } catch (e) {
      if (isMissingTableError(e)) setMigrationMissing(true);
      else setError(e instanceof Error ? e.message : "Could not update date.");
    }
  }

  const nextDue = nextDate ? dueLabel(nextDate.due) : null;

  return (
    <ScrollView
      ref={scrollViewRef}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Date Planning</Text>
          <Text style={styles.sub}>Curated ideas for meaningful connections.</Text>
        </View>
        <View style={styles.heartBadge}>
          <Ionicons name="heart" size={30} color={THEME.pink} />
        </View>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
        </Pressable>
      </View>
      <Text style={styles.cadence}>
        Out dates and thoughtful dates, alternating every other week — two dates a month, 2 weeks
        apart.
      </Text>
      <TopTabs />

      {!!formError && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      )}
      {!!error && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void refresh()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {migrationMissing ? (
        <View style={styles.card}>
          <Text style={styles.migrationTitle}>Run the Slice 5 migration</Text>
          <Text style={styles.migrationText}>
            The relationship tables don&apos;t exist yet. Run relationship-migration.sql in the
            Supabase SQL Editor, then pull to refresh. Nothing is lost — this screen only reads
            and writes those tables.
          </Text>
          <Pressable style={styles.addBtn} onPress={() => void refresh()}>
            <Text style={styles.addBtnText}>Check again</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator color={THEME.purpleBright} size="large" style={{ marginTop: 24 }} />
      ) : (
        <>
          {/* Date-idea templates — tapping one opens the plan form prefilled */}
          <Text style={styles.sectionTitle}>Date ideas</Text>
          <View style={styles.group}>
            {TEMPLATES.map((t) => (
              <Pressable
                key={t.title}
                style={styles.rowCard}
                onPress={() => {
                  openForm(t.title);
                }}
              >
                <View style={[styles.templateIcon, { backgroundColor: `${t.color}26` }]}>
                  <Ionicons name={t.icon as never} size={22} color={t.color} />
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.rowTitle}>{t.title}</Text>
                  <Text style={styles.rowSub}>{t.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={THEME.textFaint} />
              </Pressable>
            ))}
          </View>

          {/* Date Actions */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Date Actions</Text>
            <Text style={styles.cardSub}>Turn ideas into plans</Text>
            <View style={styles.actionGrid}>
              <Pressable style={styles.actionCard} onPress={() => openForm()}>
                <View style={[styles.actionIcon, { backgroundColor: `${THEME.purpleBright}26` }]}>
                  <Ionicons name="calendar" size={22} color={THEME.purpleBright} />
                </View>
                <Text style={styles.actionTitle}>Schedule Date</Text>
                <Text style={styles.actionSub}>Pick a time that works</Text>
                <Ionicons name="chevron-forward" size={16} color={THEME.textFaint} />
              </Pressable>
              {DISABLED_ACTIONS.map((a) => (
                <View key={a.title} style={[styles.actionCard, styles.actionDisabled]}>
                  <View style={[styles.actionIcon, { backgroundColor: `${a.color}26` }]}>
                    <Ionicons name={a.icon as never} size={22} color={a.color} />
                  </View>
                  <Text style={styles.actionTitle}>{a.title}</Text>
                  <Text style={styles.actionSub}>{a.sub}</Text>
                  <View style={styles.soonTag}>
                    <Text style={styles.soonText}>Soon</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.actionNote}>
              Save Idea, Set Budget, and View Saved need their backing — not built yet.
            </Text>
          </View>

          {/* Recommended — the next date the real cadence calls for */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Recommended</Text>
            {nextDate && nextDue ? (
              <>
                <Text style={[styles.dueText, { color: dueColor(nextDue.tone) }]}>
                  {nextDue.label} — {dateTypeLabel(nextDate.nextType)}
                </Text>
                <Text style={styles.meta}>
                  Last date {nextDate.last.scheduled_date} · {dateTypeLabel(nextDate.last.date_type)} ·{" "}
                  {nextDate.last.title || "untitled"}
                </Text>
                <Pressable style={styles.smallBtn} onPress={() => openForm()}>
                  <Text style={styles.smallBtnText}>Plan it →</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.muted}>
                No dates yet — pick a template above to plan your first.
              </Text>
            )}
          </View>

          <View
            style={styles.sectionHeader}
            onLayout={(e) => {
              formAnchorY.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.sectionTitle}>All dates</Text>
            <Pressable style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
              <Text style={styles.addBtnText}>{showForm ? "Cancel" : "+ Plan a date"}</Text>
            </Pressable>
          </View>
          {showForm && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.chips}>
                {(["out", "thoughtful"] as const).map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.chip, dateType === t && styles.chipActive]}
                    onPress={() => setDateType(t)}
                  >
                    <Text style={[styles.chipText, dateType === t && styles.chipTextActive]}>
                      {dateTypeLabel(t)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Scheduled date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={scheduledDate}
                onChangeText={setScheduledDate}
                placeholder="2026-10-24"
                placeholderTextColor={THEME.textFaint}
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>Plan / title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Dinner out, picnic, surprise at home…"
                placeholderTextColor={THEME.textFaint}
              />
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder="What would make this one land…"
                placeholderTextColor={THEME.textFaint}
                multiline
              />
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={() => void saveDate()}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save date"}</Text>
              </Pressable>
            </View>
          )}
          {dates.length === 0 ? (
            <Text style={styles.empty}>No dates yet.</Text>
          ) : (
            dates.map((d) => (
              <View key={d.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{d.title || "Untitled date"}</Text>
                  <Text style={styles.statusBadge}>{d.status === "done" ? "Done" : "Planned"}</Text>
                </View>
                <Text style={styles.meta}>
                  {dateTypeLabel(d.date_type)} · {d.scheduled_date ?? "—"}
                </Text>
                {!!d.notes && <Text style={styles.itemBody}>{d.notes}</Text>}
                <Text style={styles.meta}>Added {formatDate(d.created_at)}</Text>
                <Pressable style={styles.smallBtn} onPress={() => void toggleStatus(d)}>
                  <Text style={styles.smallBtnText}>
                    {d.status === "done" ? "Mark as planned" : "Mark as done"}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: { color: "#fff", fontSize: 26, fontWeight: "900", flex: 1 },
  refreshBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refreshText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  sub: { color: THEME.textMuted, fontSize: 12, lineHeight: 17 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 14,
    gap: 8,
  },
  errorCard: { borderColor: "rgba(236,72,153,0.5)" },
  errorText: { color: THEME.pink, fontSize: 13, lineHeight: 18 },
  retryText: { color: THEME.purpleBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
  migrationTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  migrationText: { color: THEME.textMuted, fontSize: 13, lineHeight: 19 },
  sectionLabel: { color: "#fff", fontSize: 14, fontWeight: "800" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  addBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  dueText: { fontSize: 18, fontWeight: "900" },
  meta: { color: THEME.textMuted, fontSize: 12 },
  muted: { color: THEME.textFaint, fontSize: 12 },
  empty: { color: THEME.textMuted, fontSize: 14, textAlign: "center", marginTop: 8 },
  fieldLabel: { color: "#fff", fontSize: 13, fontWeight: "800" },
  input: {
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  multiline: { minHeight: 64, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { borderColor: THEME.purpleBright, backgroundColor: "rgba(168,85,247,0.18)" },
  chipText: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: "#fff" },
  saveBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  itemTitle: { color: "#fff", fontSize: 15, fontWeight: "800", flex: 1 },
  itemBody: { color: "#fff", fontSize: 13, lineHeight: 19 },
  statusBadge: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  smallBtn: { alignSelf: "flex-start" },
  smallBtnText: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
  cadence: { color: THEME.textMuted, fontSize: 12, lineHeight: 17 },
  heartBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(232,121,249,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(232,121,249,0.4)",
  },
  cardSub: { color: THEME.textMuted, fontSize: 12, marginTop: 2 },
  group: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
    marginBottom: 8,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  templateIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1 },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  rowSub: { color: THEME.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  actionCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: THEME.radiusSm,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 12,
    gap: 6,
  },
  actionDisabled: { opacity: 0.55 },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  actionSub: { color: THEME.textMuted, fontSize: 11 },
  soonTag: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  soonText: { color: THEME.textMuted, fontSize: 10, fontWeight: "800" },
  actionNote: { color: THEME.textFaint, fontSize: 11, lineHeight: 15, marginTop: 10 },
});
