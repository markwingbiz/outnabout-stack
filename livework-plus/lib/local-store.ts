// On-device store for Livework+ personal planning (Dates tab) and the
// Notifications preference (Settings tab). AsyncStorage only — this is
// explicitly ON-DEVICE data, never claimed to be synced. Every caller
// shows success only after the write resolves.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SavedIdea = { title: string; sub: string; savedAt: string };
export type ScheduledDate = { title: string; dateText: string; note: string; savedAt: string };

const KEYS = {
  savedIdeas: "liveworkplus.saved_ideas",
  scheduledDates: "liveworkplus.scheduled_dates",
  dateBudget: "liveworkplus.date_budget",
  notifPref: "liveworkplus.notif_pref",
} as const;

async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function setJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function loadSavedIdeas(): Promise<SavedIdea[]> {
  return getJSON<SavedIdea[]>(KEYS.savedIdeas, []);
}

/** Appends an idea (deduped by title). Resolves only after the write. */
export async function addSavedIdea(idea: { title: string; sub: string }): Promise<SavedIdea[]> {
  const existing = await loadSavedIdeas();
  if (existing.some((i) => i.title === idea.title)) return existing;
  const next = [...existing, { ...idea, savedAt: new Date().toISOString() }];
  await setJSON(KEYS.savedIdeas, next);
  return next;
}

export async function loadScheduledDates(): Promise<ScheduledDate[]> {
  return getJSON<ScheduledDate[]>(KEYS.scheduledDates, []);
}

export async function addScheduledDate(d: { title: string; dateText: string; note: string }): Promise<ScheduledDate[]> {
  const existing = await loadScheduledDates();
  const next = [...existing, { ...d, savedAt: new Date().toISOString() }];
  await setJSON(KEYS.scheduledDates, next);
  return next;
}

export async function loadBudget(): Promise<string> {
  return getJSON<string>(KEYS.dateBudget, "");
}

export async function saveBudget(value: string): Promise<void> {
  await setJSON(KEYS.dateBudget, value);
}

export async function loadNotifPref(): Promise<boolean> {
  return getJSON<boolean>(KEYS.notifPref, true);
}

export async function saveNotifPref(value: boolean): Promise<void> {
  await setJSON(KEYS.notifPref, value);
}
