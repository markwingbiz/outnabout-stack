// bownd/lib/store.ts
// Firestore-backed data layer for Bownd.
//
// Phase 6 fix notes (see FIX-PLAN.md):
// - NO demo fallback: when Firestore is empty, unavailable, or
//   unconfigured, reads return []. Screens show an honest empty state
//   ("No events yet") instead of presenting bundled demo data as real.
// - The one-time demo seed (seedEventsIfEmpty) is DELETED. Bundled
//   data must never be written into Firestore as if it were real.
// - Points use Firestore increment() (atomic) instead of
//   read-modify-write. Redemption points + history are written in one
//   writeBatch so they cannot half-apply.
// - getFavorites strips the `event:` / `venue:` doc-id prefix so
//   FavoriteItem.id is always the bare event/venue id (previously the
//   prefixed doc id leaked into FavoriteItem.id, breaking detail links).
// - EventItem / Venue types live here now (data/events.ts + data/venues.ts
//   are deleted — nothing may import bundled demo data at runtime).
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  increment,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import { db } from "./firebase";
import { createRedemption, validateAndRedeem } from "./redemptions";
import type { PersonaProfile } from "./personaStore";

// ---------------------------------------------------------------------------
// Points & tiers (matches the Personal screen labels)
// ---------------------------------------------------------------------------

export const POINTS_PER_REDEMPTION = 50;
export const TIER_VIP_AT = 600;

export type Tier = "Explorer" | "VIP";

export function tierFor(points: number): Tier {
  return points >= TIER_VIP_AT ? "VIP" : "Explorer";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventItem = {
  id: string;
  title: string;
  venueId: string; // Firestore venue doc id, or a venue name for legacy docs
  startISO: string;
  category: "spotlight" | "featured" | "standard";
  vibeTags: string[];
  audienceTags: string[];
  priceLabel: string;
};

export type Venue = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  persona?: PersonaProfile;
  points: number;
  createdAt?: number;
  updatedAt?: number;
};

export type FavoriteItem = {
  id: string; // bare event/venue id — never the `kind:id` doc id
  kind: "event" | "venue";
  title: string;
  subtitle: string;
  when?: string;
  badge?: string;
};

export type RedemptionHistoryItem = {
  token: string;
  experienceId: string;
  redeemedAt: number;
  pointsAwarded: number;
};

const FAVS_KEY = "bownd_favorites_v1";
const DEVICE_KEY = "bownd_device_id_v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return "unknown-device";
  }
}

/** Extract the raw token from a `vibekc://redeem?token=...` URL or a bare token. */
export function extractToken(input: string): string {
  const v = input.trim();
  const m = v.match(/[?&]token=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return v;
}

function toEventItem(id: string, data: any): EventItem {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "Untitled event",
    venueId: typeof data.venueId === "string" ? data.venueId : "",
    startISO: typeof data.startISO === "string" ? data.startISO : new Date().toISOString(),
    category: data.category === "spotlight" || data.category === "featured" ? data.category : "standard",
    vibeTags: Array.isArray(data.vibeTags) ? data.vibeTags : [],
    audienceTags: Array.isArray(data.audienceTags) ? data.audienceTags : [],
    priceLabel: typeof data.priceLabel === "string" ? data.priceLabel : "",
  };
}

function toVenue(id: string, data: any): Venue {
  return {
    id,
    name: typeof data.name === "string" ? data.name : id,
    lat: typeof data.lat === "number" ? data.lat : 0,
    lng: typeof data.lng === "number" ? data.lng : 0,
  };
}

// ---------------------------------------------------------------------------
// Events & venues — Firestore only. Empty/unconfigured/error => [].
// ---------------------------------------------------------------------------

export async function fetchEvents(): Promise<EventItem[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, "events"));
    if (snap.empty) return [];
    return snap.docs.map((d) => toEventItem(d.id, d.data()));
  } catch {
    return [];
  }
}

export async function fetchVenues(): Promise<Venue[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, "venues"));
    if (snap.empty) return [];
    return snap.docs.map((d) => toVenue(d.id, d.data()));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// User profile & points
