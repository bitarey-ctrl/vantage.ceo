import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { guardUserResult } from "@/lib/pilot/access";

export async function createClient() {
  const cookieStore = await cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — cookie setting ignored
          }
        },
      },
    }
  );
  // Restricted pilot: every signed-in route reads its user here, so accounts outside the pilot are refused on the
  // server (see @/lib/pilot/access).
  const getUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = (async (jwt?: string) => guardUserResult(await getUser(jwt))) as typeof client.auth.getUser;
  return client;
}

/**
 * Admin client — uses the service role key via the raw supabase-js client.
 * This properly bypasses RLS on all tables (service_role JWT skips all policies).
 * Do NOT use createServerClient for admin operations — the SSR wrapper does not
 * reliably propagate the service_role JWT role claim to Supabase's RLS engine.
 */
export async function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
