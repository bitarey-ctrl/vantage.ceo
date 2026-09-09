import { createAdminClient } from "@/lib/supabase/server";

/*
 * Fair ordering for the daily ingest.
 *
 * THE LANDMINE THIS DEFUSES
 * -------------------------
 * /api/cron/ingest loops every onboarded profile and runs the full pipeline
 * for each — a fan-out fetch plus a Claude gate call, several seconds per
 * profile. The loop order was whatever Postgres returned, which is stable in
 * practice. On Vercel Hobby a function is capped at 60 seconds. So as the
 * user count grows, the same profiles get served every morning and the tail
 * of the list is cut off mid-loop, every day, silently — a new CEO added
 * after a few others would simply never receive a daily ingest.
 *
 * THE FIX
 * -------
 * Serve least-recently-served first. Each profile that completes an ingest
 * gets a `profile_ingested` marker in the existing `feature_events` table
 * (no migration); the next run sorts ascending by that timestamp, with
 * never-served profiles first. A profile cut off by the budget is therefore
 * at the front of tomorrow's queue instead of permanently at the back.
 *
 * This bounds staleness rather than eliminating it: with more profiles than
 * fit in one window, everyone is served on a rotation instead of some being
 * served daily and the rest never.
 */

export const INGEST_MARKER = "profile_ingested";

/** How far back to look for markers. Older than this counts as never served. */
const LOOKBACK_DAYS = 30;

export async function markProfileIngested(profileId: string): Promise<void> {
  try {
    const supabase = await createAdminClient();
    await supabase
      .from("feature_events")
      .insert({ profile_id: profileId, event: INGEST_MARKER, metadata: {} });
  } catch (err) {
    // A missing marker only costs fairness on the next run, never correctness.
    console.error("[ingest-queue] Could not mark profile as ingested:", err);
  }
}

/**
 * Least-recently-served first. Never-served profiles lead, so a brand new
 * account is at the front of the very next run rather than behind everyone.
 */
export async function orderByLeastRecentlyServed<T extends { id: string }>(
  profiles: T[]
): Promise<T[]> {
  if (profiles.length <= 1) return profiles;

  const lastServed = new Map<string, number>();

  try {
    const supabase = await createAdminClient();
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

    const { data, error } = await supabase
      .from("feature_events")
      .select("profile_id, created_at")
      .eq("event", INGEST_MARKER)
      .in("profile_id", profiles.map((p) => p.id))
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) throw new Error(error.message);

    // Rows are newest-first, so the first sighting of a profile is its latest.
    for (const row of data ?? []) {
      const pid = row.profile_id as string;
      if (!lastServed.has(pid)) {
        lastServed.set(pid, new Date(row.created_at as string).getTime());
      }
    }
  } catch (err) {
    // Fail SOFT: an unordered run still serves people, it is just not fair.
    console.error("[ingest-queue] Could not read markers, keeping order:", err);
    return profiles;
  }

  return [...profiles].sort((a, b) => {
    const at = lastServed.get(a.id) ?? -1; // never served sorts first
    const bt = lastServed.get(b.id) ?? -1;
    return at - bt;
  });
}
