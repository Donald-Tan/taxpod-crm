import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client. Uses the service role key, so it must never be
 * imported from a client component. Created lazily so `next build` works
 * without environment variables.
 */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill them in.",
      );
    }
    // A common mistake is pasting the dashboard address, which returns HTML.
    if (/supabase\.com\/dashboard/.test(url) || !/^https?:\/\/[^/]+\/?$/.test(url)) {
      throw new Error(
        `SUPABASE_URL looks wrong ("${url}"). Use the Project URL, e.g. https://<project-ref>.supabase.co, ` +
          "not the dashboard address. The project ref is the ID after /project/ in the dashboard URL.",
      );
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
