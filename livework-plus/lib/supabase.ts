// Supabase client for Livework+.
// Config comes ONLY from EXPO_PUBLIC_SUPABASE_* env vars (see .env.example).
// If the vars are missing, `supabase` is null and the data layer falls back
// to the demo values that match the supplied mockups.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null =
  supabaseConfigured && url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

if (!supabaseConfigured) {
  console.warn(
    "[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Showing demo fallback data."
  );
}
