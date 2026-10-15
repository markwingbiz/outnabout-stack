// _shared/helpers.ts — Shared helpers for the Forge Phase A Edge Functions.
//
// These functions verify the caller's Supabase Auth JWT themselves and
// enforce the forge_operator role in code. Deploy with plain:
//   supabase functions deploy <name>
// Do NOT use --no-verify-jwt (the gateway JWT check stays on as a second layer).
//
// Env vars used (all standard, auto-provided to Edge Functions):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// No other secrets. No LLM calls. No external sends.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type { SupabaseClient };

// ---------------------------------------------------------------- CORS ----

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Returns a Response for OPTIONS preflight, or null to continue. */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return null;
}

// -------------------------------------------------------------- Responses --

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/** Error with an HTTP status. Handlers catch this and return the status. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Standard handler wrapper: CORS + POST-only + HttpError mapping. */
export async function handleRequest(
  req: Request,
  handler: (req: Request) => Promise<Response>,
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    return await handler(req);
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.message, err.status);
    console.error("Unhandled error:", err);
    return errorResponse("Internal server error", 500);
  }
}

/** Parse a JSON object body. Throws HttpError(400) on invalid JSON. */
export async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "Body must be a JSON object");
    }
    return body as Record<string, unknown>;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "Invalid JSON body");
  }
}

// ------------------------------------------------------------------ Auth ---

export interface AuthedUser {
  id: string;
  email?: string;
  isAdmin: boolean;
  isOperator: boolean;
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export function getClients(): { anon: SupabaseClient; service: SupabaseClient } {
  const url = getEnv("SUPABASE_URL");
  const anon = createClient(url, getEnv("SUPABASE_ANON_KEY"));
  const service = createClient(url, getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { anon, service };
}

/**
 * Validate the caller's JWT and resolve their role.
 * Role check uses the service-role client (direct user_roles + profiles
 * lookups) so it does not depend on PostgREST grants for the
 * is_forge_operator() RPC. Admin = user_roles 'admin' OR profiles.is_admin.
 */
export async function authenticate(req: Request): Promise<{ user: AuthedUser; service: SupabaseClient }> {
  const { anon, service } = getClients();
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing Authorization Bearer token");
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid or expired JWT");
  const userId = data.user.id;
  const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
    service.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    service.from("profiles").select("is_admin").eq("id", userId).maybeSingle(),
  ]);
  const isAdmin = roleRow?.role === "admin" || profileRow?.is_admin === true;
  const isOperator = isAdmin || roleRow?.role === "forge_operator";
  return {
    user: { id: userId, email: data.user.email ?? undefined, isAdmin, isOperator },
    service,
  };
}

/** Authenticate AND require forge_operator (admin counts as operator). */
export async function requireOperator(req: Request): Promise<{ user: AuthedUser; service: SupabaseClient }> {
  const authed = await authenticate(req);
  if (!authed.user.isOperator) {
    throw new HttpError(403, "forge_operator role required");
  }
  return authed;
}

// ----------------------------------------------------------------- Audit ---

