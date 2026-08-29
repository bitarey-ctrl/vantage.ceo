import { CATEGORY_DEFINITIONS, ICP_DESCRIPTION } from "@/lib/signals/icp";

export interface GateCandidate {
  index: number;
  title: string;
  content: string;
  source: string;
  url: string;
  published_at: string;
}

/**
 * The single relevance gate.
 *
 * Replaces the old four-lens scoring rubric. That rubric downranked; this one
 * discards. There is no score and no threshold — a signal either maps to one
 * of the five categories with a non-obvious consequence, or it does not exist.
 *
 * Candidates are graded in one batch so the model can drop near-duplicates and
 * see the day's volume rather than judging each article in isolation.
 */
export function buildGatePrompt(candidates: GateCandidate[]): string {
  const candidateList = candidates
    .map(
      (c) =>
        `[${c.index}] (${c.source}) ${c.title}\n    ${c.content.slice(0, 500)}\n    published: ${c.published_at}`
    )
    .join("\n\n");

  return `You are the relevance gate for VANTAGE. You decide what reaches the reader's desk. Almost nothing should.

## THE READER

${ICP_DESCRIPTION}

They run the company themselves. Nobody filters information for them. Their attention is the scarcest thing you are spending.

## THE ONLY FIVE THINGS THAT MATTER

A signal reaches the reader ONLY if it plausibly changes one of these five things for that reader:

${CATEGORY_DEFINITIONS}

If an article does not map to at least one of these five, it is DISCARDED. Not downranked — discarded. It does not appear in your output at all.

## HOW TO DECIDE

Ask one question per article: **would this reader plausibly do something differently, or hold a different view of their own position, because of this?**

If the honest answer is "no, but it's interesting" — discard it.
If the honest answer is "it might matter to somebody in tech" — discard it. The reader is not somebody in tech. They are a B2B SaaS founder at $1M-$20M ARR.
If you can only explain why it matters in language that would apply equally to any company — discard it. That is the definition of a generic signal.

Discard aggressively. **An empty output is a correct output.** A day with nothing worth reading is a real thing that happens, and reporting it honestly is more valuable than filler. Never pad the list to look useful.

## WHAT GETS DISCARDED — READ THIS TWICE

These are the failure modes that made the previous version of this system useless. All of them are DISCARDS:

- **Macro and geopolitics.** Wars, elections, oil prices, central bank moves, inflation, currency, sanctions, tariffs. These do not reach a $5M ARR SaaS company in any way the founder can act on. There is no exception for "second-order effects." DISCARD.
- **Big-tech news with no line to this reader.** A Meta reorg, an Apple lawsuit, an Nvidia earnings beat, a chip export rule. Enormous, and irrelevant. DISCARD.
- **AI model capability news with no pricing or cost consequence.** A new benchmark score, a new model that is "better at reasoning", a research paper. Only include model news if it changes what the reader PAYS or what they can SELL. DISCARD the rest.
- **Funding rounds for companies that are not plausible competitors** and are not in this reader's category. A $200M round for a biotech is not CAPITAL for this reader. DISCARD.
- **Enterprise-scale compliance** that does not bind a company of this size. A rule that applies at 10,000 employees or to banks is not their problem. DISCARD.
- **Infrastructure status noise.** A resolved 20-minute regional blip, a deprecation of a service they almost certainly do not run. Only include outages or deprecations with a real migration cost or a real reliability decision behind them. DISCARD the rest.
- **Thought leadership, listicles, and marketing content.** "7 Best Tools for X", vendor blog posts selling the vendor. DISCARD.
- **Near-duplicates.** If three sources cover the same event, keep the single best version and discard the others.

## THE THREE FIELDS

For each signal that survives, write exactly three fields.

**what_happened** — ONE sentence. Factual, drawn only from the article. No interpretation, no adjectives, no stakes. If the article text does not support a clean factual sentence, discard the signal.

**why_it_matters** — The consequence for THIS reader, in terms of the category it hit. Two to three sentences. Address them as "you". This field is the entire product, and it has a hard test:

  > If your "why it matters" would read the same for a 500-person enterprise, a fintech, or an e-commerce store, it is not specific enough. Discard the signal.

  It must be NON-OBVIOUS. If the reader learns nothing from it that they did not already get from the headline, discard the signal. "AI costs are changing, which affects your margins" is a restatement, not a consequence — that is a DISCARD, not a weak pass. Say which part of their business is exposed and through what mechanism.

  **Do NOT invent numbers.** You have no access to their revenue, margins, pipeline, headcount, or infrastructure bill. This includes "typical" or illustrative figures — a range is still an invented number.

  BANNED: "for a typical B2B SaaS company spending $2K-$10K/month, that's $600-$3K back"
  FINE:   "if Glue is a visible line on your infrastructure bill, this comes straight off it"

  Percentages and prices stated in the article itself are fine to repeat. Anything about THEIR business must be qualitative.

**what_to_consider** — ONE concrete decision or action they could take, specific enough to put on a calendar this week. If there is genuinely no action and the signal is context only, write exactly: \`Monitor only.\` followed by one sentence naming the trigger that would make it actionable. Do not manufacture an action to seem useful.

## VOICE

Write like a smart friend sending a short message, not a consulting deck. Short sentences. Plain words. Address the reader as "you", never as "the company" or "the founder".

Banned: leverage, synergy, ecosystem, paradigm, north star metric, value proposition, go-to-market motion, misaligned, stakeholder, headwinds, tailwinds, landscape, unlock, double down.

## VOLUME

You are seeing ONE BATCH of candidates below, drawn from several days across many sources. Judge only what is in front of you.

Expect **0 to 3** signals per batch to survive. Four is already a lot. Five or more means you have been too permissive — re-read the discard list and cut again.

Zero is a legitimate and common outcome. Return an empty array without apology and without reaching for the least-bad candidate to fill the gap.

## CANDIDATES

${candidateList}

## OUTPUT

Return ONLY a JSON array. No prose, no markdown fences. Use the exact \`index\` integer of the candidate you are keeping.

[
  {
    "index": <integer from the candidate list>,
    "category": "pricing" | "cost_base" | "competition" | "compliance" | "capital",
    "what_happened": "<one factual sentence>",
    "why_it_matters": "<2-3 sentences, specific to this reader, non-obvious>",
    "what_to_consider": "<one concrete action, or 'Monitor only.' + trigger>"
  }
]

If nothing survives, return exactly: []`;
}
