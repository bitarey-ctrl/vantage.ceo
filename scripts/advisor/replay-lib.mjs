// Shared helpers for the captured-answer replay (scripts/advisor/replay-retest.test.mjs).
// REPLAY, not a model run: the provider is a script that streams text captured from a real Sonnet 5.5 run.
import { readFileSync } from 'node:fs';

const REMOVED_MARK = '[unsupported figure removed]';
const NOTE = '\n\n*I removed ';
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

/** The nine retest cases with their question, stored context and reconstructed raw model text. */
export function retestCases() {
  const { cases } = read('./retest-answers-2026-11-07.json');
  const { pairs } = read('./reasoning-pairs.json');
  const fresh = read('./reasoning-fresh-cases.json');
  const freshCases = [...fresh.cases, ...(fresh.round2?.cases ?? [])];
  return cases.map((c) => {
    let ctx, question;
    const p = pairs.find((x) => `${x.id}:b` === c.id);
    if (p) {
      ctx = { business_facts: {}, ...p.base };
      if (p.differ.field.startsWith('business_facts.')) ctx.business_facts = { [p.differ.field.split('.')[1]]: p.differ.b };
      else ctx[p.differ.field] = p.differ.b;
      question = p.question;
    } else { const f = freshCases.find((x) => x.id === c.id); ctx = { business_facts: {}, ...f.context }; question = f.question; }
    // The same columns the retest wrote to ceo_context (stage-c.mjs, regression mode).
    ctx = { product_description: null, target_customer: null, revenue_model: null, additional_context: null, ...ctx };
    const body = c.delivered.split(NOTE)[0];
    const marks = body.split(REMOVED_MARK).length - 1;
    if (marks !== c.removed.length) throw new Error(`${c.id}: ${marks} marks but ${c.removed.length} removed figures`);
    let i = 0;
    const raw = body.replaceAll(REMOVED_MARK, () => c.removed[i++].text);
    return { ...c, ctx, question, raw };
  });
}

/** Split text the way a provider stream can: fixed-size pieces that cut words and sentences anywhere. */
export const chunks = (text, size) => Array.from({ length: Math.ceil(text.length / size) }, (_, k) => text.slice(k * size, (k + 1) * size));
