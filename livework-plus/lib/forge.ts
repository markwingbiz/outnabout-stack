// Shared Forge client for Livework+.
// All Forge state changes go through the Edge Functions (forge-command,
// forge-approve, forge-funnel, forge-cleanup). Reads use Supabase
// PostgREST + RLS. No direct table writes from the UI for Forge state.
// No secrets, no hardcoded URLs except EXPO_PUBLIC_SUPABASE_URL.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// ---------- Row types (minimal, matching the Phase A migration) ----------

export type ForgeThreadRow = {
  id: string;
  owner_user_id: string | null;
  title: string | null;
  status: string | null;
  funnel_id: string | null;
  created_at: string | null;
};

export type ForgeJobRow = {
  id: string;
  thread_id: string | null;
  funnel_id: string | null;
  worker_id: string | null;
  job_type: string | null;
  title: string | null;
  detail: string | null;
  status: string;
  result_json: Record<string, unknown> | null;
  error_text: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type ForgeMessageRow = {
  id: string;
  thread_id: string | null;
  role: string;
  content: string;
  created_at: string;
};

export type ForgeTaskRow = {
  id: string;
  thread_id: string | null;
  forge_job_id: string | null;
  funnel_id: string | null;
  worker_id: string | null;
  task_type: string | null;
  title: string | null;
  status: string;
  step_index: number | null;
  approval_required: boolean | null;
  error_text: string | null;
};

export type ApprovalRow = {
  id: string;
  task_id: string | null;
  status: string | null;
  request_type: string | null;
  approval_type: string | null;
  title: string | null;
  summary: string | null;
  description: string | null;
  requested_by: string | null;
  approved_by: string | null;
  reason: string | null;
  created_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  reviewed_at: string | null;
  funnel_id: string | null;
};

export type FunnelRow = {
  id: string;
  name: string | null;
  slug: string | null;
  type: string | null;
  status: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MoneyFunnelRow = {
  id: string;
  key: string | null;
  name: string | null;
  funnel_id: string | null;
  revenue_model: string | null;
  currency: string | null;
  budget_cents: number | null;
  spent_cents: number | null;
  verified_revenue_cents: number | null;
  metadata: Record<string, unknown> | null;
};

// ---------- Small helpers ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Backend statuses are uppercase; live data may be lowercase. Normalize. */
export function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").toUpperCase();
}

/** Cents → "$X.XX". Null/undefined → "$0.00". */
export function formatCents(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/** Revenue target (cents) from a money_funnels row's metadata. */
export function moneyTargetCents(row: MoneyFunnelRow): number | null {
  const m = row.metadata;
  if (!m) return null;
  for (const key of ["revenue_target_cents", "target_cents", "revenue_target"]) {
    const v = m[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * UUID v4 for idempotency keys. Prefers crypto.randomUUID, falls back to a
 * Math.random-based v4 so Send is retry-safe on every runtime.
 */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------- Edge Function caller ----------

/**
 * POST to a Forge Edge Function with the signed-in user's Supabase Auth
 * JWT. Throws on missing session, missing config, or a non-OK response.
 */
export async function callForge<T>(
  fnName: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Could not read session: ${sessionError.message}`);
  if (!session) throw new Error("Sign in to use Forge.");
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error("EXPO_PUBLIC_SUPABASE_URL is not set.");
  const res = await fetch(`${baseUrl}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      isRecord(raw) && typeof raw.error === "string"
        ? raw.error
        : isRecord(raw) && typeof raw.message === "string"
          ? raw.message
          : `Forge function ${fnName} failed (${res.status}).`;
    throw new Error(message);
  }
  return raw as T;
}

// ---------- Operator role ----------

/** True when the user has role 'forge_operator' or 'admin', or profiles.is_admin. */
export async function checkIsOperator(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["forge_operator", "admin"]);
  const roleRows = (roles ?? []) as { role: string }[];
  if (roleRows.length > 0) return true;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  const prof = profile as { is_admin: boolean | null } | null;
  return prof?.is_admin === true;
}

export function useOperatorStatus(userId: string | undefined): {
  isOperator: boolean;
  checking: boolean;
} {
  const [state, setState] = useState({ isOperator: false, checking: Boolean(userId) });
  useEffect(() => {
    if (!userId) {
      setState({ isOperator: false, checking: false });
      return;
    }
    let alive = true;
    setState({ isOperator: false, checking: true });
    checkIsOperator(userId)
      .then((v) => {
        if (alive) setState({ isOperator: v, checking: false });
      })
      .catch(() => {
        if (alive) setState({ isOperator: false, checking: false });
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  return state;
}

// ---------- forge-funnel responses ----------

export type FunnelGate = { name: string; passed: boolean; detail?: string };

export type FunnelActionResponse = {
  funnel?: FunnelRow;
  status?: string;
  missing_gates?: string[];
  gates?: FunnelGate[];
  error?: string;
  message?: string;
};

/** Pull human-readable gate failures out of a forge-funnel response. */
export function extractGateFailures(resp: FunnelActionResponse): string[] {
  if (resp.missing_gates && resp.missing_gates.length > 0) return resp.missing_gates;
  if (resp.gates) {
    return resp.gates
      .filter((g) => !g.passed)
      .map((g) => (g.detail ? `${g.name}: ${g.detail}` : g.name));
  }
  if (resp.error) return [resp.error];
  return [];
}
