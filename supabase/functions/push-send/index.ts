// push-send — the ONLY push sender (push-notifications-plan.md §1.4).
//
// Every push in the system — system triggers, Forge loop jobs, webhook
// flows, and the Livework+ admin composer (§1.7) — goes through this
// function. Nothing else calls the Expo Push API. Every class rule in
// §1.6 (category opt-ins, quiet hours, the daily marketing cap) is
// enforced HERE, server-side, from push_tokens + notification_log —
// never from client claims at send time.
//
// POST actions:
//   Admin (operator JWT — forge_operator/admin, via requireOperator):
//     admin_state     {}                                   -> { admin_push_enabled }
//     audience_count  { audience, category }               -> { recipients }
//     test_send       { draft }                            -> { ok, recipients }
//     send            { draft, idempotency_key? }          -> { send_id, recipients }
//     schedule        { draft, send_at, idempotency_key? } -> { draft_id }
//     cancel_schedule { draft_id }                         -> { ok, draft_id }
//     list_scheduled  {}                                   -> { drafts: [...] }
//     list_history    { limit? }                           -> { sends: [...] }
//   Internal (service-role bearer OR operator JWT — the Forge loop and
//   server-side triggers; loop wiring itself is a later step):
//     enqueue         { sender_kind?, category, send_class, reason?,
//                       title?, body?, template_key?, deep_link?,
//                       audience? | recipient?, idempotency_key? }
//                                                          -> { send_id, recipients, held, suppressed }
//     dispatch_due    {}  — dispatch due push_drafts + release held
//                           quiet-hours sends whose window has opened
//     check_receipts  {}  — poll Expo receipts for unchecked tickets;
//                           DeviceNotRegistered disables the token row
//
// The draft shape and every admin response shape match the client
// contract in livework-plus/lib/pushAdmin.ts EXACTLY (same action
// names, same field names). The composer is a client of this function;
// there is no second sending path and the app never talks to Expo.
//
// Kill switch: push_config.admin_push_enabled (plan §1.7). While off,
// audience sends refuse (403) and scheduling is blocked; drafts,
// audience counts, history, and TEST SENDS TO THE OPERATOR'S OWN
// DEVICE still work, and dispatch_due skips admin drafts (they stay
// scheduled). Missing config row = fail closed (treated as off).
//
// Privacy: template sends (operator_private, catalog P8/P9) resolve
// their text from TEMPLATES below and log template_key ONLY — title
// and body are never written to notification_log for them (the table
// enforces it with a CHECK).
//
// Deploy with plain: supabase functions deploy push-send
// (gateway JWT check stays on as a second layer, as with forge-*).
// Env: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// (standard) + EXPO_ACCESS_TOKEN (optional until Expo enhanced push
// security is enabled; sent as the Authorization header when present).

import {
  HttpError,
  getClients,
  handleRequest,
  jsonResponse,
  parseJsonBody,
  requireOperator,
  type AuthedUser,
  type SupabaseClient,
} from "../_shared/helpers.ts";

// ---------------------------------------------------------------- Types ---

type App = "bownd" | "livework" | "livework_plus";
type SendClass = "marketing" | "transactional";

interface Audience {
  app: App;
  segment: string;
  account_ids?: string[];
}

interface Draft {
  title: string;
  body: string;
  audience: Audience;
  category: string;
  send_class: SendClass;
  reason: string | null;
  deep_link: string;
}

interface TokenRow {
  id: string;
  account_id: string;
  account_scope: string;
  tenant_id: string | null;
  app: string;
  expo_push_token: string;
  categories_enabled: Record<string, unknown> | null;
  device_timezone: string | null;
}

// ------------------------------------------------------------ Constants ---

const APPS: App[] = ["bownd", "livework", "livework_plus"];

const SEGMENTS_BY_APP: Record<App, string[]> = {
  bownd: ["all", "paid", "free", "specific"],
  livework: ["all", "venues", "specific"],
  livework_plus: ["all", "specific"],
};

const CATEGORIES_BY_APP: Record<App, string[]> = {
  bownd: ["tickets", "event_changes", "points", "perks_drops", "events_for_you", "offers_campaigns"],
  livework: ["venue_account", "venue_sales", "venue_reviews", "venue_suggestions"],
  livework_plus: ["operator_duty", "operator_private"],
};

const TRANSACTIONAL_REASONS = [
  "event_change",
  "cancellation",
  "refund_notice",
  "service_notice",
  "security_notice",
];

// Deep-link route tables (plan §1.6/§1.7): the picker offers only real
// routes (livework-plus/lib/pushAdmin.ts screensForApp + the Bownd
// client's ALLOWED_ROUTE_PREFIXES); the server re-validates here — an
// unresolvable route blocks the send. "" means no link.
const ROUTE_PREFIXES: Record<App, string[]> = {
  bownd: ["/detail", "/(tabs)/home", "/(tabs)/events", "/(tabs)/personal", "/(tabs)/persona", "/whats-close", "/list"],
  livework: ["/venues", "/redemptions", "/publish", "/events", "/settings"],
  livework_plus: ["/(tabs)"],
};

