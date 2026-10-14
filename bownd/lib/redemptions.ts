// app/lib/redemptions.ts
import { requireDb } from "./firebase";
import {
  doc,
  serverTimestamp,
  setDoc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

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

export function makeToken() {
  return `${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}-${now()}`;
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

export async function validateAndRedeem(token: string, deviceId: string) {
  const db = requireDb();
  const ref = doc(db, "redemptions", token);
  const snap = await getDoc(ref);

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

  await updateDoc(ref, {
    status: "REDEEMED",
    redeemedAt: now(),
    redeemedAtServer: serverTimestamp(),
    redeemedByDevice: deviceId,
  });

  return { ok: true as const, experienceId: data.experienceId as string };
}