export interface AuditEntry {
  actorUserId: string | null;
  actorType: "user" | "forge" | "worker" | "system" | "cron";
  action: string;
  entityType: "forge_job" | "task" | "approval" | "deliverable" | "funnel" | "worker" | "thread";
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(service: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await service.from("forge_audit_log").insert({
    actor_user_id: entry.actorUserId,
    actor_type: entry.actorType,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    before: entry.before ?? {},
    after: entry.after ?? {},
    metadata: entry.metadata ?? {},
  });
  if (error) {
    console.error("forge_audit_log insert failed:", error);
    throw new Error(`Audit log write failed: ${error.message}`);
  }
}

// ----------------------------------------------------------- Idempotency ---

/** Look up a row by idempotency_key. Returns null when absent. */
export async function findByIdempotencyKey(
  service: SupabaseClient,
  table: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await service
    .from(table)
    .select("*")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw new Error(`Idempotency lookup failed on ${table}: ${error.message}`);
  return (data as Record<string, unknown> | null) ?? null;
}

// ------------------------------------------- Approval-gated classification --

export type GatedAction = "external_send" | "publish" | "spend" | "delete" | "production_change";

const GATED_KEYWORDS: Array<{ action: GatedAction; patterns: RegExp[] }> = [
  { action: "external_send", patterns: [/\bsend\b/, /\bemail\b/, /\bmessage\b/, /\btext\b/, /\boutreach\b/, /\bdm\b/] },
  { action: "publish", patterns: [/\bpublish\b/, /\bpost\b/, /\bgo live\b/] },
  { action: "spend", patterns: [/\bspend\b/, /\bpay\b/, /\bbuy\b/, /\bpurchase\b/, /\bcharge\b/] },
  { action: "delete", patterns: [/\bdelete\b/, /\bremove\b/] },
  { action: "production_change", patterns: [/\bdeploy\b/, /\bproduction\b/, /\bmerge\b/, /\bship\b/] },
];

/**
 * Structural keyword classification of a command's text into approval-gated
 * action classes. Keyword matching only — no LLM, no execution.
 * Known false-positive risk: ordinary words like "post" or "remove" in a
 * benign command will still gate the step. That is the safe direction:
 * a gated step waits for approval instead of running.
 */
export function classifyGatedActions(text: string): GatedAction[] {
  const lower = text.toLowerCase();
  const found: GatedAction[] = [];
  for (const { action, patterns } of GATED_KEYWORDS) {
    if (patterns.some((pattern) => pattern.test(lower))) found.push(action);
  }
  return found;
}

/** Map a funnel task_type to its gated action class, if any. */
export function taskTypeToGatedAction(taskType: string): GatedAction | null {
  const t = taskType.toLowerCase();
  if (t.includes("outreach_send") || t === "send" || t.includes("external_send")) return "external_send";
  if (t.includes("publish")) return "publish";
  if (t.includes("spend") || t.includes("purchase") || t.includes("payment")) return "spend";
  if (t.includes("delete")) return "delete";
  if (t.includes("deploy") || t.includes("production") || t.includes("merge")) return "production_change";
  return null;
}

// --------------------------------------------------------- Funnel gates ----

export interface FunnelGateDetails {
  workersAssigned: boolean;
  assignedWorkerCount: number;
  configPresent: boolean;
  moneyGoalPresent: boolean;
  contractsComplete: boolean;
  incompleteWorkers: string[];
  moneyRows: Array<{
    id: string;
    key: string | null;
    revenue_model: string | null;
    revenue_target_cents: number | null;
  }>;
}

export interface FunnelGateResult {
  ok: boolean;
  missing: string[];
  details: FunnelGateDetails;
}

/**
 * Revenue target for a money_funnels row.
 * SCHEMA NOTE: the Phase A migration does NOT create a revenue_target_cents
 * column on money_funnels. The target lives in metadata (metadata.
 * revenue_target_cents, metadata.target_cents, or metadata.revenue_target).
 */
export function getMoneyTarget(moneyRow: Record<string, unknown>): number | null {
  const md = (moneyRow.metadata as Record<string, unknown> | null) ?? {};
  const candidates = [md.revenue_target_cents, md.target_cents, md.revenue_target, md.revenueTargetCents];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && candidate > 0) return candidate;
    if (typeof candidate === "string" && Number(candidate) > 0) return Number(candidate);
  }
  return null;
}

/**
 * Check a funnel's activation gates:
 *  - workers: at least one worker assigned (worker_funnels status 'active',
 *    falling back to config.worker_slugs)
 *  - config: non-empty config with an objective and a trigger/schedule
 *  - money_goal: at least one linked money_funnels row with a non-null
 *    revenue_model AND a revenue target (see getMoneyTarget)
 *  - worker_contracts (only when includeContracts): every assigned worker
 *    has non-null input_schema, output_schema, tools, queue_name
 */