// Private-reminder templates (catalog P8/P9). HARD PRIVACY RULE: the
// wording is generic and content-free — no names, no details — and the
// log stores only the key. Text lives here, never in a request body.
const TEMPLATES: Record<string, { title: string; body: string }> = {
  weekly_check_in: { title: "Reminder", body: "Weekly check-in" },
  planned_date: { title: "Reminder", body: "Date night this week" },
};

const MARKETING_CAP_PER_DAY = 1; // plan §1.6, per account per app
const TITLE_MAX = 100;
const BODY_MAX = 500;
const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_CHUNK = 100;

// ---------------------------------------------------------------- Audit ---

async function auditPush(
  service: SupabaseClient,
  entry: {
    actorUserId: string | null;
    actorType: "user" | "system" | "cron";
    action: string;
    entityId: string;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await service.from("forge_audit_log").insert({
    actor_user_id: entry.actorUserId,
    actor_type: entry.actorType,
    action: entry.action,
    entity_type: "push_send",
    entity_id: entry.entityId,
    before: {},
    after: entry.after ?? {},
    metadata: entry.metadata ?? {},
  });
  if (error) {
    console.error("forge_audit_log insert failed:", error);
    throw new Error(`Audit log write failed: ${error.message}`);
  }
}

// ----------------------------------------------------------------- Auth ---

/** Internal actions: service-role bearer (loop/triggers) or an operator JWT. */
async function requireInternal(
  req: Request,
): Promise<{ service: SupabaseClient; operator: AuthedUser | null }> {
  const { service } = getClients();
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (token && serviceKey && token === serviceKey) {
    return { service, operator: null };
  }
  const { user } = await requireOperator(req); // throws 401/403 otherwise
  return { service, operator: user };
}

// ----------------------------------------------------------- Validation ---

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function validateAudience(raw: unknown): Audience {
  const a = asRecord(raw, "audience");
  const app = a.app;
  if (typeof app !== "string" || !(APPS as string[]).includes(app)) {
    throw new HttpError(400, "audience.app must be one of: bownd, livework, livework_plus");
  }
  const segment = a.segment;
  if (typeof segment !== "string" || !SEGMENTS_BY_APP[app as App].includes(segment)) {
    throw new HttpError(400, `audience.segment '${String(segment)}' is not valid for app '${app}'`);
  }
  const out: Audience = { app: app as App, segment };
  if (segment === "specific") {
    const ids = a.account_ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
      throw new HttpError(400, "audience.account_ids must be a non-empty array (max 500) for segment 'specific'");
    }
    const cleaned = [...new Set(ids.map((v) => String(v)).filter(Boolean))];
    if (cleaned.length === 0) throw new HttpError(400, "audience.account_ids is empty");
    out.account_ids = cleaned;
  }
  return out;
}

function validDeepLink(app: App, link: string): boolean {
  if (link === "") return true;
  if (!link.startsWith("/") || link.startsWith("//") || link.includes("://")) return false;
  const path = link.split("?")[0];
  if (path === "/") return app === "livework"; // Livework dashboard route
  return ROUTE_PREFIXES[app].some((p) => path === p || path.startsWith(`${p}/`));
}

function validateDraft(raw: unknown): Draft {
  const d = asRecord(raw, "draft");
  const title = typeof d.title === "string" ? d.title.trim() : "";
  if (!title || title.length > TITLE_MAX) {
    throw new HttpError(400, `draft.title is required (max ${TITLE_MAX} chars)`);
  }
  const bodyText = typeof d.body === "string" ? d.body.trim() : "";
  if (!bodyText || bodyText.length > BODY_MAX) {
    throw new HttpError(400, `draft.body is required (max ${BODY_MAX} chars)`);
  }
  const audience = validateAudience(d.audience);
  const category = typeof d.category === "string" ? d.category : "";
  if (!CATEGORIES_BY_APP[audience.app].includes(category)) {
    throw new HttpError(400, `draft.category '${category}' is not a category of app '${audience.app}'`);
  }
  const sendClass = d.send_class;
  if (sendClass !== "marketing" && sendClass !== "transactional") {
    throw new HttpError(400, "draft.send_class must be 'marketing' or 'transactional'");
  }
  let reason: string | null = null;
  if (sendClass === "transactional") {
    // §1.7: transactional requires a reason from the fixed list — there
    // is no free-form "transactional" label.
    if (typeof d.reason !== "string" || !TRANSACTIONAL_REASONS.includes(d.reason)) {
      throw new HttpError(
        400,
        `draft.reason is required for transactional sends and must be one of: ${TRANSACTIONAL_REASONS.join(", ")}`,
      );
    }
    reason = d.reason;
  }
  const deepLink = typeof d.deep_link === "string" ? d.deep_link : "";
  if (!validDeepLink(audience.app, deepLink)) {
    throw new HttpError(400, `draft.deep_link '${deepLink}' does not resolve to a route in ${audience.app}`);
  }
  return { title, body: bodyText, audience, category, send_class: sendClass, reason, deep_link: deepLink };
}

// --------------------------------------------------------- Local time -----

