// app/lib/store.ts
// Firestore-backed data layer for Bownd.
//
// Every read falls back to the bundled local data when Firestore is
// unavailable, empty, or unconfigured, so the app works offline and
// before the database is seeded. Writes require a configured backend
// (and a signed-in user where the security rules demand one).
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import { db } from "./firebase";
import { EVENTS, type EventItem } from "../data/events";
import { VENUES, type Venue } from "../data/venues";
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
  id: string;
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
// Events & venues
// ---------------------------------------------------------------------------

export async function fetchEvents(): Promise<EventItem[]> {
  if (!db) return EVENTS;
  try {
    const snap = await getDocs(collection(db, "events"));
    if (snap.empty) return EVENTS;
    return snap.docs.map((d) => toEventItem(d.id, d.data()));
  } catch {
    return EVENTS;
  }
}

export async function fetchVenues(): Promise<Venue[]> {
  if (!db) return VENUES;
  try {
    const snap = await getDocs(collection(db, "venues"));
    if (snap.empty) return VENUES;
    return snap.docs.map((d) => toVenue(d.id, d.data()));
  } catch {
    return VENUES;
  }
}

/**
 * One-time seed of the bundled demo events/venues into Firestore.
 * No-op when already seeded, when the backend is unconfigured, or on error.
 * Called after a user signs in (seeding requires an authenticated write).
 */
export async function seedEventsIfEmpty(): Promise<boolean> {
  if (!db) return false;
  try {
    const snap = await getDocs(collection(db, "events"));
    if (!snap.empty) return false;

    const batch = writeBatch(db);
    for (const e of EVENTS) {
      batch.set(doc(db, "events", e.id), {
        title: e.title,
        venueId: e.venueId,
        startISO: e.startISO,
        category: e.category,
        vibeTags: e.vibeTags,
        audienceTags: e.audienceTags,
        priceLabel: e.priceLabel,
        createdAtServer: serverTimestamp(),
      });
    }
    for (const v of VENUES) {
      batch.set(doc(db, "venues", v.id), {
        name: v.name,
        lat: v.lat,
        lng: v.lng,
        createdAtServer: serverTimestamp(),
      });
    }
    await batch.commit();
    return true;
  } catch {
    return false;
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

export async function addPoints(uid: string, delta: number): Promise<number> {
  if (!db) return 0;
  const p = await getUserProfile(uid);
  const next = (p?.points ?? 0) + delta;
  await saveUserProfile(uid, { points: next });
  return next;
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
      return {
        id: d.id,
        kind: data.kind === "venue" ? "venue" : "event",
        title: data.title ?? d.id,
        subtitle: data.subtitle ?? "",
        when: data.when,
        badge: data.badge,
      } as FavoriteItem;
    });
  } catch {
    return loadLocalFavorites();
  }
}

/** Toggle a favorite. Returns true if the item is now favorited. */
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
 * Validate + redeem a code exactly once (atomic status transition in
 * Firestore). Signed-in users earn points and get a history record;
 * guests can still validate without earning points.
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
      pointsAwarded = POINTS_PER_REDEMPTION;
      await addPoints(uid, POINTS_PER_REDEMPTION);
      await setDoc(doc(db, "users", uid, "redemptions", token), {
        token,
        experienceId: res.experienceId,
        redeemedAt: Date.now(),
        redeemedAtServer: serverTimestamp(),
        pointsAwarded,
      });
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