export async function checkFunnelGates(
  service: SupabaseClient,
  funnelId: string,
  opts?: { includeContracts?: boolean },
): Promise<FunnelGateResult> {
  const includeContracts = opts?.includeContracts ?? true;
  const { data: funnel } = await service
    .from("funnels")
    .select("id, config")
    .eq("id", funnelId)
    .maybeSingle();
  const config = ((funnel?.config as Record<string, unknown> | null) ?? {});

  // Workers assigned.
  const assignedWorkerIds = await getAssignedWorkerIds(service, funnelId);
  const workersAssigned = assignedWorkerIds.length > 0;

  // Config / schedule.
  const configPresent =
    typeof config === "object" &&
    config !== null &&
    Object.keys(config).length > 0 &&
    typeof config.objective === "string" &&
    (config.objective as string).length > 0 &&
    (config.trigger != null || config.schedule != null);

  // Money goal.
  const { data: moneyRowsRaw } = await service
    .from("money_funnels")
    .select("id, key, revenue_model, metadata, verified_revenue_cents, spent_cents, budget_cents, currency")
    .eq("funnel_id", funnelId);
  const moneyRows = ((moneyRowsRaw ?? []) as Array<Record<string, unknown>>).map((m) => ({
    id: String(m.id),
    key: (m.key as string | null) ?? null,
    revenue_model: (m.revenue_model as string | null) ?? null,
    revenue_target_cents: getMoneyTarget(m),
  }));
  const moneyGoalPresent = moneyRows.some((m) => m.revenue_model != null && m.revenue_target_cents != null);

  // Worker contracts.
  let contractsComplete = true;
  const incompleteWorkers: string[] = [];
  if (includeContracts) {
    if (assignedWorkerIds.length === 0) {
      contractsComplete = false;
    } else {
      const { data: workers } = await service
        .from("workers")
        .select("id, slug, name, input_schema, output_schema, tools, queue_name")
        .in("id", assignedWorkerIds);
      const found = (workers ?? []) as Array<Record<string, unknown>>;
      for (const w of found) {
        if (!w.input_schema || !w.output_schema || !w.tools || !w.queue_name) {
          contractsComplete = false;
          incompleteWorkers.push(String(w.slug ?? w.name ?? w.id));
        }
      }
      if (found.length < assignedWorkerIds.length) contractsComplete = false;
    }
  }

  const missing: string[] = [];
  if (!workersAssigned) missing.push("workers");
  if (!configPresent) missing.push("config");
  if (!moneyGoalPresent) missing.push("money_goal");
  if (includeContracts && !contractsComplete) missing.push("worker_contracts");

  return {
    ok: missing.length === 0,
    missing,
    details: {
      workersAssigned,
      assignedWorkerCount: assignedWorkerIds.length,
      configPresent,
      moneyGoalPresent,
      contractsComplete,
      incompleteWorkers,
      moneyRows,
    },
  };
}

/** Assigned worker ids for a funnel (worker_funnels status 'active', else config.worker_slugs). */
export async function getAssignedWorkerIds(
  service: SupabaseClient,
  funnelId: string,
): Promise<string[]> {
  const { data: assignments } = await service
    .from("worker_funnels")
    .select("worker_id, status")
    .eq("funnel_id", funnelId);
  const active = ((assignments ?? []) as Array<Record<string, unknown>>)
    .filter((a) => String(a.status ?? "").toLowerCase() === "active")
    .map((a) => String(a.worker_id))
    .filter(Boolean);
  if (active.length > 0) return active;
  const { data: funnel } = await service
    .from("funnels")
    .select("config")
    .eq("id", funnelId)
    .maybeSingle();
  const config = ((funnel?.config as Record<string, unknown> | null) ?? {});
  if (Array.isArray(config.worker_slugs) && config.worker_slugs.length > 0) {
    const { data: slugWorkers } = await service
      .from("workers")
      .select("id")
      .in("slug", config.worker_slugs as string[]);
    return ((slugWorkers ?? []) as Array<Record<string, unknown>>).map((w) => String(w.id));
  }
  return [];
}
