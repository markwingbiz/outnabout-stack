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
  /** Structural plan from forge-command (parsed_intent + steps). */
  plan_json: unknown;
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
  /** Task input (forge-command writes the input/output pair). */
  input: unknown;
  output: unknown;
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
  /** Exact action + target + content (design §5.2). Shown in detail. */
  payload: unknown;
  details: string | null;
  /** Approvals auto-expire 7 days after creation (design §5.2). */
  expires_at: string | null;
  worker_id: string | null;
  worker_name: string | null;
  task_name: string | null;
  funnel_id: string | null;
  funnel_name: string | null;
  deliverable_id: string | null;
  source: string | null;
  priority: string | null;
  requested_by: string | null;
  approved_by: string | null;
  reason: string | null;
  reviewer_notes: string | null;
  resolution: string | null;
  created_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  reviewed_at: string | null;
  decided_at: string | null;
};

export type FunnelRow = {
  id: string;
  name: string | null;
  slug: string | null;
  type: string | null;
  status: string | null;
  description: string | null;
  config?: Record<string, unknown> | null;
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

// ---------- Workers + Deliverables (Phase 8 Slice 2) ----------

/**
 * Post-Phase-A cutoff: the Deliverables screen shows only deliverables
 * created after Phase A merged (2026-10-14). The 6,719 Mar–May 2026
 * historical rows stay in the DB untouched and out of live views, per
 * Mark's standing decision. No runtime existed before Phase A that
 * could have written a deliverable, so this cutoff excludes only history.
 */
export const PHASE_A_CUTOFF_ISO = "2026-10-14T00:00:00Z";

/** Worker registry row (design §4.1). JSONB columns stay `unknown` — use the as* helpers. */
export type WorkerRow = {
  id: string;
  slug: string | null;
  name: string | null;
  role: string | null;
  short_role: string | null;
  description: string | null;
  category: string | null;
  capabilities: unknown;
  input_schema: unknown;
  output_schema: unknown;
  tools: unknown;
  queue_name: string | null;
  max_attempts: number | null;
  timeout_seconds: number | null;
  contract_version: string | null;
  model: string | null;
  temperature: number | null;
  system_prompt: string | null;
  config: unknown;
  requires_approval_for: unknown;
  status: string | null;
  last_run_at: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

/** Deliverable row (design §3). status: draft|ready|approved|published|rejected. */
export type DeliverableRow = {
  id: string;
  task_id: string | null;
  funnel_id: string | null;
  worker_id: string | null;
  worker_name: string | null;
  deliverable_type: string | null;
  title: string | null;
  summary: string | null;
  content: string | null;
  content_json: unknown;
  status: string | null;
  approval_id: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

// ---------- JSONB narrowing helpers (unknown -> safe values) ----------

/** Unknown -> string array (jsonb arrays of intent/tool/action strings). */
export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/** Unknown -> record (jsonb objects like metadata / config / content_json). */
export function asRecord(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}

/** Unknown -> display string. Objects/arrays become compact JSON. */
export function asDisplayString(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "—";
  }
}

/** Pretty JSON for content_json / metadata blocks. Falls back to a plain string. */
export function asPrettyJson(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return asDisplayString(v);
  }
}

// ---------- Worker contract (design §4.1 / §3.2) ----------

/**
 * Contract-complete per the dispatch eligibility rule (§3.2): slug,
 * input_schema, output_schema, and a non-empty tools array are present.
 * queue_name is shown separately in the checklist (the funnel-gate check
 * also requires it) but does not gate eligibility per §3.2.
 */
export function workerContractComplete(w: WorkerRow): boolean {
  return (
    Boolean(w.slug) &&
    w.input_schema != null &&
    w.output_schema != null &&
    asStringArray(w.tools).length > 0
  );
}

/** Dispatch-eligible: status 'active' AND contract complete. */
export function workerIsEligible(w: WorkerRow): boolean {
  return normalizeStatus(w.status) === "ACTIVE" && workerContractComplete(w);
}

/** Contract checklist lines for the worker detail view. */
export function workerContractChecklist(w: WorkerRow): { label: string; ok: boolean }[] {
  return [
    { label: "slug", ok: Boolean(w.slug) },
    { label: "input_schema", ok: w.input_schema != null },
    { label: "output_schema", ok: w.output_schema != null },
    { label: "tools (non-empty)", ok: asStringArray(w.tools).length > 0 },
    { label: "queue_name", ok: Boolean(w.queue_name) },
    { label: "max_attempts", ok: w.max_attempts != null },
    { label: "timeout_seconds", ok: w.timeout_seconds != null },
  ];
}

// ---------- Deliverable transitions (design §5.1) ----------

export type DeliverableTransition = "approve" | "publish" | "reject";

/** Which transitions the current status allows. */
export function transitionsForDeliverable(
  status: string | null | undefined,
): { transition: DeliverableTransition; label: string }[] {
  switch (normalizeStatus(status)) {
    case "READY":
      return [
        { transition: "approve", label: "Approve" },
        { transition: "reject", label: "Reject" },
      ];
    case "APPROVED":
      return [{ transition: "publish", label: "Publish" }];
    case "DRAFT":
      return [{ transition: "reject", label: "Reject" }];
    default:
      return []; // PUBLISHED / REJECTED are terminal
  }
}

export type DeliverableTransitionResponse = {
  deliverable?: DeliverableRow;
  deduped?: boolean;
  error?: string;
};

export type WorkerStatusResponse = {
  worker?: WorkerRow;
  deduped?: boolean;
  error?: string;
};
// ---------- Funnel detail + money-goal editing (Phase 8 Slice 3) ----------

/**
 * Canonical money rows: one per funnel — prefer the backfill_* mirror row,
 * else the first row. Same rule as funnels.tsx `canonicalMoney`. Used by
 * the command-center Home to sum verified revenue without double-counting
 * funnels that have several money_funnels rows.
 */
export function canonicalMoneyRows(rows: MoneyFunnelRow[]): MoneyFunnelRow[] {
  const byFunnel = new Map<string, MoneyFunnelRow[]>();
  for (const row of rows) {
    if (!row.funnel_id) continue;
    const list = byFunnel.get(row.funnel_id) ?? [];
    list.push(row);
    byFunnel.set(row.funnel_id, list);
  }
  const out: MoneyFunnelRow[] = [];
  for (const list of byFunnel.values()) {
    const canonical = list.find((r) => (r.key ?? "").startsWith("backfill_")) ?? list[0];
    if (canonical) out.push(canonical);
  }
  return out;
}

/** Assigned-worker summary from the forge-funnel `status` payload. */
export type FunnelStatusWorker = {
  id: string;
  slug: string | null;
  name: string | null;
  status: string | null;
  last_run_at: string | null;
};

/** Recent-job summary from the forge-funnel `status` payload. */
export type FunnelStatusJob = {
  id: string;
  job_type: string | null;
  status: string | null;
  title: string | null;
  created_at: string | null;
  completed_at: string | null;
  error_text: string | null;
};

/** Pending-approval summary from the forge-funnel `status` payload. */
export type FunnelStatusApproval = {
  id: string;
  status: string | null;
  request_type: string | null;
  title: string | null;
  created_at: string | null;
  expires_at: string | null;
};

/** Money-goal progress from the forge-funnel `status` payload (cents). */
export type FunnelMoneyGoal = {
  revenue_model: string | null;
  revenue_target_cents: number | null;
  verified_revenue_cents: number;
  spent_cents: number;
  budget_cents: number;
  currency: string;
  net_cents: number;
} | null;

/** Full payload of the forge-funnel `status` action. */
export type FunnelStatusPayload = {
  funnel: FunnelRow;
  money_funnels: MoneyFunnelRow[];
  money_goal: FunnelMoneyGoal;
  workers: FunnelStatusWorker[];
  recent_jobs: FunnelStatusJob[];
  pending_approvals: FunnelStatusApproval[];
};

/** Response of the forge-funnel `configure` action. */
export type FunnelConfigureResponse = {
  funnel_id: string;
  money_funnel_id: string;
  revenue_model: string;
  revenue_target_cents: number;
  created?: boolean;
  error?: string;
};

// ---------- Approvals helpers (Phase 8 Slice 4) ----------

/**
 * Human-readable requester label. forge-command / forge-funnel always set
 * requested_by to the calling operator's auth user id, so a bare UUID
 * fragment is never shown on its own: "Operator <short id>". Null (or a
 * literal system marker) means the approval was system-originated.
 */
export function requesterLabel(requestedBy: string | null | undefined): string {
  if (!requestedBy) return "Forge (system)";
  const lower = requestedBy.toLowerCase();
  if (lower === "forge" || lower === "system") return "Forge (system)";
  return `Operator ${requestedBy.slice(0, 8)}`;
}

/** Expiry state for a pending approval: past expiry, expiring < 24h, or null. */
export function approvalExpiryState(
  a: Pick<ApprovalRow, "status" | "expires_at">,
): "expired" | "expiring" | null {
  if (normalizeStatus(a.status) !== "PENDING" || !a.expires_at) return null;
  const ms = new Date(a.expires_at).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "expired";
  if (ms <= 24 * 60 * 60 * 1000) return "expiring";
  return null;
}

/** Decide an approval via forge-approve (shared by the inbox + detail screens). */
export async function decideApproval(
  approvalId: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<unknown> {
  return callForge("forge-approve", {
    approval_id: approvalId,
    decision,
    ...(reason ? { reason } : {}),
  });
}

// ---------- Audit log (Phase 8 Slice 4, design §5.3) ----------

/** forge_audit_log row (operator/admin read-only; Edge Functions write). */
export type AuditLogRow = {
  id: string;
  actor_user_id: string | null;
  actor_type: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  created_at: string | null;
};

/** Actor types recorded in forge_audit_log. */
export const AUDIT_ACTOR_TYPES = ["user", "forge", "worker", "system", "cron"] as const;

// ---------- Bownd mirror state (Phase 8 Slice 4, design §7.2) ----------

/** One bownd_mirror_state row per Firestore collection. */
export type BowndMirrorStateRow = {
  collection: string | null;
  last_seen_update_at: string | null;
  last_doc_id: string | null;
  last_sync_at: string | null;
  last_error: string | null;
};

// ---------- Job retry (Phase 8 Slice 4) ----------

/** Response of the forge-job-admin `retry` action. */
export type JobRetryResponse = {
  job?: ForgeJobRow;
  original_job_id?: string;
  task_ids?: string[];
  approval_ids?: string[];
  deduped?: boolean;
  error?: string;
};

// ---------- Polling (Phase 8 Slice 4, audit §12) ----------

/**
 * Short-interval polling for live-status screens (Forge / Jobs / Approvals
 * + detail screens). Polling is used instead of Supabase realtime
 * subscriptions because it works without any publication / REPLICA IDENTITY
 * setup; manual Refresh is always retained alongside it. The callback must
 * only update list state — never local input state (composer text).
 */
export function usePolling(callback: () => void, ms: number, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(callback, ms);
    return () => clearInterval(timer);
  }, [callback, ms, enabled]);
}

/** Poll interval for Forge / Jobs / Approvals list + detail screens. */
export const POLL_INTERVAL_MS = 30_000;
