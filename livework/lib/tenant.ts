// Livework tenant helpers — Phase 7 Slice 1.
// Vendor → tenant mapping lives in tenant_users (see phase-7-ownership.md).
// Every helper returns real rows or an empty array; never demo data.
// Reads go through RLS as the signed-in user.
import { supabase } from "./supabase";

export type TenantVenue = {
  id: string;
  tenant_id: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  // Verification gate (v1: manual operator review). The real enforcement
  // is server-side in bownd-sync; the app reads these for display and
  // for the UX gate (Publish disabled until verified).
  is_test: boolean;
  verification_status: string | null;
};

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Tenant IDs the signed-in user belongs to (from tenant_users).
 * Returns [] when the user has no membership. Throws on query error
 * (callers surface the real error — an error is not "no membership").
 */
export async function getUserTenantIds(): Promise<string[]> {
  if (!supabase) return [];
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId);
  if (error) throw error;
  const ids = ((data ?? []) as { tenant_id?: unknown }[])
    .map((r) => (typeof r.tenant_id === "string" ? r.tenant_id : null))
    .filter((v): v is string => v !== null);
  return [...new Set(ids)];
}

/**
 * The signed-in user's venues, ordered by name. [] when the user has no
 * tenant or no venues. Throws on query error.
 */
export async function getUserVenues(): Promise<TenantVenue[]> {
  if (!supabase) return [];
  const tenantIds = await getUserTenantIds();
  if (tenantIds.length === 0) return [];
  const { data, error } = await supabase
    .from("venues")
    .select("id, tenant_id, name, address, city, state, phone, website, is_test, verification_status")
    .in("tenant_id", tenantIds)
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((v) => ({
    id: String(v.id ?? ""),
    tenant_id: typeof v.tenant_id === "string" ? v.tenant_id : null,
    name: String(v.name ?? "Unnamed venue"),
    address: typeof v.address === "string" ? v.address : null,
    city: typeof v.city === "string" ? v.city : null,
    state: typeof v.state === "string" ? v.state : null,
    phone: typeof v.phone === "string" ? v.phone : null,
    website: typeof v.website === "string" ? v.website : null,
    is_test: v.is_test === true,
    verification_status: typeof v.verification_status === "string" ? v.verification_status : null,
  }));
}
