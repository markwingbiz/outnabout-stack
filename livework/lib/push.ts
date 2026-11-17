// Livework push notifications — client integration
// (push-notifications-plan.md Part 1). Owns: permission state, Expo push
// token capture/refresh, registration in the Supabase `push_tokens`
// registry, per-category preferences, Android notification channels, and
// notification-tap deep-link routing.
//
// Registry contract (plan §1.3): one row per account + app + device in
// `push_tokens`, upserted on (account_id, app, device_id), tenant_id set
// for the venue scope. The sender (the push-send Edge Function — the
// ONLY sender) reads categories from the row, never from client claims
// at send time. Uses the app's existing Supabase client (lib/supabase.ts).
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

// ---------- Constants ----------

export const PUSH_APP = "livework" as const;
export const PUSH_SCOPE = "venue" as const;

export type PushCategoryClass = "transactional" | "business";

export type PushCategoryDef = {
  key: string;
  label: string;
  description: string;
  klass: PushCategoryClass;
  /** Always-on categories are shown, not switched (plan §1.6/§2.2). */
  locked: boolean;
};

export const PUSH_CATEGORIES: PushCategoryDef[] = [
  {
    key: "venue_account",
    label: "Account & billing",
    description:
      "Verification decisions, payment failures and grace deadlines. Always on — grace deadlines decide whether your selling features stay live.",
    klass: "transactional",
    locked: true,
  },
  {
    key: "venue_sales",
    label: "Sales & placements",
    description: "First-sale alerts, placements ending, and your events being bundled into Bownd offers.",
    klass: "business",
    locked: false,
  },
  {
    key: "venue_reviews",
    label: "Reviews",
    description: "A new review posts on your venue.",
    klass: "business",
    locked: false,
  },
  {
    key: "venue_suggestions",
    label: "Event suggestions",
    description:
      "Suggestions for events your venue could run. Suggestions arrive during business hours (8:00 AM–9:00 PM) — ones that land overnight are held to the next morning.",
    klass: "business",
    locked: false,
  },
];

export type PushCategoryPrefs = Record<string, boolean>;

export function defaultCategoryPrefs(): PushCategoryPrefs {
  const out: PushCategoryPrefs = {};
  for (const c of PUSH_CATEGORIES) out[c.key] = true;
  return out;
}

const STORAGE = {
  deviceId: "livework.push.device_id",
  categories: "livework.push.categories",
} as const;

// ---------- Device id (per install; survives token rotation) ----------

function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let deviceIdCache: string | null = null;

export async function getPushDeviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  try {
    const existing = await AsyncStorage.getItem(STORAGE.deviceId);
    if (existing) {
      deviceIdCache = existing;
      return existing;
    }
  } catch {
    // Fall through and mint a fresh id.
  }
  const fresh = randomId();
  deviceIdCache = fresh;
  try {
    await AsyncStorage.setItem(STORAGE.deviceId, fresh);
  } catch {
    // Non-fatal: the in-memory id still keys this session's row.
  }
  return fresh;
}

// ---------- Category preferences ----------

export async function loadCategoryPrefs(): Promise<PushCategoryPrefs> {
  const defaults = defaultCategoryPrefs();
  try {
    const raw = await AsyncStorage.getItem(STORAGE.categories);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const c of PUSH_CATEGORIES) {
      if (typeof parsed[c.key] === "boolean") defaults[c.key] = parsed[c.key] as boolean;
    }
    return defaults;
  } catch {
    return defaults;
  }
}

let registrationAccountId: string | null = null;
let registrationTenantId: string | null = null;

export async function saveCategoryPref(key: string, value: boolean): Promise<PushCategoryPrefs> {
  const prefs = await loadCategoryPrefs();
  prefs[key] = value;
  try {
    await AsyncStorage.setItem(STORAGE.categories, JSON.stringify(prefs));
  } catch {
    // The registry write-through below still records the choice.
  }
  if (supabase && registrationAccountId) {
    try {
      const deviceId = await getPushDeviceId();
      await supabase
        .from("push_tokens")
        .update({ categories_enabled: prefs, updated_at: new Date().toISOString() })
        .eq("account_id", registrationAccountId)
        .eq("app", PUSH_APP)
        .eq("device_id", deviceId);
    } catch {
      // Best-effort: local prefs re-sync on the next registration refresh.
    }
  }
  return prefs;
}

// ---------- Permission ----------

export type PushPermissionState = "granted" | "denied" | "undetermined";

export async function getPushPermissionState(): Promise<PushPermissionState> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}

// ---------- Registration ----------

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

async function fetchExpoPushToken(): Promise<string | null> {
  try {
    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return typeof result.data === "string" ? result.data : null;
  } catch {
    // Simulators, missing credentials, Expo Go — no token, no row.
    return null;
  }
}

