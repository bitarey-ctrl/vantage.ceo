import { callClaudeStructured, StructuredOutputError } from "@/lib/ai/claude";
import { classifyFailure, failureCause, recordStage, type FailureKind } from "@/lib/company-context/run-status";
import { buildGatePrompt, type GateCandidate } from "@/lib/ai/prompts/triage";
import { GATE_ENV, requireEnv } from "@/lib/env";
import { isSignalCategory, SIGNAL_CATEGORIES, type SignalCategory } from "./icp";

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

/**
 * A field this short is not a real consequence — treat it as a failed gate.
 *
 * Kept deliberately low. The prompt now asks for ONE OR TWO sentences, and a
 * legitimately tight answer ("Repeated-context calls just got 75% cheaper on
 * Anthropic.") lands around 55 characters. At the old floor of 60 this guard
 * would have silently eaten correct output and looked exactly like the gate
 * discarding the signal. This only needs to catch empty strings and stubs.
 */
const MIN_WHY_LENGTH = 40;

/**
 * Schema-constrained gate output (structured outputs). The API requires an object at the root, so the prompt's array
 * is wrapped as `{"signals": [...]}`. The schema guarantees shape only on a normal finish; content is still judged
 * below (index, category, field substance), and a schema-valid answer is not taken as a correct relevance judgement.
 */
export const GATE_SCHEMA_VERSION = "gate-v1";
export const GATE_SCHEMA = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          category: { type: "string", enum: [...SIGNAL_CATEGORIES] },
          what_happened: { type: "string" },
          why_it_matters: { type: "string" },
          what_to_consider: { type: "string" },
        },
        required: ["index", "category", "what_happened", "why_it_matters", "what_to_consider"],
        additionalProperties: false,
      },
    },
  },
  required: ["signals"],
  additionalProperties: false,
} as const;
const ENVELOPE_NOTE = `\n\nOutput envelope: put the array described above in an object as {"signals": [...]}. If nothing survives, return {"signals": []}.`;

/** Structure only (the schema should already guarantee it; a refusal or cut-off answer may not follow it). */
export function gateStructureProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "root is not an object";
  const list = (value as { signals?: unknown }).signals;
  if (!Array.isArray(list)) return "signals is not an array";
  for (let i = 0; i < list.length; i++) {
    const r = list[i] as Record<string, unknown> | null;
    if (!r || typeof r !== "object") return `signals[${i}] is not an object`;
    if (!Number.isInteger(r.index)) return `signals[${i}].index is not an integer`;
    for (const f of ["category", "what_happened", "why_it_matters", "what_to_consider"]) if (typeof r[f] !== "string") return `signals[${i}].${f} is not a string`;
  }
  return null;
}

/**
 * Run the five-category gate over a set of candidates.
 *
 * Returns only the survivors. Anything the model does not return, returns
 * without a valid category, or returns with an empty/stub `why_it_matters`
 * is dropped here and never reaches the database.
 */
export type GateFailureKind = FailureKind;

/** Classify a failed gate call without looking at its message text (which may hold provider details). */
export const gateFailureKind = (err: unknown): GateFailureKind => classifyFailure(err);

const FAILURE_TEXT: Record<GateFailureKind, string> = {
  budget: "the model-call budget for this environment was reached, so no request was sent for them",
  auth: "the AI service did not accept this server's credentials — the server configuration needs attention",
  connection: "the connection to the AI service failed",
  timeout: "the AI service did not answer in time",
  provider: "the AI service was busy or returned an error — try again later",
  refusal: "the AI service declined to answer",
  truncated: "the AI service's answer was cut off before it finished",
  parse: "the AI service's answer could not be read",
  other: "of an unexpected error",
};

export function gateFailureMessage(kinds: GateFailureKind[], batchesRun: number, candidateCount: number): string {
  const distinct = [...new Set(kinds)];
  const why = distinct.map((k) => FAILURE_TEXT[k]).join("; and ");
  return `New items were not checked: all ${batchesRun} check(s) of ${candidateCount} candidates failed because ${why}. ` +
    `Nothing was judged unimportant — this is a failure, not a quiet day.`;
}

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
  const failureKinds: GateFailureKind[] = [];

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
    ) + ENVELOPE_NOTE;

    let results: GateResponse[];
    try {
      const out = await callClaudeStructured<{ signals: GateResponse[] }>(prompt, {
        maxTokens: 4000, schema: GATE_SCHEMA, schemaVersion: GATE_SCHEMA_VERSION, validate: gateStructureProblem,
      });
      results = out.data.signals;
      recordStage("gate", { ok: true, items: batch.length, diagnostic: out.diagnostic });
    } catch (err) {
      // A failed batch drops its candidates rather than passing them through.
      // Silence is the safe default for a filter whose job is to discard —
      // but only when it is partial. See the all-failed check below.
      batchesFailed++;
      const kind = gateFailureKind(err);
      failureKinds.push(kind);
      const diagnostic = err instanceof StructuredOutputError ? err.diagnostic : undefined;
      recordStage("gate", { ok: false, kind, ...(diagnostic ? { diagnostic } : {}) });
      // Metadata only: no prompt, no model output.
      console.error(`[gate] Batch failed (${kind}; ${failureCause(err)}${diagnostic ? `; ${diagnostic.failure}; request ${diagnostic.requestId ?? "unknown"}; schema ${diagnostic.schemaVersion}` : ""}), dropping its candidates.`);
      continue;
    }

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
  // message names the actual failure category (budget limit, credentials,
  // provider availability, other) and never includes credentials or raw
  // provider error text.
  if (batchesRun > 0 && batchesFailed === batchesRun) {
    const error = new Error(gateFailureMessage(failureKinds, batchesRun, candidates.length)) as Error & { code?: string };
    error.code = `gate_${[...new Set(failureKinds)].length === 1 ? failureKinds[0] : "mixed"}`;
    throw error;
  }

  return survivors;
}
