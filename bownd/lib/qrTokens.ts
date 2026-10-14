import * as SecureStore from "expo-secure-store";

const STORE_KEY = "vibekc_qr_tokens_v1";

export type QrTokenRecord = {
  token: string;
  createdAtISO: string;
  redeemedAtISO?: string;
  offerId?: string;
  venueId?: string;
  valueCents?: number;
};

async function readAll(): Promise<Record<string, QrTokenRecord>> {
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeAll(map: Record<string, QrTokenRecord>) {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(map));
}

function randomToken() {
  return (
    "OAB-" +
    Math.random().toString(36).substring(2, 10).toUpperCase() +
    "-" +
    Math.random().toString(36).substring(2, 6).toUpperCase()
  );
}

export async function createQrToken(params?: {
  offerId?: string;
  venueId?: string;
  valueCents?: number;
}) {
  const token = randomToken();

  const record: QrTokenRecord = {
    token,
    createdAtISO: new Date().toISOString(),
    ...params,
  };

  const map = await readAll();
  map[token] = record;
  await writeAll(map);

  return record;
}

export async function getTokenRecord(token: string) {
  const map = await readAll();
  return map[token] ?? null;
}

export async function redeemToken(token: string) {
  const map = await readAll();
  const existing = map[token];

  if (!existing) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (existing.redeemedAtISO) {
    return { ok: false as const, reason: "already_redeemed" as const, record: existing };
  }

  const updated: QrTokenRecord = {
    ...existing,
    redeemedAtISO: new Date().toISOString(),
  };

  map[token] = updated;
  await writeAll(map);

  return { ok: true as const, record: updated };
}

export async function clearAllTokens() {
  await SecureStore.deleteItemAsync(STORE_KEY);
}
