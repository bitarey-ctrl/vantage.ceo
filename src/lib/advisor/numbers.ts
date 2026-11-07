/**
 * Numerical provenance for advice. Every numeric claim in an answer — a percentage, an amount of money, a multiple,
 * or a range of them — must trace to one of:
 *   supplied      the number is in the founder's details, the conversation, or the signals given to the model
 *   calculated    it follows from supplied numbers by one arithmetic step, with an operand shown in the same sentence
 *   illustration  its sentence explicitly labels it as an illustration (not a benchmark)
 * Anything else is unsupported: an invented commission rate, fee range or "typical" percentage. Finding a number is
 * not the check; tracing it is. Bare counts in a suggested next step ("call three customers") are not claims.
 */

export type NumberKind = 'supplied' | 'calculated' | 'illustration' | 'unsupported';
export interface NumericClaim { text: string; values: number[]; kind: NumberKind; sentence: string }

const CLAIM = /(?:[£$€]\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|million|billion|thousand)?(?:\s?(?:-|–|to)\s?[£$€]?\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|million|billion|thousand)?)?)|(?:\b\d[\d,]*(?:\.\d+)?(?:\s?(?:-|–|to)\s?\d[\d,]*(?:\.\d+)?)?\s?(?:%|per ?cent\b|x\b|×))/gi;
const ILLUSTRATION = /\b(illustrat\w*|hypothetical\w*|for illustration|made-up|not a benchmark|example figures?)\b/i;
const CALC_MARKER = /[=×*÷\/]|\b(times|multiplied|divided|minus|plus|of|per|at)\b/i;
const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };

/** Numbers in a claim, with k/m/bn scale applied ("£2k" → 2000; "2–3%" → [2, 3]). */
export function valuesOf(claim: string): number[] {
  const out: number[] = [];
  for (const m of claim.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn|million|billion|thousand)?/gi)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n * (m[2] ? SCALE[m[2].toLowerCase()] ?? 1 : 1));
  }
  return out;
}

/** Every number (with scale) that appears anywhere in the supplied material. */
export function suppliedNumbers(text: string): Set<number> {
  const set = new Set<number>();
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn|million|billion|thousand)?/gi)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) { set.add(n); if (m[2]) set.add(n * (SCALE[m[2].toLowerCase()] ?? 1)); }
  }
  // Number words that founders write out ("three months of cash").
  const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, fifty: 50, hundred: 100 };
  for (const [w, n] of Object.entries(WORDS)) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) set.add(n);
  return set;
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 0.01);

/** One arithmetic step from two supplied numbers (sum, difference, product, ratio, percentage of). */
function derivable(v: number, supplied: number[]): boolean {
  for (const a of supplied) for (const b of supplied) {
    if (near(v, a + b) || near(v, a - b) || near(v, a * b) || (b !== 0 && (near(v, a / b) || near(v, (a / b) * 100))) || near(v, (a * b) / 100) || near(v, a * (1 + b / 100)) || near(v, a * (1 - b / 100))) return true;
  }
  return false;
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** Classify every numeric claim in `answer` against the material the model was given. */
export function traceNumbers(answer: string, suppliedText: string): { claims: NumericClaim[]; unsupported: NumericClaim[] } {
  const supplied = suppliedNumbers(suppliedText);
  const list = [...supplied];
  const claims: NumericClaim[] = [];
  for (const sentence of sentencesOf(answer)) {
    const inSentence = new Set(valuesOf(sentence));
    for (const m of sentence.matchAll(CLAIM)) {
      const text = m[0].trim();
      const values = valuesOf(text);
      if (!values.length) continue;
      let kind: NumberKind;
      if (values.every((v) => [...supplied].some((s) => near(v, s)))) kind = 'supplied';
      // A calculation is "shown" only when its sentence carries an arithmetic marker and at least two supplied
      // operands, and the result follows from them in one step. Small numbers are derivable from almost anything,
      // so derivability alone is never enough.
      else if (CALC_MARKER.test(sentence) && values.every((v) => {
        const operands = [...inSentence].filter((o) => !near(o, v) && list.some((s) => near(o, s)));
        return [...supplied].some((s) => near(v, s)) || (operands.length >= 2 && derivable(v, operands));
      })) kind = 'calculated';
      else if (ILLUSTRATION.test(sentence)) kind = 'illustration';
      else kind = 'unsupported';
      claims.push({ text, values, kind, sentence });
    }
  }
  return { claims, unsupported: claims.filter((c) => c.kind === 'unsupported') };
}

/** The visible note appended to an answer that contains unsupported figures (none when there are none). */
export function unsupportedFiguresNote(unsupported: NumericClaim[]): string | null {
  if (!unsupported.length) return null;
  const figures = [...new Set(unsupported.map((c) => c.text))].slice(0, 6);
  return `\n\n*Check before relying on ${figures.length === 1 ? 'this figure' : 'these figures'}: ${figures.join(', ')} ${figures.length === 1 ? 'is' : 'are'} not from your details, your signals or a calculation shown here. Treat ${figures.length === 1 ? 'it' : 'them'} as an untested assumption, not a benchmark.*`;
}
