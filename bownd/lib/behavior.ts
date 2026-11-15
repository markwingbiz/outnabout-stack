// bownd/lib/behavior.ts
// On-device behavior store — the v1 signal source for Tailored
// For You (owner model 2026-11-15: tailoring comes from what each
// person VIEWS and BUYS, never from a picked persona).
//
// Every action is a small record in AsyncStorage on this device:
// what was opened ("view") or saved ("save"), which event/venue it
// belonged to, and the event's taxonomy category (the same key
// space as events.tsx's eventCategoryKey: categoryForText buckets
// plus "holiday"). The list is bounded to the most recent 200
// actions — enough to rank favorite venues and categories without
// growing forever.
//
// SCOPE (v1, honest): views + saves only. Purchases are NOT
// recorded here — Stripe checkout completes outside the app, so a
// purchase is not reliably visible on-device; faking it would
// poison the ranking. Purchases join in the later account-based
// version, where the server record is the source of truth.
//
// This module is local-only by design: it NEVER imports
// @supabase/supabase-js and never touches the network. (The
// first-party analytics stream in lib/analytics.ts is the separate,
// server-bound copy of these same signals.)
import AsyncStorage from "@react-native-async-storage/async-storage";

export type BehaviorKind = "view" | "save";

export type BehaviorAction = {
  kind: BehaviorKind;
  eventId: string;
  venueId: string;
  category: string;
  ts: number;
};

const KEY = "BOWND_BEHAVIOR_V1";
const MAX_ACTIONS = 200;

function normalizeAction(a: any): BehaviorAction | null {
  if (!a || (a.kind !== "view" && a.kind !== "save")) return null;
  return {
    kind: a.kind,
    eventId: typeof a.eventId === "string" ? a.eventId : "",
    venueId: typeof a.venueId === "string" ? a.venueId : "",
    category: typeof a.category === "string" ? a.category : "",
    ts: typeof a.ts === "number" && Number.isFinite(a.ts) ? a.ts : 0,
  };
}

export async function loadBehavior(): Promise<BehaviorAction[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeAction)
      .filter((a): a is BehaviorAction => a !== null)
      .slice(-MAX_ACTIONS);
  } catch {
    return [];
  }
}

/**
 * Append one behavior action, keeping only the newest MAX_ACTIONS.
 * Fire-and-forget: recording must never block or break the screen
 * that triggered it, so all failures are swallowed.
 */
export async function recordBehavior(
  action: Omit<BehaviorAction, "ts"> & { ts?: number },
): Promise<void> {
  try {
    const entry: BehaviorAction = {
      kind: action.kind,
      eventId: action.eventId ?? "",
      venueId: action.venueId ?? "",
      category: action.category ?? "",
      ts: action.ts ?? Date.now(),
    };
    const existing = await loadBehavior();
    existing.push(entry);
    await AsyncStorage.setItem(KEY, JSON.stringify(existing.slice(-MAX_ACTIONS)));
  } catch {
    // silent fail — behavior is a ranking signal, never critical path
  }
}
