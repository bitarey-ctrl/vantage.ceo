import { callClaude } from "@/lib/ai/claude";
import { buildGatePrompt, type GateCandidate } from "@/lib/ai/prompts/triage";
import { GATE_ENV, requireEnv } from "@/lib/env";
import { isSignalCategory, type SignalCategory } from "./icp";

/** A candidate article, before the gate has seen it. */
export interface RawCandidate {
  title: string;
  content: string;
  url: string | null;
  published_at: string;
  source_name: string;
}

/** A candidate that survived, carrying its category and the three fields. */
export interface GatedSignal extends RawCandidate {
  category: SignalCategory;
  what_happened: string;
  what_to_consider: string;
  why_it_matters: string;
}

interface GateResponse {
  index: number;
  category: string;
  what_happened: string;
  why_it_matters: string;
  what_to_consider: string;
}

/**
 * Candidates are graded in batches. Batching lets the model see the day's
 * volume and drop near-duplicates, which per-article grading cannot do.
 */
const BATCH_SIZE = 25;

/** A field this short is not a real consequence — treat it as a failed gate. */
const MIN_WHY_LENGTH = 60;

/**
 * Run the five-category gate over a set of candidates.
 *
 * Returns only the survivors. Anything the model does not return, returns
 * without a valid category, or returns with an empty/stub `why_it_matters`
 * is dropped here and never reaches the database.
 */
export async function gateSignals(
  candidates: RawCandidate[]
): Promise<GatedSignal[]> {
  if (candidates.length === 0) return [];

  // Fail loudly on a missing key rather than discarding every batch below and
  // returning an empty feed that reads as a quiet news day.
  requireEnv(GATE_ENV, "Signal gate");

  const survivors: GatedSignal[] = [];
  let batchesRun = 0;
  let batchesFailed = 0;

  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE);
    batchesRun++;

    const prompt = buildGatePrompt(
      batch.map((c, i) => ({
        index: i,
        title: c.title,
        content: c.content,
        source: c.source_name,
        url: c.url ?? "",
        published_at: c.published_at,
      } satisfies GateCandidate))
    );

    let results: GateResponse[];
    try {
      results = await callClaude<GateResponse[]>(prompt, { maxTokens: 4000 });
    } catch (err) {
      // A failed batch drops its candidates rather than passing them through.
      // Silence is the safe default for a filter whose job is to discard —
      // but only when it is partial. See the all-failed check below.
      batchesFailed++;
      console.error("[gate] Batch failed, dropping its candidates:", err);
      continue;
    }

    if (!Array.isArray(results)) continue;

    for (const r of results) {
      const candidate = batch[r?.index];
      if (!candidate) continue;
      if (!isSignalCategory(r.category)) continue;

      const whatHappened = String(r.what_happened ?? "").trim();
      const whyItMatters = String(r.why_it_matters ?? "").trim();
      const whatToConsider = String(r.what_to_consider ?? "").trim();

      // The three fields are the product. If the model could not write a real
      // "why it matters", the signal is dropped — per the gate's own rule.
      if (!whatHappened || !whatToConsider) continue;
      if (whyItMatters.length < MIN_WHY_LENGTH) continue;

      survivors.push({
        ...candidate,
        category: r.category,
        what_happened: whatHappened,
        why_it_matters: whyItMatters,
        what_to_consider: whatToConsider,
      });
    }
  }

  // Every batch failing is not a quiet news day — it is a broken gate. The
  // most likely cause is an invalid or revoked ANTHROPIC_API_KEY, which the
  // requireEnv check above cannot catch because the variable is present.
  if (batchesRun > 0 && batchesFailed === batchesRun) {
    throw new Error(
      `[gate] All ${batchesRun} batch(es) failed — the gate produced no verdicts ` +
        `for ${candidates.length} candidates. This is a failure, not an empty day. ` +
        `Check ANTHROPIC_API_KEY validity and the Anthropic API status.`
    );
  }

  return survivors;
}
