// bownd/lib/redemptions.ts
// Phase 6 fix notes (see FIX-PLAN.md):
// - validateAndRedeem is now a Firestore TRANSACTION (runTransaction):
//   the status check + NEW -> REDEEMED flip happen atomically, so two
//   simultaneous redeems of the same token cannot both succeed. The
//   previous getDoc + updateDoc pair had a race window.
// - Tokens use expo-crypto randomUUID() (cryptographic RNG), not
//   Math.random(). A redemption token is a bearer credential — it must
//   not be guessable.
// - The Firestore rules (firestore.rules) also enforce the NEW ->
//   REDEEMED transition with a restricted changed-keys set, so even a
//   client that bypasses this code cannot double-redeem.
import { requireDb } from "./firebase";
import {
  doc,
  serverTimestamp,
  setDoc,
  runTransaction,
} from "firebase/firestore";
import * as Crypto from "expo-crypto";

export type RedemptionStatus = "NEW" | "REDEEMED" | "EXPIRED";

export type RedemptionPayload = {
  token: string;
  experienceId: string;
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
};

function now() {
  return Date.now();
}

/** Cryptographically random token (expo-crypto). Never Math.random(). */
export function makeToken() {
  return Crypto.randomUUID();
}

export async function createRedemption(experienceId: string, ttlMinutes = 10) {
  const db = requireDb();
  const token = makeToken();
  const createdAt = now();
  const expiresAt = createdAt + ttlMinutes * 60 * 1000;

  const payload: RedemptionPayload = { token, experienceId, createdAt, expiresAt };

  await setDoc(doc(db, "redemptions", token), {
    experienceId,
    status: "NEW" as RedemptionStatus,
    createdAtServer: serverTimestamp(),
    createdAt,
    expiresAt,
    redeemedAt: null,
    redeemedAtServer: null,
    redeemedByDevice: null,
  });

  return payload;
}

/**
 * Atomically validate + redeem a token exactly once.
 * The transaction reads the token, checks status/expiry, and flips
 * NEW -> REDEEMED in one atomic step. Firestore retries the transaction
 * automatically on contention, so a concurrent redeem loses cleanly
 * (ALREADY_REDEEMED) instead of double-spending.
 */
export async function validateAndRedeem(token: string, deviceId: string) {
  const db = requireDb();
  const ref = doc(db, "redemptions", token);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists()) {
      return { ok: false as const, reason: "NOT_FOUND" as const };
    }

    const data = snap.data() as any;
    const status = data.status as RedemptionStatus;
    const expiresAt = data.expiresAt as number;

    if (status === "REDEEMED")
      return { ok: false as const, reason: "ALREADY_REDEEMED" as const };
    if (now() > expiresAt)
      return { ok: false as const, reason: "EXPIRED" as const };

    tx.update(ref, {
      status: "REDEEMED",
      redeemedAt: now(),
      redeemedAtServer: serverTimestamp(),
      redeemedByDevice: deviceId,
    });

    return { ok: true as const, experienceId: data.experienceId as string };
  });
}