/**
 * Upserts this device's push_tokens row for the signed-in vendor.
 * No-ops (returns false) when Supabase is unconfigured, there is no
 * account, permission is not granted, or no token is available.
 */
export async function registerPushToken(
  accountId: string | null,
  tenantId: string | null,
): Promise<boolean> {
  if (!supabase || !accountId) return false;
  const permission = await getPushPermissionState();
  if (permission !== "granted") return false;
  const token = await fetchExpoPushToken();
  if (!token) return false;
  const deviceId = await getPushDeviceId();
  const prefs = await loadCategoryPrefs();
  const now = new Date().toISOString();
  const { error } = await supabase.from("push_tokens").upsert(
    {
      account_id: accountId,
      account_scope: PUSH_SCOPE,
      tenant_id: tenantId,
      app: PUSH_APP,
      platform: Platform.OS === "ios" ? "ios" : "android",
      device_id: deviceId,
      expo_push_token: token,
      categories_enabled: prefs,
      permission_status: "granted",
      device_timezone: deviceTimezone(),
      app_version: Constants.expoConfig?.version ?? null,
      last_seen_at: now,
      updated_at: now,
      disabled_at: null,
    },
    { onConflict: "account_id,app,device_id" },
  );
  if (error) return false;
  registrationAccountId = accountId;
  registrationTenantId = tenantId;
  return true;
}

/** Removes this device's registry row (master notifications switch off). */
export async function unregisterPushToken(accountId: string | null): Promise<void> {
  if (!supabase || !accountId) return;
  const deviceId = await getPushDeviceId();
  await supabase
    .from("push_tokens")
    .delete()
    .eq("account_id", accountId)
    .eq("app", PUSH_APP)
    .eq("device_id", deviceId);
  if (registrationAccountId === accountId) {
    registrationAccountId = null;
    registrationTenantId = null;
  }
}

/** Ask + register in one step (dashboard card / settings enable row). */
export async function requestAndRegisterPush(
  accountId: string | null,
  tenantId: string | null,
): Promise<PushPermissionState> {
  const next = await requestPushPermission();
  if (next === "granted") await registerPushToken(accountId, tenantId);
  return next;
}

// ---------- Deep links ----------

const ALLOWED_ROUTE_PREFIXES = [
  "/venues",
  "/venue-form",
  "/add-event",
  "/edit-event",
  "/redemptions",
  "/publish",
  "/verify-review",
  "/setup-venue",
  "/notification-settings",
] as const;

const HOME_ROUTE = "/";

/**
 * Validates a push payload's deep_link against Livework's real route
 * table. The dashboard ("/") is where Smart Suggestions live, so a
 * suggestion push lands there. Unknown links fall back to the dashboard
 * (plan §1.1) — a push tap never crashes and never opens an arbitrary URL.
 */
export function resolveDeepLink(data: unknown): string {
  const link =
    data && typeof data === "object" && typeof (data as { deep_link?: unknown }).deep_link === "string"
      ? ((data as { deep_link: string }).deep_link as string)
      : null;
  if (!link || !link.startsWith("/") || link.startsWith("//")) {
    if (link) console.warn("[push] Unrecognized deep link, falling back to dashboard:", link);
    return HOME_ROUTE;
  }
  if (link === "/") return link;
  const path = link.split("?")[0];
  const ok = ALLOWED_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (!ok) {
    console.warn("[push] Unrecognized deep link, falling back to dashboard:", link);
    return HOME_ROUTE;
  }
  return link;
}

// ---------- Bootstrap hook ----------

let handlerInstalled = false;

function installForegroundHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function installAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  for (const c of PUSH_CATEGORIES) {
    try {
      await Notifications.setNotificationChannelAsync(c.key, {
        name: c.label,
        importance:
          c.klass === "transactional"
            ? Notifications.AndroidImportance.HIGH
            : Notifications.AndroidImportance.DEFAULT,
      });
    } catch {
      // Channel creation is best-effort; sends still work without it.
    }
  }
}

/**
 * Mount once inside the root layout (within AuthProvider). Wires the
 * foreground handler, Android channels, tap routing (warm + cold start),
 * token capture on sign-in, and token-rotation refresh.
 */
export function usePushBootstrap(
  accountId: string | null,
  tenantId: string | null,
  navigate: (route: string) => void,
): void {
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    installForegroundHandler();
    void installAndroidChannels();

    let alive = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (alive && response) {
          navigateRef.current(resolveDeepLink(response.notification.request.content.data));
        }
      })
      .catch(() => {});

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateRef.current(resolveDeepLink(response.notification.request.content.data));
    });
    const tokenSub = Notifications.addPushTokenListener(() => {
      if (registrationAccountId) {
        void registerPushToken(registrationAccountId, registrationTenantId);
      }
    });
    return () => {
      alive = false;
      responseSub.remove();
      tokenSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!accountId) return;
    void registerPushToken(accountId, tenantId);
  }, [accountId, tenantId]);
}
