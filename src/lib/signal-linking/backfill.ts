import { createAdminClient } from "@/lib/supabase/server";

/*
 * Back-link already-ingested signals to a profile.
 *
 * THE BUG THIS FIXES
 * ------------------
 * `signals` is a GLOBAL table. Visibility is per-profile through the
 * `signal_triages` join table, and the pipeline only writes triage rows for
 * the profile it happened to be running for. Two things follow:
 *
 *   1. A signal ingested while profile A was running is invisible to profile
 *      B forever, even though the row is sitting right there.
 *   2. The pipeline drops any candidate whose title was ingested in the last
 *      7 days — and that dedupe is GLOBAL, not per profile. So when profile B
 *      hits Refresh, every one of today's articles is "already seen", nothing
 *      survives, no triage rows are written, and the button honestly reports
 *      zero. The next cron does not help: it runs the same processor with the
 *      same global dedupe, so B stays empty until a genuinely novel article
 *      appears — and then gets only that one.
 *
 * Measured on production before this fix: 216 rows in `signals`, and
 * `signal_triages` had 10 rows for the first account and ZERO for every other
 * profile, including one that had completed onboarding and had a ceo_context.
 *
 * THE FIX
 * -------
 * Reconcile the join table. For a given profile, link the recent signals that
 * already passed the gate and that this profile is not linked to yet. This is
 * idempotent (UNIQUE (signal_id, profile_id), upserted with ignoreDuplicates)
 * and it is deliberately NOT part of the gate: it links signals the gate has
 * already approved, and invents nothing.
 *
 * Kept in its own module rather than inside src/lib/signals/ so the tuned
 * ingestion pipeline is untouched — this only reconciles rows after the fact.
 */

/** Only link signals that actually made it through the five-category gate. */
const GATED_COLUMNS = "id";

export interface BackfillResult {
  linked: number;
  alreadyLinked: number;
  candidates: number;
}

export async function backfillTriagesForProfile(
  profileId: string,
  opts: { days?: number; limit?: number } = {}
): Promise<BackfillResult> {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 40;

  const supabase = await createAdminClient();
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

  // Recent signals that carry a category — i.e. the gate accepted them. Raw
  // rows from any older ungated path are skipped on purpose.
  const { data: recent, error: recentError } = await supabase
    .from("signals")
    .select(GATED_COLUMNS)
    .not("category", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (recentError) {
    throw new Error(`[backfill] Could not read recent signals: ${recentError.message}`);
  }
  if (!recent || recent.length === 0) {
    return { linked: 0, alreadyLinked: 0, candidates: 0 };
  }

  const ids = recent.map((s) => s.id as string);

  const { data: existing, error: existingError } = await supabase
    .from("signal_triages")
    .select("signal_id")
    .eq("profile_id", profileId)
    .in("signal_id", ids);

  if (existingError) {
    throw new Error(`[backfill] Could not read existing links: ${existingError.message}`);
  }

  const linkedAlready = new Set((existing ?? []).map((r) => r.signal_id as string));
  const missing = ids.filter((id) => !linkedAlready.has(id));

  if (missing.length === 0) {
    return { linked: 0, alreadyLinked: linkedAlready.size, candidates: ids.length };
  }

  // relevant / relevance_score / relevance_reason are deprecated constants
  // (see the note in signal-processor). They are written only because the
  // columns are NOT NULL. They are not a measurement.
  const { error: insertError } = await supabase.from("signal_triages").upsert(
    missing.map((signal_id) => ({
      signal_id,
      profile_id: profileId,
      relevant: true,
      relevance_score: 100,
      relevance_reason: "Passed the five-category gate.",
    })),
    { onConflict: "signal_id,profile_id", ignoreDuplicates: true }
  );

  if (insertError) {
    throw new Error(`[backfill] Could not link signals: ${insertError.message}`);
  }

  return {
    linked: missing.length,
    alreadyLinked: linkedAlready.size,
    candidates: ids.length,
  };
}
