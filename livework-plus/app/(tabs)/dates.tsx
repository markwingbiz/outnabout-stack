// Livework+ Dates — Date Planning (Phase 5).
// Every action has a real handler backed by on-device storage
// (AsyncStorage, via lib/local-store.ts) — labeled "Saved on this device".
// Success is shown only after the storage write resolves. Nothing here
// claims server sync. Ideas are editorial suggestions, not fake data.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import TopTabs from "../../components/TopTabs";
import { THEME } from "../../lib/theme";
import {
  addSavedIdea,
  addScheduledDate,
  loadBudget,
  loadSavedIdeas,
  loadScheduledDates,
  saveBudget,
  type SavedIdea,
  type ScheduledDate,
} from "../../lib/local-store";

type Idea = { icon: string; title: string; sub: string; tint: string };

const IDEAS: Idea[] = [
  { icon: "restaurant", title: "Dinner and walk", sub: "Enjoy a great meal and a scenic stroll.", tint: "#8B5CF6" },
  { icon: "cafe", title: "Coffee and bookstore", sub: "Good coffee, great books, better conversation.", tint: "#38BDF8" },
  { icon: "film", title: "At-home movie night", sub: "Pick a classic, make snacks, and unwind together.", tint: "#F59E0B" },
];

const RECOMMENDATION: Idea = {
  icon: "business",
  title: "Rooftop dinner with city view",
  sub: "A rooftop table with a city view — good for a first or anniversary date.",
  tint: "#EC4899",
};