function isValidTz(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Recipient-local hour (0-23) + date key, computed on the DEVICE's tz. */
function localParts(tz: string | null, at: Date): { hour: number; dateKey: string } {
  const zone = tz && isValidTz(tz) ? tz : "America/Chicago";
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(at)) parts[p.type] = p.value;
  return {
    hour: parseInt(parts.hour ?? "0", 10) % 24,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Is `at` inside the send window for this category, recipient-local? */
function inSendWindow(category: string, tz: string | null, at: Date): boolean {
  const { hour } = localParts(tz, at);
  if (category === "venue_suggestions") return hour >= 8 && hour < 21; // L9 rule
  return hour < 22 && hour >= 8; // marketing quiet hours 22:00-08:00
}

// ------------------------------------------------------ Audience --------

async function paidCustomerIds(service: SupabaseClient): Promise<Set<string>> {
  // Paid = an active/grace customer subscription_tier entitlement
  // (access-provisioning-spec §3/§5; plan §1.7). The entitlements table
  // ships in the payments migration — until that lands, the query
  // errors and we degrade to "nobody is paid" (Free framing everywhere)
  // rather than guessing someone into the paid segment.
  const { data, error } = await service
    .from("entitlements")
    .select("account_id")
    .eq("account_scope", "customer")
    .eq("kind", "subscription_tier")
    .in("status", ["active", "grace"])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (error) {
    console.warn("entitlements lookup failed (paid segment = empty):", error.message);
    return new Set();
  }
  return new Set(((data ?? []) as Array<Record<string, unknown>>).map((r) => String(r.account_id)));
}

async function resolveTokens(service: SupabaseClient, audience: Audience): Promise<TokenRow[]> {
  let query = service
    .from("push_tokens")
    .select("id, account_id, account_scope, tenant_id, app, expo_push_token, categories_enabled, device_timezone")
    .eq("app", audience.app)
    .is("disabled_at", null)
    .eq("permission_status", "granted");
  if (audience.segment === "specific") {
    query = query.in("account_id", audience.account_ids ?? []);
  } else if (audience.app === "livework" && audience.segment === "venues") {
    query = query.eq("account_scope", "venue");
  }
  const { data, error } = await query;
  if (error) throw new Error(`Token resolution failed: ${error.message}`);
  let rows = (data ?? []) as unknown as TokenRow[];
  if (audience.app === "bownd" && (audience.segment === "paid" || audience.segment === "free")) {
    const paid = await paidCustomerIds(service);
    rows = rows.filter((r) => (audience.segment === "paid" ? paid.has(r.account_id) : !paid.has(r.account_id)));
  }
  return rows;
}

// --------------------------------------------------------- Send core ------

type Decision = "deliver" | "held_quiet_hours" | "held_cap" | "suppressed_opt_out";

async function marketingSentToday(service: SupabaseClient, token: TokenRow): Promise<number> {
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data } = await service
    .from("notification_log")
    .select("created_at")
    .eq("account_id", token.account_id)
    .eq("app", token.app)
    .eq("class", "marketing")
    .eq("status", "sent")
    .gte("created_at", since);
  const today = localParts(token.device_timezone, new Date()).dateKey;
  return ((data ?? []) as Array<Record<string, unknown>>).filter(
    (r) => localParts(token.device_timezone, new Date(String(r.created_at))).dateKey === today,
  ).length;
}

/**
 * The §1.6 gate, per recipient. Transactional sends are exempt from
 * opt-outs, quiet hours, and caps (with the catalog exceptions encoded
 * in producers' class choices); marketing sends are checked against the
 * REGISTRY's categories (never the request), the recipient-local
 * window, and the per-app daily cap — across ALL senders, admin incl.
 */
async function classify(
  service: SupabaseClient,
  token: TokenRow,
  category: string,
  sendClass: SendClass,
): Promise<Decision> {
  if (sendClass !== "marketing") return "deliver";
  const prefs = (token.categories_enabled ?? {}) as Record<string, unknown>;
  if (prefs[category] === false) return "suppressed_opt_out";
  if (!inSendWindow(category, token.device_timezone, new Date())) return "held_quiet_hours";
  if ((await marketingSentToday(service, token)) >= MARKETING_CAP_PER_DAY) return "held_cap";
  return "deliver";
}

interface ExpoTicket {
  status: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function expoPost(url: string, payload: unknown): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip",
  };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) throw new Error(`Expo API ${url} failed: HTTP ${res.status}`);
  return json;
}

async function expoSend(messages: Array<Record<string, unknown>>): Promise<ExpoTicket[]> {
  const tickets: ExpoTicket[] = [];
  for (let i = 0; i < messages.length; i += EXPO_CHUNK) {
    const chunk = messages.slice(i, i + EXPO_CHUNK);
    const json = await expoPost(EXPO_SEND_URL, chunk);
    const data = Array.isArray(json.data) ? (json.data as ExpoTicket[]) : [];
    tickets.push(...data);
  }
  return tickets;
}

async function disableToken(service: SupabaseClient, tokenId: string): Promise<void> {
  const { error } = await service
    .from("push_tokens")
    .update({ disabled_at: new Date().toISOString() })
    .eq("id", tokenId)
    .is("disabled_at", null);
  if (error) console.error("push_tokens disable failed:", error);
}

