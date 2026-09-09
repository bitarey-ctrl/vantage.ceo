import { createAdminClient } from "@/lib/supabase/server";

/*
 * One manual signal refresh per user per hour.
 *
 * A refresh is expensive — it fans out to every curated source and then runs
 * the whole candidate set through the gate (a Claude call). Left unbounded,
 * holding the button down is a straight line to the API bill.
 *
 * Storage: the existing `feature_events` table, so this needs no migration.
 * We write our own event name rather than reusing `signal_refreshed`, which
 * the pipeline only logs when something was actually surfaced — attempts that
 * surface nothing still cost the same money and must still count.
 *
 * This is per-profile, not per-IP: the limit exists to bound spend on an
 * authenticated account, and the route already resolves the user before
 * calling in. Serverless-safe because the state lives in Postgres, not in
 * process memory, so it holds across cold starts and instances.
 */

export const REFRESH_EVENT = "signal_refresh_attempt";
export const REFRESH_WINDOW_SECONDS = 60 * 60;

export interface RefreshAllowance {
  allowed: boolean;
  /** Seconds until the next refresh is permitted. 0 when allowed. */
  retryAfterSeconds: number;
}

export async function checkRefreshAllowance(
  profileId: string
): Promise<RefreshAllowance> {
  const supabase = await createAdminClient();
  const since = new Date(Date.now() - REFRESH_WINDOW_SECONDS * 1000).toISOString();

  const { data, error } = await supabase
    .from("feature_events")
    .select("created_at")
    .eq("profile_id", profileId)
    .eq("event", REFRESH_EVENT)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  // Fail OPEN. A rate limiter that cannot read its own state must not become
  // an outage — the worst case here is one extra refresh, and the caller
  // still has its own time budget.
  if (error) {
    console.error("[refresh-limit] Could not read window, allowing:", error.message);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const last = data?.[0]?.created_at as string | undefined;
  if (!last) return { allowed: true, retryAfterSeconds: 0 };

  const elapsed = (Date.now() - new Date(last).getTime()) / 1000;
  const remaining = Math.ceil(REFRESH_WINDOW_SECONDS - elapsed);
  if (remaining <= 0) return { allowed: true, retryAfterSeconds: 0 };

  return { allowed: false, retryAfterSeconds: remaining };
}

/** Record the attempt. Called BEFORE the work, so a slow or failed run still counts. */
export async function recordRefreshAttempt(profileId: string): Promise<void> {
  try {
    const supabase = await createAdminClient();
    await supabase.from("feature_events").insert({
      profile_id: profileId,
      event: REFRESH_EVENT,
      metadata: {},
    });
  } catch (err) {
    console.error("[refresh-limit] Could not record attempt:", err);
  }
}

/** "in 43 minutes" / "in 2 minutes" — for the message the user actually reads. */
export function describeWait(seconds: number): string {
  const mins = Math.ceil(seconds / 60);
  if (mins <= 1) return "in a minute";
  return `in ${mins} minutes`;
}
