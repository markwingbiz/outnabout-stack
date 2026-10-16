// Shared error text for Livework screens.
//
// Supabase PostgREST errors are plain objects ({message, code, details,
// hint}), NOT Error instances — so `e instanceof Error ? e.message :
// "Try again."` swallowed the real message on every Supabase failure and
// the app showed only "Try again.". describeError reads the real fields
// so the screen shows what actually failed.
export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message || "Try again.";
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts: string[] = [];
    if (typeof o.message === "string" && o.message) parts.push(o.message);
    if (typeof o.code === "string" && o.code) parts.push(`(${o.code})`);
    if (typeof o.details === "string" && o.details) parts.push(o.details);
    if (typeof o.hint === "string" && o.hint) parts.push(o.hint);
    if (parts.length > 0) return parts.join(" ");
    try {
      return JSON.stringify(e);
    } catch {
      return "Try again.";
    }
  }
  return "Try again.";
}