export interface SendResult {
  send_id: string;
  recipients: number; // messages Expo accepted (ticket ok)
  held: number;
  suppressed: number;
}

/**
 * Resolve -> classify -> log -> send -> record tickets. Log rows are
 * written BEFORE the Expo call (held/suppressed rows are final; deliver
 * rows start as 'sent' and are corrected to 'error' on a bad ticket) —
 * a crash mid-send leaves a visible row, never a silent push.
 */
async function executeSend(
  service: SupabaseClient,
  opts: {
    senderKind: "system" | "forge" | "admin";
    actor: string | null;
    title: string;
    body: string;
    category: string;
    sendClass: SendClass;
    reason: string | null;
    deepLink: string;
    templateKey?: string | null;
    tokens: TokenRow[];
    audienceDefinition: Record<string, unknown> | null;
    idempotencyKey?: string | null;
    /** Test sends to the operator's own device skip the class rules. */
    bypassClassRules?: boolean;
  },
): Promise<SendResult> {
  const sendId = crypto.randomUUID();
  const now = new Date();
  const decisions: Array<{ token: TokenRow; decision: Decision }> = [];
  for (const token of opts.tokens) {
    decisions.push({
      token,
      decision: opts.bypassClassRules
        ? "deliver"
        : await classify(service, token, opts.category, opts.sendClass),
    });
  }

  const isTemplate = Boolean(opts.templateKey);
  // Log row ids are minted here so ticket pairing is exact by
  // construction (rows from one insert share a created_at — ordering
  // by it could never pair tickets reliably).
  const rowIds = decisions.map(() => crypto.randomUUID());
  const rows = decisions.map(({ token, decision }, i) => ({
    id: rowIds[i],
    send_id: sendId,
    sender_kind: opts.senderKind,
    actor: opts.actor,
    account_id: token.account_id,
    account_scope: token.account_scope,
    app: token.app,
    tenant_id: token.tenant_id,
    audience_definition: opts.audienceDefinition,
    category: opts.category,
    class: opts.sendClass,
    reason: opts.reason,
    template_key: opts.templateKey ?? null,
    title: isTemplate ? null : opts.title,
    body: isTemplate ? null : opts.body,
    deep_link: opts.deepLink || null,
    push_token_id: token.id,
    status: decision === "deliver" ? "sent" : decision,
    idempotency_key: opts.idempotencyKey ?? null,
  }));
  if (rows.length > 0) {
    const { error } = await service.from("notification_log").insert(rows);
    if (error) throw new Error(`notification_log insert failed: ${error.message}`);
  }

  const deliver = decisions.filter((d) => d.decision === "deliver");
  let accepted = 0;
  if (deliver.length > 0) {
    const messages = deliver.map(({ token }) => ({
      to: token.expo_push_token,
      title: opts.title,
      body: opts.body,
      data: { deep_link: opts.deepLink, category: opts.category, send_id: sendId },
      channelId: opts.category,
      priority: opts.sendClass === "transactional" ? "high" : "default",
      sound: "default",
    }));
    const tickets = await expoSend(messages);
    const deliverIdx = decisions
      .map((d, i) => (d.decision === "deliver" ? i : -1))
      .filter((i) => i >= 0);
    for (let i = 0; i < deliver.length; i++) {
      const ticket = tickets[i];
      if (!ticket) break;
      const logId = rowIds[deliverIdx[i]];
      if (ticket.status === "ok" && ticket.id) {
        accepted++;
        await service.from("notification_log").update({ expo_ticket_id: ticket.id }).eq("id", logId);
      } else {
        const errCode = ticket.details?.error ?? "unknown";
        await service
          .from("notification_log")
          .update({
            status: "error",
            receipt_status: errCode === "DeviceNotRegistered" ? "device_not_registered" : `error:${errCode}`,
            receipt_checked_at: errCode === "DeviceNotRegistered" ? now.toISOString() : null,
          })
          .eq("id", logId);
        if (errCode === "DeviceNotRegistered") {
          await disableToken(service, deliver[i].token.id);
        }
      }
    }
  }

  return {
    send_id: sendId,
    recipients: accepted,
    held: decisions.filter((d) => d.decision !== "deliver" && d.decision !== "suppressed_opt_out").length,
    suppressed: decisions.filter((d) => d.decision === "suppressed_opt_out").length,
  };
}

/** Find a prior admin send/schedule by idempotency key (replay-safe). */
async function findAdminSendByKey(
  service: SupabaseClient,
  key: string,
): Promise<{ send_id: string; recipients: number } | null> {
  const { data } = await service
    .from("notification_log")
    .select("send_id, status")
    .eq("sender_kind", "admin")
    .eq("idempotency_key", key)
    .limit(1000);
  const rowsFound = (data ?? []) as Array<Record<string, unknown>>;
  if (rowsFound.length === 0) return null;
  return {
    send_id: String(rowsFound[0].send_id),
    recipients: rowsFound.filter((r) => r.status === "sent").length,
  };
}

async function adminPushEnabled(service: SupabaseClient): Promise<boolean> {
  const { data } = await service
    .from("push_config")
    .select("admin_push_enabled")
    .eq("id", 1)
    .maybeSingle();
  // Fail closed: no config row, no audience sends.
  return (data as Record<string, unknown> | null)?.admin_push_enabled === true;
}

