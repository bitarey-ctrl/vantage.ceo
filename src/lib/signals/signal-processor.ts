import { createAdminClient } from "@/lib/supabase/server";
import { fetchPerplexitySignals } from "./perplexity";
import { fetchRssSignals } from "./rss-ingestion";
import { gateSignals, type RawCandidate } from "./gate";
import { PIPELINE_ENV, requireEnv } from "@/lib/env";
import type { Profile, CeoContext, Decision } from "@/types/database";

/**
 * `signalsProcessed` and `consequencesGenerated` are legacy aliases kept so
 * api/cron/ingest keeps compiling. Prefer the two explicit names.
 */
interface PipelineResult {
  candidatesFetched: number;
  signalsSurfaced: number;
  signalsProcessed: number;
  consequencesGenerated: number;
}

function result(candidatesFetched: number, signalsSurfaced: number): PipelineResult {
  return {
    candidatesFetched,
    signalsSurfaced,
    signalsProcessed: candidatesFetched,
    consequencesGenerated: signalsSurfaced,
  };
}

/**
 * Full signal processing pipeline for a profile.
 * Orchestrates: fetch → gate → store survivors.
 *
 * The gate runs BEFORE the database write. Signals that fail it are discarded
 * and never persisted — the old pipeline inserted everything and stored a
 * relevance score alongside, which is why irrelevant signals kept surfacing.
 */
export async function processSignalsForProfile(
  profile: Profile,
  context: CeoContext,
  _recentDecisions: Decision[]
): Promise<PipelineResult> {
  // Assert before any fetching, so a misconfigured deploy fails on the first
  // cron run with a clear error instead of quietly writing nothing.
  requireEnv(PIPELINE_ENV, "Signal pipeline");

  const supabase = await createAdminClient();

  // 1. Fetch candidates from the curated sources (parallel)
  const [newsApiResult, rssResult] = await Promise.allSettled([
    fetchPerplexitySignals(context, profile.company_name ?? ""),
    fetchRssSignals(context),
  ]);

  const allCandidates: RawCandidate[] = [
    ...(newsApiResult.status === "fulfilled"
      ? newsApiResult.value.map((s) => ({
          title: s.title,
          content: s.content,
          url: s.url,
          published_at: s.published_at,
          source_name: s.feed_name,
        }))
      : []),
    ...(rssResult.status === "fulfilled"
      ? rssResult.value.map((s) => ({
          title: s.title,
          content: s.content,
          url: s.url,
          published_at: s.published_at,
          source_name: s.feed_name,
        }))
      : []),
  ];

  if (allCandidates.length === 0) {
    console.log(`[Pipeline] No candidates fetched for ${profile.company_name}`);
    return result(0, 0);
  }

  // 2. Drop anything already seen in the last 7 days
  const recentTitles = await getRecentSignalTitles(supabase, 24 * 7);
  const freshCandidates = allCandidates.filter(
    (c) => c.title?.trim() && !recentTitles.has(normalizeTitle(c.title))
  );

  if (freshCandidates.length === 0) {
    return result(allCandidates.length, 0);
  }

  // 3. THE GATE. Everything that does not map to one of the five categories
  //    with a non-obvious consequence dies here.
  const survivors = await gateSignals(freshCandidates);

  console.log(
    `[Pipeline] ${profile.company_name}: ${freshCandidates.length} candidates → ${survivors.length} surfaced`
  );

  if (survivors.length === 0) {
    // An empty day is a correct outcome, not a failure.
    return result(allCandidates.length, 0);
  }

  // 4. Store survivors, carrying their category and the three fields
  const { data: insertedSignals, error: signalError } = await supabase
    .from("signals")
    .insert(
      survivors.map((s) => ({
        source: "rss" as const,
        title: s.title,
        content: s.content,
        url: s.url,
        published_at: s.published_at,
        category: s.category,
        what_happened: s.what_happened,
        why_it_matters: s.why_it_matters,
        what_to_consider: s.what_to_consider,
        // NOTE: no raw_data column exists on `signals` (verified against the
        // live schema). Writing one silently failed every insert, so feed
        // provenance is not persisted. Add a migration if it is wanted.
      }))
    )
    .select("id");

  if (signalError || !insertedSignals) {
    // Throw rather than returning 0. Returning 0 made a failed insert look
    // identical to "the gate discarded everything" — the caller reported
    // success while nothing was written. Serialise the message explicitly:
    // logging the raw Supabase error object prints "{}".
    const detail = signalError
      ? `${signalError.message} (code ${signalError.code ?? "none"})`
      : "insert returned no rows";
    throw new Error(
      `[Pipeline] Failed to insert ${survivors.length} gated signal(s) for ` +
        `${profile.company_name}: ${detail}`
    );
  }

  // 5. Link each surfaced signal to this profile.
  //
  // signal_triages is a pure join table now. relevant/relevance_score/
  // relevance_reason are vestiges of the pre-023 scoring rubric and are
  // deprecated in migration 028 — every row carries the same constants
  // because the gate does not score, it discards. They are still written
  // only because the columns are NOT NULL and two protected routes read
  // them. Do not treat these values as a measurement.
  const { error: triageError } = await supabase.from("signal_triages").upsert(
    insertedSignals.map((s) => ({
      signal_id: s.id,
      profile_id: profile.id,
      relevant: true,
      relevance_score: 100,
      relevance_reason: "Passed the five-category gate.",
    }))
  );

  if (triageError) {
    console.error("[Pipeline] Failed to link signals to profile:", triageError);
  }

  return result(allCandidates.length, insertedSignals.length);
}

async function getRecentSignalTitles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  hoursBack: number
): Promise<Set<string>> {
  const since = new Date(Date.now() - hoursBack * 3600000).toISOString();

  const { data } = await supabase
    .from("signals")
    .select("title")
    .gte("created_at", since);

  if (!data) return new Set();
  return new Set(data.map((s: { title: string }) => normalizeTitle(s.title)));
}

// Null-safe: a candidate with no title cannot be deduped or gated, and a raw
// .toLowerCase() on null took down the whole refresh run.
function normalizeTitle(title: string | null | undefined): string {
  if (!title) return "";
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().slice(0, 60);
}