export default function DatesScreen() {
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledDate[]>([]);
  const [budget, setBudget] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedNote, setSchedNote] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const refreshSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const [ideas, dates, b] = await Promise.all([loadSavedIdeas(), loadScheduledDates(), loadBudget()]);
      setSavedIdeas(ideas);
      setScheduled(dates);
      setBudget(b);
      setBudgetInput(b);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  const isSaved = (title: string) => savedIdeas.some((i) => i.title === title);

  async function saveIdea(idea: { title: string; sub: string }) {
    if (isSaved(idea.title)) return;
    setSaving(true);
    try {
      const next = await addSavedIdea(idea);
      setSavedIdeas(next);
    } catch {
      Alert.alert("Could not save", "The idea was not saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onScheduleSave() {
    if (!schedTitle.trim() || !schedDate.trim()) {
      Alert.alert("Missing details", "Enter an idea and a date.");
      return;
    }
    setSaving(true);
    try {
      const next = await addScheduledDate({
        title: schedTitle.trim(),
        dateText: schedDate.trim(),
        note: schedNote.trim(),
      });
      setScheduled(next);
      setShowSchedule(false);
      setSchedTitle("");
      setSchedDate("");
      setSchedNote("");
    } catch {
      Alert.alert("Could not save", "The date was not saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onBudgetSave() {
    setSaving(true);
    try {
      await saveBudget(budgetInput.trim());
      setBudget(budgetInput.trim());
      setShowBudget(false);
    } catch {
      Alert.alert("Could not save", "The budget was not saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function onSaveIdeaAction() {
    const idea = IDEAS.find((i) => i.title === expandedTitle) ?? null;
    if (!idea) {
      Alert.alert("Select an idea first", "Tap an idea to open it, then save it.");
      return;
    }
    void saveIdea(idea);
  }

  function renderIdeaRow(idea: Idea) {
    const expanded = expandedTitle === idea.title;
    const saved = isSaved(idea.title);
    return (
      <View key={idea.title}>
        <Pressable
          style={styles.ideaRow}
          onPress={() => setExpandedTitle(expanded ? null : idea.title)}
        >
          <View style={styles.ideaPhoto}>
            <Ionicons name={idea.icon as never} size={26} color="#fff" />
          </View>
          <View style={[styles.ideaIcon, { backgroundColor: `${idea.tint}30` }]}>
            <Ionicons name={idea.icon as never} size={22} color={idea.tint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ideaTitle}>{idea.title}</Text>
            <Text style={styles.ideaSub}>{idea.sub}</Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={THEME.textFaint} />
        </Pressable>
        {expanded && (
          <View style={styles.expanded}>
            <Text style={styles.expandedText}>{idea.sub}</Text>
            <Pressable
              style={[styles.saveBtn, saved && styles.saveBtnDone]}
              onPress={() => void saveIdea(idea)}
              disabled={saved || saving}
            >
              <Text style={styles.saveBtnText}>{saved ? "Saved ✓" : saving ? "Saving…" : "Save Idea"}</Text>
            </Pressable>
            <Text style={styles.deviceNote}>Saved on this device.</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>
            Livework<Text style={styles.logoPlus}>+</Text>
          </Text>
          <View style={styles.avatar}>
            <Ionicons name="person" size={22} color="rgba(255,255,255,0.85)" />
          </View>
        </View>

        <TopTabs />

        {/* Date Planning hero */}
        <LinearGradient
          colors={["#2B1B5E", "#1A1038", "#14102A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Date Planning</Text>
            <Text style={styles.heroSub}>Curated ideas for meaningful connections</Text>
          </View>
          <View style={styles.heartWrap}>
            <Ionicons name="heart" size={36} color="#EC4899" />
          </View>
        </LinearGradient>

        {/* Date ideas */}
        <View style={styles.group}>{IDEAS.map((idea) => renderIdeaRow(idea))}</View>

        {/* Date Actions — all real, on-device */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Date Actions</Text>
          <Text style={styles.cardSub}>Turn ideas into plans · Saved on this device</Text>
          <View style={styles.actionGrid}>
            <Pressable style={styles.actionBtn} onPress={() => setShowSchedule((v) => !v)}>
              <View style={[styles.actionIcon, { backgroundColor: "#8B5CF630" }]}>
                <Ionicons name="calendar" size={22} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Schedule Date</Text>
                <Text style={styles.actionSub}>Pick a time that works</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={THEME.textFaint} />
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={onSaveIdeaAction}>
              <View style={[styles.actionIcon, { backgroundColor: "#EC489930" }]}>
                <Ionicons name="bookmark" size={22} color="#EC4899" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Save Idea</Text>
                <Text style={styles.actionSub}>Keep for later</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={THEME.textFaint} />
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => setShowBudget((v) => !v)}>
              <View style={[styles.actionIcon, { backgroundColor: "#38BDF830" }]}>
                <Ionicons name="wallet" size={22} color="#38BDF8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Set Budget</Text>
                <Text style={styles.actionSub}>Plan with clarity</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={THEME.textFaint} />
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={() => {
                setShowSaved((v) => !v);
                void refreshSaved();
              }}
            >
              <View style={[styles.actionIcon, { backgroundColor: "#34D39930" }]}>
                <Ionicons name="list" size={22} color="#34D399" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>View Saved</Text>
                <Text style={styles.actionSub}>See your ideas</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={THEME.textFaint} />
            </Pressable>
          </View>

          {showSchedule && (
            <View style={styles.form}>
              <Text style={styles.formLabel}>Idea</Text>
              <TextInput
                value={schedTitle}
                onChangeText={setSchedTitle}
                placeholder="e.g. Dinner and walk"
                placeholderTextColor={THEME.textFaint}
                style={styles.input}
              />
              <Text style={styles.formLabel}>Date</Text>
              <TextInput
                value={schedDate}
                onChangeText={setSchedDate}
                placeholder="e.g. Friday, 7:00 PM"
                placeholderTextColor={THEME.textFaint}
                style={styles.input}
              />
              <Text style={styles.formLabel}>Note (optional)</Text>
              <TextInput
                value={schedNote}
                onChangeText={setSchedNote}
                placeholder="Anything to remember"
                placeholderTextColor={THEME.textFaint}
                style={styles.input}
              />
              <Pressable style={styles.saveBtn} onPress={() => void onScheduleSave()} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Date"}</Text>
              </Pressable>
              <Text style={styles.deviceNote}>Saved on this device.</Text>
            </View>
          )}

          {showBudget && (
            <View style={styles.form}>
              <Text style={styles.formLabel}>Monthly date budget</Text>
              <TextInput
                value={budgetInput}
                onChangeText={(v) => setBudgetInput(v.replace(/[^0-9.]/g, ""))}
                placeholder="e.g. 200"
                placeholderTextColor={THEME.textFaint}
                style={styles.input}
                keyboardType="decimal-pad"
              />
              <Pressable style={styles.saveBtn} onPress={() => void onBudgetSave()} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Budget"}</Text>
              </Pressable>
              <Text style={styles.deviceNote}>Saved on this device.</Text>
            </View>
          )}

          {showSaved && (
            <View style={styles.savedBox}>
              {loadingSaved ? (
                <ActivityIndicator color={THEME.purpleBright} />
              ) : (
                <>
                  <Text style={styles.savedHeading}>Saved ideas</Text>
                  {savedIdeas.length === 0 ? (
                    <Text style={styles.savedEmpty}>Nothing saved yet.</Text>
                  ) : (
                    savedIdeas.map((i) => (
                      <Text key={i.title} style={styles.savedLine}>
                        • {i.title}
                      </Text>
                    ))
                  )}
                  <Text style={[styles.savedHeading, { marginTop: 12 }]}>Scheduled dates</Text>
                  {scheduled.length === 0 ? (
                    <Text style={styles.savedEmpty}>Nothing scheduled yet.</Text>
                  ) : (
                    scheduled.map((d, idx) => (
                      <Text key={`${d.title}-${idx}`} style={styles.savedLine}>
                        • {d.title} — {d.dateText}
                        {d.note ? ` (${d.note})` : ""}
                      </Text>
                    ))
                  )}
                  <Text style={[styles.savedHeading, { marginTop: 12 }]}>Budget</Text>
                  <Text style={styles.savedLine}>{budget ? `$${budget} / month` : "No budget set."}</Text>
                  <Text style={styles.deviceNote}>Saved on this device.</Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* Recommended */}
        <View style={styles.recoCard}>
          <View style={styles.recoPhoto}>
            <Ionicons name="business" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recoLabel}>Recommended for you</Text>
            <Text style={styles.recoTitle}>{RECOMMENDATION.title}</Text>
          </View>
          <Pressable
            style={styles.viewBtn}
            onPress={() => setExpandedTitle(expandedTitle === RECOMMENDATION.title ? null : RECOMMENDATION.title)}
          >
            <Text style={styles.viewText}>{expandedTitle === RECOMMENDATION.title ? "Hide" : "View"}</Text>
          </Pressable>
        </View>
        {expandedTitle === RECOMMENDATION.title && (
          <View style={[styles.card, { marginTop: 10 }]}>
            <Text style={styles.expandedText}>{RECOMMENDATION.sub}</Text>
            <Pressable
              style={[styles.saveBtn, isSaved(RECOMMENDATION.title) && styles.saveBtnDone]}
              onPress={() => void saveIdea(RECOMMENDATION)}
              disabled={isSaved(RECOMMENDATION.title) || saving}
            >
              <Text style={styles.saveBtnText}>
                {isSaved(RECOMMENDATION.title) ? "Saved ✓" : saving ? "Saving…" : "Save Idea"}
              </Text>
            </Pressable>
            <Text style={styles.deviceNote}>Saved on this device.</Text>
          </View>
        )}

        <View style={{ height: 12 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  logo: { color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  logoPlus: { color: THEME.purpleBright },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#3B2A63",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(168,85,247,0.5)",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: THEME.radius,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  heroSub: { color: THEME.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  heartWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(236,72,153,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.4)",
  },
  group: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: "hidden",
    marginBottom: 16,
  },
  ideaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  ideaPhoto: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: "#3B2A63",
    alignItems: "center",
    justifyContent: "center",
  },
  ideaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  ideaTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  ideaSub: { color: THEME.textMuted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  expanded: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  expandedText: { color: THEME.textMuted, fontSize: 13, lineHeight: 18 },
  saveBtn: {
    backgroundColor: THEME.purpleDeep,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  saveBtnDone: { backgroundColor: "rgba(52,211,153,0.25)" },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  deviceNote: { color: THEME.textFaint, fontSize: 11, marginTop: 2 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  cardSub: { color: THEME.textMuted, fontSize: 12, marginTop: 3, marginBottom: 14 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionBtn: {
    width: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(139,92,246,0.12)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.25)",
    padding: 12,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  actionSub: { color: THEME.textMuted, fontSize: 11, marginTop: 2 },
  form: { marginTop: 16, gap: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: 14 },
  formLabel: { color: THEME.textMuted, fontSize: 12, fontWeight: "700" },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    color: "#fff",
    fontSize: 15,
  },
  savedBox: { marginTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: 14, gap: 4 },
  savedHeading: { color: "#fff", fontSize: 13, fontWeight: "800" },
  savedEmpty: { color: THEME.textMuted, fontSize: 12 },
  savedLine: { color: THEME.textMuted, fontSize: 12, lineHeight: 17 },
  recoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 12,
  },
  recoPhoto: {
    width: 72,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#3B2A63",
    alignItems: "center",
    justifyContent: "center",
  },
  recoLabel: { color: THEME.purpleBright, fontSize: 12, fontWeight: "800" },
  recoTitle: { color: "#fff", fontSize: 14, fontWeight: "800", marginTop: 3 },
  viewBtn: {
    borderWidth: 1,
    borderColor: THEME.purpleBright,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewText: { color: THEME.purpleBright, fontWeight: "800", fontSize: 13 },
});