// ------------------------------------------------------------- Actions ----

async function handleAudienceCount(service: SupabaseClient, body: Record<string, unknown>) {
  const audience = validateAudience(body.audience);
  const category = typeof body.category === "string" ? body.category : "";
  if (!CATEGORIES_BY_APP[audience.app].includes(category)) {
    throw new HttpError(400, `category '${category}' is not a category of app '${audience.app}'`);
  }
  const tokens = await resolveTokens(service, audience);
  // §1.7: the count is live tokens after opt-in filtering — an estimate
  // of devices, labeled as such in the composer.
  const recipients = tokens.filter(
    (t) => ((t.categories_enabled ?? {}) as Record<string, unknown>)[category] !== false,
  ).length;
  return jsonResponse({ recipients });
}

async function handleTestSend(service: SupabaseClient, user: AuthedUser, body: Record<string, unknown>) {
  const draft = validateDraft(body.draft);
  const { data, error } = await service
    .from("push_tokens")
    .select("id, account_id, account_scope, tenant_id, app, expo_push_token, categories_enabled, device_timezone")
    .eq("account_id", user.id)
    .eq("app", draft.audience.app)
    .is("disabled_at", null)
    .eq("permission_status", "granted");
  if (error) throw new Error(`Operator token lookup failed: ${error.message}`);
  const tokens = (data ?? []) as unknown as TokenRow[];
  if (tokens.length === 0) {
    throw new HttpError(
      400,
      `No registered ${draft.audience.app} device for your account. Open that app on your phone, sign in as yourself, and allow notifications first.`,
    );
  }
  // A test goes to the operator's own device(s) only and bypasses the
  // class rules — it must be able to prove delivery at any hour, or the
  // composer's mandatory-test gate (§1.7) could never be satisfied.
  const result = await executeSend(service, {
    senderKind: "admin",
    actor: user.id,
    title: draft.title,
    body: draft.body,
    category: draft.category,
    sendClass: draft.send_class,
    reason: draft.reason,
    deepLink: draft.deep_link,
    tokens,
    audienceDefinition: { ...draft.audience, test: true },
    bypassClassRules: true,
  });
  if (result.recipients === 0) {
    throw new HttpError(502, "Test send was not accepted by Expo. Check the device registration and try again.");
  }
  await auditPush(service, {
    actorUserId: user.id,
    actorType: "user",
    action: "push.test_send",
    entityId: result.send_id,
    metadata: { app: draft.audience.app, category: draft.category },
  });
  return jsonResponse({ ok: true, recipients: result.recipients });
}

async function handleSend(service: SupabaseClient, user: AuthedUser, body: Record<string, unknown>) {
  const draft = validateDraft(body.draft);
  const key = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
  if (key) {
    const prior = await findAdminSendByKey(service, key);
    if (prior) return jsonResponse(prior);
  }
  if (!(await adminPushEnabled(service))) {
    throw new HttpError(403, "Admin push is disabled (kill switch). Drafts and test sends still work.");
  }
  const tokens = await resolveTokens(service, draft.audience);
  const result = await executeSend(service, {
    senderKind: "admin",
    actor: user.id,
    title: draft.title,
    body: draft.body,
    category: draft.category,
    sendClass: draft.send_class,
    reason: draft.reason,
    deepLink: draft.deep_link,
    tokens,
    audienceDefinition: { ...draft.audience },
    idempotencyKey: key,
  });
  await auditPush(service, {
    actorUserId: user.id,
    actorType: "user",
    action: "push.send",
    entityId: result.send_id,
    after: { recipients: result.recipients, held: result.held, suppressed: result.suppressed },
    metadata: {
      app: draft.audience.app,
      segment: draft.audience.segment,
      category: draft.category,
      class: draft.send_class,
      reason: draft.reason,
    },
  });
  return jsonResponse({ send_id: result.send_id, recipients: result.recipients });
}

