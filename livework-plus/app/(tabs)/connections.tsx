// Livework+ Connection — the relationship-maintenance side (Phase 8 Slice 5).
//
// This tab IS the Relationship section for Mark & Veronica. It replaces the
// old dating-app Connections stub entirely: no matching, no demo people,
// no app_users connections model. Contents: weekly check-ins (feelings +
// mental health + 1-10 "how are we doing" vs the 8/10 goal, with trend),
// gift ideas, and "Little things she says" notes.
//
// Private — operator-gated (ForgeGate) and Mark's eyes only. All rows are
// created by Mark in this app; nothing is seeded, shared, or sent anywhere.
// Writes go through direct Supabase client calls gated by the
// operator-only RLS policies from relationship-migration.sql. If the
// migration hasn't been run yet, the screen shows the friendly
// "run the migration" state and never crashes.
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
} from "react-native";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import ForgeGate from "../../components/ForgeGate";
import TopTabs from "../../components/TopTabs";
import {
  POLL_INTERVAL_MS,
  addDaysISO,
  dueLabel,
  formatDate,
  isMissingTableError,
  parseDateOnlyMs,
  ratingBar,
  todayISO,
  usePolling,
  type DueTone,
  type RelationshipCheckinRow,
  type RelationshipGiftIdeaRow,
  type RelationshipNoteRow,
} from "../../lib/forge";

const GOAL_RATING = 8;
const TREND_COUNT = 8;

function dueColor(tone: DueTone): string {
  return tone === "overdue"
    ? THEME.pink
    : tone === "due"
      ? THEME.orange
      : tone === "soon"
        ? THEME.orange
        : THEME.green;
}

export default function ConnectionScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ForgeGate>
        <ConnectionContent />
      </ForgeGate>
    </SafeAreaView>
  );
}

