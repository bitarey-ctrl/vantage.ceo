import { createAdminClient } from "@/lib/supabase/server";

/*
 * Guarantee a profiles row exists for an authenticated user.
 *
 * THE BUG THIS FIXES
 * ------------------
 * Everything the app writes is keyed on profile_id = auth.uid(), and
 * decisions.profile_id is a FOREIGN KEY to profiles.id. A profiles row is
 * normally created by the `on_auth_user_created` trigger — but that trigger is
 * AFTER INSERT ON auth.users, so it only ever fires for a genuinely new auth
 * row. Two ways a user ends up authenticated with no profile:
 *
 *   1. The account predates the trigger. Confirmed on production: three auth
 *      users from 2026-05-17 have no profiles row, including a real, confirmed,
 *      currently-active account.
 *   2. /api/auth/signup's recovery path. When the email already exists but is
 *      unconfirmed it calls updateUserById to confirm and reset the password —
 *      an UPDATE, not an INSERT, so the trigger does not fire and no profile is
 *      created. The user is then "signed up" with nothing behind them.
 *
 * The symptom is a 23503 foreign key violation on decisions_profile_id_fkey,
 * which is exactly what was reported from the field. Onboarding hid it: those
 * routes issue .update() calls, and updating zero rows is not an error, so the
 * whole flow reported success while writing nothing.
 *
 * Calling this before any profile-keyed write makes the state unreachable at
 * runtime, whatever happened at signup. Migration 030 repairs the rows that
 * already exist.
 */
export async function ensureProfileExists(userId: string): Promise<boolean> {
  const admin = await createAdminClient();

  const { data: existing, error: readError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (readError) {
    throw new Error(`[ensure-profile] Could not read profile: ${readError.message}`);
  }
  if (existing) return false;

  // Pull identity off the auth row so the repaired profile is not blank.
  let email: string | null = null;
  let fullName = "";
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    email = data?.user?.email ?? null;
    fullName = (data?.user?.user_metadata?.full_name as string | undefined) ?? "";
  } catch {
    // Identity is a nicety; the row existing is the requirement.
  }

  const { error: insertError } = await admin
    .from("profiles")
    .upsert({ id: userId, email, full_name: fullName }, { onConflict: "id", ignoreDuplicates: true });

  if (insertError) {
    throw new Error(`[ensure-profile] Could not create profile: ${insertError.message}`);
  }

  console.log(`[ensure-profile] Repaired missing profiles row for ${userId}`);
  return true;
}