async function handleSchedule(service: SupabaseClient, user: AuthedUser, body: Record<string, unknown>) {
  const draft = validateDraft(body.draft);
  if (!(await adminPushEnabled(service))) {
    throw new HttpError(403, "Admin push is disabled (kill switch). Scheduling is blocked while it is off.");
  }
  const sendAt = typeof body.send_at === "string" ? new Date(body.send_at) : null;
  if (!sendAt || Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
    throw new HttpError(400, "send_at must be a future ISO timestamp");
  }
  const key = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
  if (key) {
    const { data } = await service.from("push_drafts").select("id").eq("idempotency_key", key).maybeSingle();
    if (data) return jsonResponse({ draft_id: String((data as Record<string, unknown>).id) });
  }
  const { data, error } = await service
    .from("push_drafts")
    .insert({
      actor: user.id,
      title: draft.title,
      body: draft.body,
      audience: draft.audience,
      category: draft.category,
      send_class: draft.send_class,
      reason: draft.reason,
      deep_link: draft.deep_link,
      send_at: sendAt.toISOString(),
      idempotency_key: key,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Schedule insert failed: ${error?.message ?? "unknown"}`);
  const draftId = String((data as Record<string, unknown>).id);
  await auditPush(service, {
    actorUserId: user.id,
    actorType: "user",
    action: "push.schedule",
    entityId: draftId,
    metadata: { app: draft.audience.app, segment: draft.audience.segment, send_at: sendAt.toISOString() },
  });
  return jsonResponse({ draft_id: draftId });
}

async function handleCancelSchedule(service: SupabaseClient, user: AuthedUser, body: Record<string, unknown>) {
  const draftId = typeof body.draft_id === "string" ? body.draft_id : "";
  if (!draftId) throw new HttpError(400, "draft_id is required");
  const { data } = await service.from("push_drafts").select("id, status").eq("id", draftId).maybeSingle();
  if (!data) throw new HttpError(404, "Scheduled push not found");
  const status = String((data as Record<string, unknown>).status);
  if (status !== "scheduled") throw new HttpError(409, `Scheduled push is already ${status}`);
  const { error } = await service.from("push_drafts").update({ status: "cancelled" }).eq("id", draftId);
  if (error) throw new Error(`Cancel failed: ${error.message}`);
  await auditPush(service, {
    actorUserId: user.id,
    actorType: "user",
    action: "push.cancel_schedule",
    entityId: draftId,
  });
  return jsonResponse({ ok: true, draft_id: draftId });
}

async function handleListScheduled(service: SupabaseClient) {
  const { data, error } = await service
    .from("push_drafts")
    .select("id, title, audience, send_at, send_class")
    .eq("status", "scheduled")
    .order("send_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`list_scheduled failed: ${error.message}`);
  const drafts = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const aud = (r.audience ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id),
      title: String(r.title ?? "Untitled"),
      app: typeof aud.app === "string" ? aud.app : "bownd",
      segment: typeof aud.segment === "string" ? aud.segment : "all",
      send_at: String(r.send_at ?? ""),
      send_class: r.send_class === "transactional" ? "transactional" : "marketing",
    };
  });
  return jsonResponse({ drafts });
}

async function handleListHistory(service: SupabaseClient, body: Record<string, unknown>) {
  const limitRaw = typeof body.limit === "number" ? body.limit : 20;
  const limit = Math.max(1, Math.min(100, Math.floor(limitRaw)));
  const { data, error } = await service
    .from("notification_log")
    .select("send_id, title, audience_definition, status, created_at")
    .eq("sender_kind", "admin")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`list_history failed: ${error.message}`);
  interface Group {
    id: string;
    title: string;
    app: string;
    segment: string | null;
    recipients: number;
    statuses: string[];
    created_at: string;
  }
  const groups = new Map<string, Group>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const aud = (r.audience_definition ?? {}) as Record<string, unknown>;
    if (aud.test === true) continue; // test sends are not history
    const sendId = String(r.send_id);
    let g = groups.get(sendId);
    if (!g) {
      g = {
        id: sendId,
        title: typeof r.title === "string" ? r.title : "Untitled",
        app: typeof aud.app === "string" ? aud.app : "bownd",
        segment: typeof aud.segment === "string" ? aud.segment : null,
        recipients: 0,
        statuses: [],
        created_at: String(r.created_at),
      };
      groups.set(sendId, g);
    }
    if (r.status === "sent") g.recipients++;
    g.statuses.push(String(r.status));
    if (String(r.created_at) < g.created_at) g.created_at = String(r.created_at);
  }
  const sends = [...groups.values()].slice(0, limit).map((g) => ({
    id: g.id,
    title: g.title,
    app: g.app,
    segment: g.segment,
    recipients: g.recipients,
    status: g.statuses.includes("sent")
      ? "sent"
      : g.statuses.includes("held_quiet_hours")
      ? "held_quiet_hours"
      : g.statuses.includes("held_cap")
      ? "held_cap"
      : g.statuses.includes("error")
      ? "error"
      : "suppressed_opt_out",
    created_at: g.created_at,
  }));
  return jsonResponse({ sends });
}

// -------------------------------------------------- Internal actions ------

async function handleEnqueue(service: SupabaseClient, body: Record<string, unknown>) {
  const senderKind = body.sender_kind === "forge" ? "forge" : "system";
  const templateKey = typeof body.template_key === "string" ? body.template_key : null;

  let audience: Audience;
  let title: string;
  let bodyText: string;
  if (templateKey) {
    const tpl = TEMPLATES[templateKey];
    if (!tpl) throw new HttpError(400, `Unknown template_key: ${templateKey}`);
    const recipient = asRecord(body.recipient, "recipient");
    if (recipient.app !== "livework_plus" || typeof recipient.account_id !== "string" || !recipient.account_id) {
      throw new HttpError(400, "Template sends require recipient { account_id, app: 'livework_plus' }");
    }
    audience = { app: "livework_plus", segment: "specific", account_ids: [recipient.account_id] };
    title = tpl.title;
    bodyText = tpl.body;
  } else {
    if (body.audience != null) {
      audience = validateAudience(body.audience);
    } else if (body.recipient != null) {
      const recipient = asRecord(body.recipient, "recipient");
      audience = validateAudience({
        app: recipient.app,
        segment: "specific",
        account_ids: [recipient.account_id],
      });
    } else {
      throw new HttpError(400, "enqueue requires an audience or a recipient");
    }
    title = typeof body.title === "string" ? body.title.trim() : "";
    bodyText = typeof body.body === "string" ? body.body.trim() : "";
    if (!title || title.length > TITLE_MAX || !bodyText || bodyText.length > BODY_MAX) {
      throw new HttpError(400, `enqueue requires title (max ${TITLE_MAX}) and body (max ${BODY_MAX})`);
    }
  }

  const category = templateKey ? "operator_private" : typeof body.category === "string" ? body.category : "";
  if (!CATEGORIES_BY_APP[audience.app].includes(category)) {
    throw new HttpError(400, `category '${category}' is not a category of app '${audience.app}'`);
  }
  const sendClass = body.send_class;
  if (sendClass !== "marketing" && sendClass !== "transactional") {
    throw new HttpError(400, "send_class must be 'marketing' or 'transactional'");
  }
  let reason: string | null = null;
  if (sendClass === "transactional") {
    if (typeof body.reason !== "string" || !TRANSACTIONAL_REASONS.includes(body.reason)) {
      throw new HttpError(400, `Transactional sends require a reason: ${TRANSACTIONAL_REASONS.join(", ")}`);
    }
    reason = body.reason;
  }
  const deepLink = typeof body.deep_link === "string" ? body.deep_link : "";
  if (!validDeepLink(audience.app, deepLink)) {
    throw new HttpError(400, `deep_link '${deepLink}' does not resolve to a route in ${audience.app}`);
  }

  const key = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
  if (key) {
    const { data } = await service
      .from("notification_log")
      .select("send_id, status")
      .eq("idempotency_key", key)
      .limit(1000);
    const prior = (data ?? []) as Array<Record<string, unknown>>;
    if (prior.length > 0) {
      return jsonResponse({
        send_id: String(prior[0].send_id),
        recipients: prior.filter((r) => r.status === "sent").length,
        held: 0,
        suppressed: 0,
        replayed: true,
      });
    }
  }

  const tokens = await resolveTokens(service, audience);
  const result = await executeSend(service, {
    senderKind,
    actor: null,
    title,
    body: bodyText,
    category,
    sendClass,
    reason,
    deepLink,
    templateKey,
    tokens,
    audienceDefinition: body.audience != null ? { ...audience } : null,
    idempotencyKey: key,
  });
  return jsonResponse(result);
}

async function handleDispatchDue(service: SupabaseClient) {
  const enabled = await adminPushEnabled(service);
  const nowIso = new Date().toISOString();
  let dispatched = 0;
  let failed = 0;

  const { data: draftsData } = await service
    .from("push_drafts")
    .select("id, actor, title, body, audience, category, send_class, reason, deep_link")
    .eq("status", "scheduled")
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(50);
  const drafts = (draftsData ?? []) as Array<Record<string, unknown>>;
  if (enabled) {
    for (const d of drafts) {
      try {
        const audience = validateAudience(d.audience);
        const tokens = await resolveTokens(service, audience);
        const result = await executeSend(service, {
          senderKind: "admin",
          actor: String(d.actor),
          title: String(d.title),
          body: String(d.body),
          category: String(d.category),
          sendClass: d.send_class === "transactional" ? "transactional" : "marketing",
          reason: typeof d.reason === "string" ? d.reason : null,
          deepLink: typeof d.deep_link === "string" ? d.deep_link : "",
          tokens,
          audienceDefinition: { ...audience },
        });
        await service
          .from("push_drafts")
          .update({ status: "dispatched", dispatched_send_id: result.send_id })
          .eq("id", String(d.id));
        await auditPush(service, {
          actorUserId: String(d.actor),
          actorType: "system",
          action: "push.dispatch",
          entityId: String(d.id),
          metadata: { send_id: result.send_id, recipients: result.recipients },
        });
        dispatched++;
      } catch (err) {
        await service
          .from("push_drafts")
          .update({ status: "failed", dispatch_error: err instanceof Error ? err.message : String(err) })
          .eq("id", String(d.id));
        failed++;
      }
    }
  }

  // Held quiet-hours sweep: re-evaluate each held row against ITS
  // recipient's window + the daily cap, then send or re-hold.
  let heldReleased = 0;
  let heldRecapped = 0;
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: heldData } = await service
    .from("notification_log")
    .select("id, account_id, app, category, class, title, body, deep_link, send_id, push_token_id")
    .eq("status", "held_quiet_hours")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(200);
  for (const row of (heldData ?? []) as Array<Record<string, unknown>>) {
    if (!row.push_token_id) continue;
    const { data: tokenData } = await service
      .from("push_tokens")
      .select("id, account_id, account_scope, tenant_id, app, expo_push_token, categories_enabled, device_timezone, disabled_at")
      .eq("id", String(row.push_token_id))
      .maybeSingle();
    if (!tokenData) continue;
    if ((tokenData as Record<string, unknown>).disabled_at) continue;
    const token = tokenData as unknown as TokenRow;
    if (!inSendWindow(String(row.category), token.device_timezone, new Date())) continue;
    if (row.class === "marketing" && (await marketingSentToday(service, token)) >= MARKETING_CAP_PER_DAY) {
      await service.from("notification_log").update({ status: "held_cap" }).eq("id", String(row.id));
      heldRecapped++;
      continue;
    }
    const tickets = await expoSend([
      {
        to: token.expo_push_token,
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
        data: { deep_link: String(row.deep_link ?? ""), category: String(row.category), send_id: String(row.send_id) },
        channelId: String(row.category),
        priority: "default",
        sound: "default",
      },
    ]);
    const ticket = tickets[0];
    if (ticket && ticket.status === "ok" && ticket.id) {
      await service
        .from("notification_log")
        .update({ status: "sent", expo_ticket_id: ticket.id })
        .eq("id", String(row.id));
      heldReleased++;
    } else {
      const errCode = ticket?.details?.error ?? "unknown";
      await service
        .from("notification_log")
        .update({
          status: "error",
          receipt_status: errCode === "DeviceNotRegistered" ? "device_not_registered" : `error:${errCode}`,
          receipt_checked_at: errCode === "DeviceNotRegistered" ? new Date().toISOString() : null,
        })
        .eq("id", String(row.id));
      if (errCode === "DeviceNotRegistered") await disableToken(service, token.id);
    }
  }

  return jsonResponse({
    drafts_dispatched: dispatched,
    drafts_skipped_disabled: enabled ? 0 : drafts.length,
    drafts_failed: failed,
    held_released: heldReleased,
    held_recapped: heldRecapped,
  });
}

async function handleCheckReceipts(service: SupabaseClient) {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data } = await service
    .from("notification_log")
    .select("id, expo_ticket_id, push_token_id")
    .not("expo_ticket_id", "is", null)
    .is("receipt_checked_at", null)
    .lte("created_at", cutoff)
    .limit(900);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const byTicket = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const tid = String(r.expo_ticket_id);
    const list = byTicket.get(tid) ?? [];
    list.push(r);
    byTicket.set(tid, list);
  }
  let checked = 0;
  let ok = 0;
  let dnr = 0;
  let errors = 0;
  const ids = [...byTicket.keys()];
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const json = await expoPost(EXPO_RECEIPTS_URL, { ids: chunk });
    const receipts = (json.data ?? {}) as Record<
      string,
      { status: string; message?: string; details?: { error?: string } }
    >;
    for (const tid of chunk) {
      const receipt = receipts[tid];
      if (!receipt) continue; // not settled yet — a later pass picks it up
      const errCode = receipt.details?.error;
      const receiptStatus =
        receipt.status === "ok" ? "ok" : errCode === "DeviceNotRegistered" ? "device_not_registered" : `error:${errCode ?? "unknown"}`;
      const targets = byTicket.get(tid) ?? [];
      for (const r of targets) {
        await service
          .from("notification_log")
          .update({ receipt_status: receiptStatus, receipt_checked_at: new Date().toISOString() })
          .eq("id", String(r.id));
        checked++;
        if (receiptStatus === "ok") ok++;
        else if (receiptStatus === "device_not_registered") {
          dnr++;
          if (r.push_token_id) await disableToken(service, String(r.push_token_id));
        } else {
          errors++;
        }
      }
    }
  }
  if (errors > 0) {
    // A broken push pipeline is loud, never silent (plan §1.4): the
    // operator alert itself is trigger wiring (Part 3 step 6).
    console.error(`push-send check_receipts: ${errors} receipt errors (credentials/message faults)`);
  }
  return jsonResponse({ checked, ok, device_not_registered: dnr, errors });
}

// ------------------------------------------------------------ Dispatch ----

Deno.serve((req) =>
  handleRequest(req, async (innerReq) => {
    const body = await parseJsonBody(innerReq);
    const action = typeof body.action === "string" ? body.action : "";
    switch (action) {
      case "admin_state": {
        const { service } = await requireOperator(innerReq);
        return jsonResponse({ admin_push_enabled: await adminPushEnabled(service) });
      }
      case "audience_count": {
        const { service } = await requireOperator(innerReq);
        return handleAudienceCount(service, body);
      }
      case "test_send": {
        const { user, service } = await requireOperator(innerReq);
        return handleTestSend(service, user, body);
      }
      case "send": {
        const { user, service } = await requireOperator(innerReq);
        return handleSend(service, user, body);
      }
      case "schedule": {
        const { user, service } = await requireOperator(innerReq);
        return handleSchedule(service, user, body);
      }
      case "cancel_schedule": {
        const { user, service } = await requireOperator(innerReq);
        return handleCancelSchedule(service, user, body);
      }
      case "list_scheduled": {
        const { service } = await requireOperator(innerReq);
        return handleListScheduled(service);
      }
      case "list_history": {
        const { service } = await requireOperator(innerReq);
        return handleListHistory(service, body);
      }
      case "enqueue": {
        const { service } = await requireInternal(innerReq);
        return handleEnqueue(service, body);
      }
      case "dispatch_due": {
        const { service } = await requireInternal(innerReq);
        return handleDispatchDue(service);
      }
      case "check_receipts": {
        const { service } = await requireInternal(innerReq);
        return handleCheckReceipts(service);
      }
      default:
        throw new HttpError(400, `Unknown action: ${action || "(missing)"}`);
    }
  }),
);