function ConnectionContent() {
  const [checkins, setCheckins] = useState<RelationshipCheckinRow[]>([]);
  const [gifts, setGifts] = useState<RelationshipGiftIdeaRow[]>([]);
  const [notes, setNotes] = useState<RelationshipNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [showGiftForm, setShowGiftForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [checkinDate, setCheckinDate] = useState(todayISO());
  const [feelings, setFeelings] = useState("");
  const [mentalHealth, setMentalHealth] = useState("");
  const [rating, setRating] = useState<number | null>(null);

  const [giftIdea, setGiftIdea] = useState("");
  const [giftNoteId, setGiftNoteId] = useState<string | null>(null);

  const [noteContent, setNoteContent] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const [c, g, n] = await Promise.all([
        supabase
          .from("relationship_checkins")
          .select("*")
          .order("checkin_date", { ascending: false })
          .limit(100),
        supabase
          .from("relationship_gift_ideas")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("relationship_notes")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      const firstError = c.error ?? g.error ?? n.error;
      if (firstError) throw firstError;
      setCheckins((c.data ?? []) as RelationshipCheckinRow[]);
      setGifts((g.data ?? []) as RelationshipGiftIdeaRow[]);
      setNotes((n.data ?? []) as RelationshipNoteRow[]);
      setMigrationMissing(false);
    } catch (e) {
      if (isMissingTableError(e)) {
        setMigrationMissing(true);
      } else {
        setError(e instanceof Error ? e.message : "Could not load connection data.");
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

  const nextCheckin = useMemo(() => {
    if (checkins.length === 0) return null;
    const sorted = [...checkins].sort((a, b) =>
      String(b.checkin_date ?? "").localeCompare(String(a.checkin_date ?? "")),
    );
    const last = sorted[0];
    if (!last?.checkin_date) return null;
    const due = addDaysISO(last.checkin_date, 7);
    if (!due) return null;
    return { due, last };
  }, [checkins]);

  const trend = useMemo(() => {
    const withRating = checkins.filter(
      (c) => typeof c.rating === "number" && c.checkin_date,
    );
    const sorted = [...withRating].sort((a, b) =>
      String(a.checkin_date ?? "").localeCompare(String(b.checkin_date ?? "")),
    );
    const recent = sorted.slice(-TREND_COUNT);
    if (recent.length === 0) return null;
    const avg = recent.reduce((sum, c) => sum + (c.rating ?? 0), 0) / recent.length;
    return { recent, avg };
  }, [checkins]);

  const notesById = useMemo(() => {
    const map = new Map<string, RelationshipNoteRow>();
    for (const n of notes) map.set(n.id, n);
    return map;
  }, [notes]);

  function resetCheckinForm() {
    setCheckinDate(todayISO());
    setFeelings("");
    setMentalHealth("");
    setRating(null);
  }

  async function saveCheckin() {
    if (!supabase) return;
    setFormError(null);
    if (Number.isNaN(parseDateOnlyMs(checkinDate))) {
      setFormError("Check-in date must be YYYY-MM-DD.");
      return;
    }
    if (rating === null) {
      setFormError("Pick a rating from 1 to 10.");
      return;
    }
    setSaving(true);
    try {
      const { error: e } = await supabase.from("relationship_checkins").insert({
        checkin_date: checkinDate.trim(),
        feelings_notes: feelings.trim() || null,
        mental_health_notes: mentalHealth.trim() || null,
        rating,
      });
      if (e) throw e;
      resetCheckinForm();
      setShowCheckinForm(false);
      await refresh();
    } catch (e) {
      if (isMissingTableError(e)) setMigrationMissing(true);
      else setFormError(e instanceof Error ? e.message : "Could not save check-in.");
    } finally {
      setSaving(false);
    }
  }

  async function saveGift() {
    if (!supabase) return;
    setFormError(null);
    if (!giftIdea.trim()) {
      setFormError("Write the gift idea first.");
      return;
    }
    setSaving(true);
    try {
      const { error: e } = await supabase.from("relationship_gift_ideas").insert({
        idea: giftIdea.trim(),
        note_id: giftNoteId,
        status: "idea",
      });
      if (e) throw e;
      setGiftIdea("");
      setGiftNoteId(null);
      setShowGiftForm(false);
      await refresh();
    } catch (e) {
      if (isMissingTableError(e)) setMigrationMissing(true);
      else setFormError(e instanceof Error ? e.message : "Could not save gift idea.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleGiftStatus(gift: RelationshipGiftIdeaRow) {
    if (!supabase) return;
    const next = gift.status === "given" ? "idea" : "given";
    try {
      const { error: e } = await supabase
        .from("relationship_gift_ideas")
        .update({ status: next })
        .eq("id", gift.id);
      if (e) throw e;
      await refresh();
    } catch (e) {
      if (isMissingTableError(e)) setMigrationMissing(true);
      else setError(e instanceof Error ? e.message : "Could not update gift idea.");
    }
  }

  async function saveNote() {
    if (!supabase) return;
    setFormError(null);
    if (!noteContent.trim()) {
      setFormError("Write the note first.");
      return;
    }
    setSaving(true);
    try {
      const { error: e } = await supabase.from("relationship_notes").insert({
        content: noteContent.trim(),
      });
      if (e) throw e;
      setNoteContent("");
      setShowNoteForm(false);
      await refresh();
    } catch (e) {
      if (isMissingTableError(e)) setMigrationMissing(true);
      else setFormError(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  }

  const nextDue = nextCheckin ? dueLabel(nextCheckin.due) : null;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Mark &amp; Veronica — 8/10 goal</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void refresh()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh ↻"}</Text>
        </Pressable>
      </View>
      <Text style={styles.sub}>
        Weekly check-ins, gift ideas, and little things she says. Private — operator only.
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
          {/* Next check-in due */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Next check-in due</Text>
            {nextCheckin && nextDue ? (
              <>
                <Text style={[styles.dueText, { color: dueColor(nextDue.tone) }]}>
                  {nextDue.label}
                </Text>
                <Text style={styles.meta}>
                  Last check-in {nextCheckin.last.checkin_date} · rated{" "}
                  {nextCheckin.last.rating ?? "—"}/10 · weekly cadence
                </Text>
              </>
            ) : (
              <Text style={styles.muted}>No check-ins yet — schedule your first check-in below.</Text>
            )}
          </View>

          {/* Check-ins */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Check-ins</Text>
            <Pressable style={styles.addBtn} onPress={() => setShowCheckinForm((v) => !v)}>
              <Text style={styles.addBtnText}>{showCheckinForm ? "Cancel" : "+ Add check-in"}</Text>
            </Pressable>
          </View>
          {showCheckinForm && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={checkinDate}
                onChangeText={setCheckinDate}
                placeholder="2026-10-15"
                placeholderTextColor={THEME.textFaint}
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>How are we doing? (1–10)</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <Pressable
                    key={n}
                    style={[styles.ratingChip, rating === n && styles.ratingChipActive]}
                    onPress={() => setRating(n)}
                  >
                    <Text style={[styles.ratingChipText, rating === n && styles.ratingChipTextActive]}>
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Her feelings</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={feelings}
                onChangeText={setFeelings}
                placeholder="What she shared about how she's feeling…"
                placeholderTextColor={THEME.textFaint}
                multiline
              />
              <Text style={styles.fieldLabel}>Mental health</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={mentalHealth}
                onChangeText={setMentalHealth}
                placeholder="What she shared about her mental health…"
                placeholderTextColor={THEME.textFaint}
                multiline
              />
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={() => void saveCheckin()}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save check-in"}</Text>
              </Pressable>
            </View>
          )}
          {trend && (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>
                Recent trend — average {trend.avg.toFixed(1)}/10 · goal {GOAL_RATING}/10
              </Text>
              {trend.recent.map((c) => (
                <View key={c.id} style={styles.trendRow}>
                  <Text style={styles.trendDate}>{c.checkin_date}</Text>
                  <Text style={styles.trendBar}>{ratingBar(c.rating ?? 0)}</Text>
                  <Text style={styles.trendRating}>{c.rating}/10</Text>
                </View>
              ))}
              <Text style={styles.meta}>
                {trend.avg >= GOAL_RATING
                  ? "At or above the 8/10 goal — keep it up."
                  : "Below the 8/10 goal — the next check-in is the place to close the gap."}
              </Text>
            </View>
          )}
          {checkins.length === 0 ? (
            <Text style={styles.empty}>No check-ins yet.</Text>
          ) : (
            checkins.map((c) => (
              <View key={c.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{c.checkin_date ?? "—"}</Text>
                  <Text style={styles.ratingBadge}>{c.rating ?? "—"}/10</Text>
                </View>
                {!!c.feelings_notes && (
                  <Text style={styles.itemBody}>Feelings: {c.feelings_notes}</Text>
                )}
                {!!c.mental_health_notes && (
                  <Text style={styles.itemBody}>Mental health: {c.mental_health_notes}</Text>
                )}
              </View>
            ))
          )}

          {/* Gift ideas */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Gift Ideas</Text>
            <Pressable style={styles.addBtn} onPress={() => setShowGiftForm((v) => !v)}>
              <Text style={styles.addBtnText}>{showGiftForm ? "Cancel" : "+ Add idea"}</Text>
            </Pressable>
          </View>
          {showGiftForm && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Idea</Text>
              <TextInput
                style={styles.input}
                value={giftIdea}
                onChangeText={setGiftIdea}
                placeholder="e.g. flowers, her favorite snack…"
                placeholderTextColor={THEME.textFaint}
              />
              <Text style={styles.fieldLabel}>Link to something she said (optional)</Text>
              {notes.length === 0 ? (
                <Text style={styles.muted}>No notes yet — add one below first.</Text>
              ) : (
                <View style={styles.noteChips}>
                  {notes.slice(0, 10).map((n) => (
                    <Pressable
                      key={n.id}
                      style={[styles.noteChip, giftNoteId === n.id && styles.noteChipActive]}
                      onPress={() => setGiftNoteId(giftNoteId === n.id ? null : n.id)}
                    >
                      <Text
                        style={[styles.noteChipText, giftNoteId === n.id && styles.noteChipTextActive]}
                        numberOfLines={2}
                      >
                        {n.content}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={() => void saveGift()}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save gift idea"}</Text>
              </Pressable>
            </View>
          )}
          {gifts.length === 0 ? (
            <Text style={styles.empty}>No gift ideas yet — add your first idea.</Text>
          ) : (
            gifts.map((g) => {
              const linked = g.note_id ? notesById.get(g.note_id) : undefined;
              return (
                <View key={g.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.itemTitle}>{g.idea}</Text>
                    <Text style={styles.statusBadge}>{g.status === "given" ? "Given" : "Idea"}</Text>
                  </View>
                  {!!linked?.content && (
                    <Text style={styles.itemBody}>From what she said: “{linked.content}”</Text>
                  )}
                  <Text style={styles.meta}>{formatDate(g.created_at)}</Text>
                  <Pressable style={styles.smallBtn} onPress={() => void toggleGiftStatus(g)}>
                    <Text style={styles.smallBtnText}>
                      {g.status === "given" ? "Mark as idea" : "Mark as given"}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}

          {/* Little things she says */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Little things she says</Text>
            <Pressable style={styles.addBtn} onPress={() => setShowNoteForm((v) => !v)}>
              <Text style={styles.addBtnText}>{showNoteForm ? "Cancel" : "+ Add note"}</Text>
            </Pressable>
          </View>
          {showNoteForm && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>What she said</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={noteContent}
                onChangeText={setNoteContent}
                placeholder="Something small she mentioned — a wish, a like, a worry…"
                placeholderTextColor={THEME.textFaint}
                multiline
              />
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={() => void saveNote()}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save note"}</Text>
              </Pressable>
            </View>
          )}
          {notes.length === 0 ? (
            <Text style={styles.empty}>No notes yet — add the first little thing she says.</Text>
          ) : (
            notes.map((n) => (
              <View key={n.id} style={styles.card}>
                <Text style={styles.itemBody}>“{n.content}”</Text>
                <Text style={styles.meta}>{formatDate(n.created_at)}</Text>
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
  title: { color: "#fff", fontSize: 22, fontWeight: "900", flex: 1 },
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
  ratingRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  ratingChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingChipActive: { borderColor: THEME.purpleBright, backgroundColor: "rgba(168,85,247,0.25)" },
  ratingChipText: { color: THEME.textMuted, fontSize: 13, fontWeight: "800" },
  ratingChipTextActive: { color: "#fff" },
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
  ratingBadge: { color: THEME.purpleBright, fontSize: 13, fontWeight: "900" },
  statusBadge: { color: THEME.textMuted, fontSize: 12, fontWeight: "800" },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  trendDate: { color: THEME.textMuted, fontSize: 12, width: 100 },
  trendBar: { color: THEME.purpleBright, fontSize: 12, flex: 1 },
  trendRating: { color: "#fff", fontSize: 12, fontWeight: "800" },
  noteChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  noteChip: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: "100%",
  },
  noteChipActive: { borderColor: THEME.purpleBright, backgroundColor: "rgba(168,85,247,0.18)" },
  noteChipText: { color: THEME.textMuted, fontSize: 12 },
  noteChipTextActive: { color: "#fff" },
  smallBtn: { alignSelf: "flex-start" },
  smallBtnText: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
});