// ---------------------------------------------------------------------------

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    const d = snap.data() as any;
    return {
      uid,
      email: d.email ?? null,
      displayName: d.displayName ?? null,
      persona: d.persona ?? undefined,
      points: typeof d.points === "number" ? d.points : 0,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function saveUserProfile(
  uid: string,
  patch: Partial<Omit<UserProfile, "uid">>
): Promise<void> {
  if (!db) return;
  await setDoc(
    doc(db, "users", uid),
    { ...patch, updatedAt: Date.now(), updatedAtServer: serverTimestamp() },
    { merge: true }
  );
}

/** Create the user doc on first sign-in (points start at 0). No-op if it exists. */
export async function ensureUserProfile(
  uid: string,
  email: string | null,
  displayName: string | null
): Promise<void> {
  if (!db) return;
  const existing = await getUserProfile(uid);
  if (existing) return;
  await setDoc(doc(db, "users", uid), {
    email,
    displayName,
    points: 0,
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });
}

export async function getPoints(uid: string): Promise<number> {
  const p = await getUserProfile(uid);
  return p?.points ?? 0;
}

/**
 * Atomic points increment (server-side increment, no read-modify-write).
 * Returns the new balance (re-read), or 0 if the backend is unconfigured.
 */
export async function addPoints(uid: string, delta: number): Promise<number> {
  if (!db) return 0;
  try {
    await setDoc(
      doc(db, "users", uid),
      {
        points: increment(delta),
        updatedAt: Date.now(),
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
    const p = await getUserProfile(uid);
    return p?.points ?? 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Favorites (Firestore when signed in, AsyncStorage otherwise)
// ---------------------------------------------------------------------------

async function loadLocalFavorites(): Promise<FavoriteItem[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalFavorites(items: FavoriteItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FAVS_KEY, JSON.stringify(items));
  } catch {
    // silent fail
  }
}

export async function getFavorites(uid: string | null): Promise<FavoriteItem[]> {
  if (!uid || !db) return loadLocalFavorites();
  try {
    const snap = await getDocs(collection(db, "users", uid, "favorites"));
    if (snap.empty) return [];
    return snap.docs.map((d) => {
      const data = d.data() as any;
      // Doc id is `kind:id`; FavoriteItem.id must be the BARE id so
      // detail links work (previously the prefixed doc id leaked through).
      const bareId = d.id.replace(/^(event|venue):/, "");
      return {
        id: bareId,
        kind: data.kind === "venue" ? "venue" : "event",
        title: data.title ?? bareId,
        subtitle: data.subtitle ?? "",
        when: data.when,
        badge: data.badge,
      } as FavoriteItem;
    });
  } catch {
    return loadLocalFavorites();
  }
}

/**
 * Toggle a favorite. `item.id` must be the BARE event/venue id.
 * Returns true if the item is now favorited.
 */
export async function toggleFavorite(
  uid: string | null,
  item: FavoriteItem
): Promise<boolean> {
  if (!uid || !db) {
    const current = await loadLocalFavorites();
    const exists = current.some((f) => f.id === item.id && f.kind === item.kind);
    const next = exists
      ? current.filter((f) => !(f.id === item.id && f.kind === item.kind))
      : [...current, item];
    await saveLocalFavorites(next);
    return !exists;
  }

  const ref = doc(db, "users", uid, "favorites", `${item.kind}:${item.id}`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { ...item, createdAtServer: serverTimestamp() });
  return true;
}

export async function isFavorite(
  uid: string | null,
  kind: "event" | "venue",
  id: string
): Promise<boolean> {
  const favs = await getFavorites(uid);
  return favs.some((f) => f.kind === kind && f.id === id);
}

// ---------------------------------------------------------------------------
// Persona sync
// ---------------------------------------------------------------------------

export async function syncPersona(uid: string, persona: PersonaProfile): Promise<void> {
  await saveUserProfile(uid, { persona });
}

export async function loadPersonaFromProfile(
  uid: string
): Promise<PersonaProfile | null> {
  const p = await getUserProfile(uid);
  return p?.persona ?? null;
}

// ---------------------------------------------------------------------------
// QR tokens & redemption (Firestore-verified, atomic)
// ---------------------------------------------------------------------------

/**
 * Generate a verifiable QR payload. The token is stored in Firestore
 * (`redemptions` collection) so any device can validate it exactly once.
 * QR encodes `vibekc://redeem?token=...`.
 */
export async function generateQrToken(
  experienceId = "bownd-reward",
  ttlMinutes = 60 * 24 * 7
): Promise<{ token: string; qrValue: string }> {
  if (!db) {
    throw new Error(
      "Backend is not configured. Add the EXPO_PUBLIC_FIREBASE_* values to your .env and restart."
    );
  }
  const payload = await createRedemption(experienceId, ttlMinutes);
  return {
    token: payload.token,
    qrValue: `vibekc://redeem?token=${encodeURIComponent(payload.token)}`,
  };
}

export type RedeemResult =
  | { ok: true; experienceId: string; pointsAwarded: number }
  | {
      ok: false;
      reason: "NOT_FOUND" | "ALREADY_REDEEMED" | "EXPIRED" | "BACKEND_UNCONFIGURED" | "UNKNOWN";
    };

/**
 * Record a successful redemption for a signed-in user: points increment
 * + history row in ONE writeBatch (atomic — both or neither).
 * Returns the points awarded.
 */
export async function recordRedemption(
  uid: string,
  token: string,
  experienceId: string
): Promise<number> {
  if (!db) return 0;
  const batch = writeBatch(db);
  batch.set(
    doc(db, "users", uid),
    {
      points: increment(POINTS_PER_REDEMPTION),
      updatedAt: Date.now(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(doc(db, "users", uid, "redemptions", token), {
    token,
    experienceId,
    redeemedAt: Date.now(),
    redeemedAtServer: serverTimestamp(),
    pointsAwarded: POINTS_PER_REDEMPTION,
  });
  await batch.commit();
  return POINTS_PER_REDEMPTION;
}

/**
 * Validate + redeem a code exactly once. The token flip itself is a
 * Firestore transaction (see lib/redemptions.ts); points + history are
 * then recorded in one batch. Signed-in users earn points and get a
 * history record; guests can still validate without earning points.
 *
 * Edge case (fail-safe, no double-credit): if recordRedemption throws
 * after the token flip, the token stays REDEEMED and the caller gets
 * UNKNOWN — the user can re-scan and will see ALREADY_REDEEMED, and no
 * points are awarded twice.
 */
export async function redeemCode(
  input: string,
  uid: string | null
): Promise<RedeemResult> {
  if (!db) return { ok: false, reason: "BACKEND_UNCONFIGURED" };
  const token = extractToken(input);
  if (!token) return { ok: false, reason: "NOT_FOUND" };

  try {
    const deviceId = await getDeviceId();
    const res = await validateAndRedeem(token, deviceId);
    if (!res.ok) return { ok: false, reason: res.reason };

    let pointsAwarded = 0;
    if (uid) {
      pointsAwarded = await recordRedemption(uid, token, res.experienceId);
    }
    return { ok: true, experienceId: res.experienceId, pointsAwarded };
  } catch {
    return { ok: false, reason: "UNKNOWN" };
  }
}

/** Redemption history for the signed-in user (newest first). */
export async function getRedemptionHistory(
  uid: string
): Promise<RedemptionHistoryItem[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, "users", uid, "redemptions"));
    return snap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          token: d.id,
          experienceId: data.experienceId ?? "",
          redeemedAt: typeof data.redeemedAt === "number" ? data.redeemedAt : 0,
          pointsAwarded: typeof data.pointsAwarded === "number" ? data.pointsAwarded : 0,
        } as RedemptionHistoryItem;
      })
      .sort((a, b) => b.redeemedAt - a.redeemedAt);
  } catch {
    return [];
  }
}
