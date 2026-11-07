/**
 * Numerical provenance for advice. A number in an answer — a percentage, an amount of money, a multiple, a duration, or
 * a range of them — is supported only when:
 *   supplied      a number in the founder's details, the conversation or the signals has the same value, the same unit
 *                 (and currency), the same period, AND a compatible meaning (20% commission ≠ "20% of walkers leave");
 *   calculated    a recognised calculation in the same sentence recomputes to it from supported inputs (a wrong
 *                 result fails even when every input is valid, e.g. a cost change applied to the wrong base);
 *   illustration  its sentence is labelled as an illustration AND it is not phrased as a recommendation, and no later
 *                 sentence reuses it as a target.
 * Anything else is unsupported. Finding a number is not the check; tracing its meaning and arithmetic is. Bare counts in
 * a suggested next step ("call three customers") are not quantitative claims.
 */

export type NumberKind = 'supplied' | 'calculated' | 'illustration' | 'unsupported' | 'mismatched-meaning' | 'miscalculated' | 'illustration-as-target' | 'illustration-reused';
export const UNSUPPORTED: ReadonlySet<NumberKind> = new Set(['unsupported', 'mismatched-meaning', 'miscalculated', 'illustration-as-target', 'illustration-reused']);
export interface NumericClaim { text: string; values: number[]; unit: Unit; kind: NumberKind; sentence: string; why?: string; /** offset of `text` within `sentence` */ at: number }

type Unit = 'percent' | 'money' | 'multiple' | 'duration' | 'count';
interface Quantity { text: string; values: number[]; unit: Unit; currency: string | null; period: string | null; meanings: Set<string>; index: number }

const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const SCALE_RE = String.raw`(?:\s?(?:k|m|bn|million|billion|thousand)\b)?`;
// money: £12 / $2k / €1.5m, ranges "£500-2000"; percent: 20%, 2-3%, 20 per cent; multiple: 3x; duration: 3 months.
const QUANTITY = new RegExp(
  String.raw`(?<money>[£$€]\s?${NUM}${SCALE_RE}(?:\s?(?:-|–|to)\s?[£$€]?\s?${NUM}${SCALE_RE})?)` +
  String.raw`|(?<pct>\b${NUM}(?:\s?(?:-|–|to)\s?${NUM})?\s?(?:%|per ?cent\b))` +
  String.raw`|(?<mult>\b${NUM}(?:\s?(?:-|–|to)\s?${NUM})?\s?(?:x|×)(?![a-z]))` +
  String.raw`|(?<dur>\b(?:${NUM}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s?(?:-|–|to)\s?${NUM})?\s(?:months?|weeks?|days?|years?)\b)`, 'gi');
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/** Business meanings a number can carry; a claim and its source must share one. */
const MEANINGS: [string, RegExp][] = [
  ['commission', /\b(commission|take ?rate|fee|fees|cut|platform|booking fee|takes)\b/i],
  ['price', /\b(price|prices|pricing|charge|charges|membership|subscription|plan|tier|per seat|aov|order value)\b/i],
  ['cost', /\b(cost|costs|spend|spending|expense|expenses|bill|budget|outgoings|share of costs)\b/i],
  ['margin', /\b(margin|margins|profit|profitability|contribution)\b/i],
  ['cash', /\b(cash|runway|bank|money left|overdraft)\b/i],
  ['churn', /\b(churn|leave|leaving|left|cancel|cancellations|retention|retain|drop off|drop-off|drop)\b/i],
  ['conversion', /\b(conversion|convert|converts|sign-?ups?|checkout)\b/i],
  ['revenue', /\b(revenue|sales|income|turnover|arr|mrr|growth|grow)\b/i],
  ['payment', /\b(payment|processing|transaction|card)\b/i],
];
const PERIOD: [string, RegExp][] = [
  ['month', /\b(per month|a month|monthly|\/ ?mo(nth)?)\b/i], ['year', /\b(per year|a year|annual|annually|yearly|\/ ?yr)\b/i],
  ['week', /\b(per week|a week|weekly)\b/i], ['unit', /\b(per (order|walk|job|transaction|booking|sale|customer|seat|user))\b/i],
];
const ILLUSTRATION = /\b(illustrat\w*|hypothetical\w*|made-up|not a benchmark)\b/i;
// Phrasing that turns a number into a recommendation, price, spending commitment or success threshold.
const DIRECTIVE = /\b(charge|set (your |the )?(price|fee|rate)|price (it )?at|raise (it |prices? |the fee )?to|lower (it |prices? |the fee )?to|cut (it |the fee )?to|target|aim (for|at)|spend|budget|commit|offer \d|go with|should be|recommend)\b/i;

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 0.01);

function valuesOf(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn|million|billion|thousand)?\b/gi)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n * (m[2] ? SCALE[m[2].toLowerCase()] ?? 1 : 1));
  }
  const word = text.trim().match(/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i)?.[1];
  if (word) out.unshift(WORD_NUM[word.toLowerCase()]);
  return out;
}

/** Words within the number's own clause, on each side (commas, semicolons and dashes end a clause). */
function clauseAround(text: string, start: number, end: number): string {
  const left = text.slice(0, start), right = text.slice(end);
  // Colons introduce labels ("Share of costs: AWS: 30%"), so they do not end a clause.
  const l = left.split(/[;—\n]|,\s|\s-\s|\.\s/).pop() ?? '';
  const r = right.split(/[;:—.!?\n]|,\s|\s-\s/)[0] ?? '';
  return `${l.split(/\s+/).slice(-7).join(' ')} ${r.split(/\s+/).slice(0, 7).join(' ')}`;
}

/** Words right next to the number: two before and three after, within its clause. These describe what it measures. */
function adjacent(text: string, start: number, end: number): string {
  const left = (text.slice(0, start).split(/[;—\n]|,\s|\s-\s|\.\s/).pop() ?? '').trim().split(/\s+/).slice(-2).join(' ');
  const right = (text.slice(end).split(/[;:—.!?\n]|,\s|\s-\s/)[0] ?? '').trim().split(/\s+/).slice(0, 3).join(' ');
  return `${left} ${right}`;
}
// "20% of your walkers" is a share of a group of people or things, not a rate charged or paid.
const POPULATION = /^\s*of\s+(your|the|their|all|our)?\s*(customers|users|walkers|buyers|clients|subscribers|members|visitors|owners|contractors|makers|sellers|people|staff|team|leads|traffic|sign-?ups|shoppers)\b/i;

/**
 * Every quantity in `text` with its unit, currency, period and meanings. Claims take meaning from adjacent words only
 * (a wider window misread "Whether 3.4% hurts depends on your margin" as a margin claim). Supplied facts are often
 * labelled further away ("Commission on each order (8%)"), so `source` falls back to the number's whole clause when
 * adjacent words carry no meaning; otherwise a meaning-free source would support a claim of any meaning.
 */
function quantities(text: string, source = false): Quantity[] {
  const out: Quantity[] = [];
  for (const m of text.matchAll(QUANTITY)) {
    const g = m.groups ?? {};
    const raw = m[0];
    const unit: Unit = g.money ? 'money' : g.pct ? 'percent' : g.mult ? 'multiple' : 'duration';
    const values = valuesOf(raw.replace(/[£$€]/g, ''));
    if (!values.length) continue;
    const ctx = clauseAround(text, m.index ?? 0, (m.index ?? 0) + raw.length);
    const near = adjacent(text, m.index ?? 0, (m.index ?? 0) + raw.length);
    let meanings = new Set(MEANINGS.filter(([, re]) => re.test(near)).map(([k]) => k));
    if (source && !meanings.size) meanings = new Set(MEANINGS.filter(([, re]) => re.test(ctx)).map(([k]) => k));
    if (POPULATION.test(text.slice((m.index ?? 0) + raw.length))) meanings.add('population-share');
    if (unit === 'duration' && /\b(cash|runway)\b/i.test(ctx)) meanings.add('cash');
    out.push({ text: raw.trim(), values, unit, currency: raw.match(/[£$€]/)?.[0] ?? null, period: PERIOD.find(([, re]) => re.test(ctx))?.[0] ?? null, meanings, index: m.index ?? 0 });
  }
  return out;
}

/** Recompute a recognised calculation in the sentence; null when none applies to this result. */
function checkCalculation(result: Quantity, sentence: string, supported: Quantity[]): 'ok' | 'wrong' | null {
  const vals = (q: Quantity) => q.values;
  const inputs = quantities(sentence).filter((q) => q.index !== result.index && supported.some((s) => s.unit === q.unit && vals(q).every((v) => s.values.some((w) => near(v, w)))));
  if (!inputs.length) return null;
  const r = result.values[0];
  // "A% of B is C" / "C is A% of B"
  for (const p of inputs.filter((q) => q.unit === 'percent')) for (const b of inputs.filter((q) => q.unit === 'money' && q !== p)) {
    if (new RegExp(`${escapeRe(p.text)}\\s+of\\s+(your\\s+|the\\s+)?${escapeRe(b.text)}`, 'i').test(sentence) && result.unit === 'money') return near(r, (p.values[0] * b.values[0]) / 100) ? 'ok' : 'wrong';
  }
  // A cost change applied to its share of total costs: "a 10% rise in X, which is 30% of your costs, raises total costs by 3%".
  // The change applies to the item's share of costs, not to total costs: total change = share × change / 100. The share
  // comes from the founder's numbers even when the sentence does not repeat it.
  const totalPhrase = new RegExp(`total (costs?|cost base|spend)(\\s+\\w+){0,2}\\s+(by|of)\\s+${escapeRe(result.text)}`, 'i').exec(sentence);
  // Only the number the "total costs … by" phrase points at is the result (identical numbers elsewhere are inputs).
  if (result.unit === 'percent' && totalPhrase && totalPhrase.index + totalPhrase[0].length - result.text.length === result.index) {
    const change = inputs.find((q) => q.unit === 'percent');
    const shares = supported.filter((q) => q.unit === 'percent' && q.meanings.has('cost') && (!change || !q.values.some((v) => near(v, change.values[0]))));
    if (change && shares.length === 1) return near(r, (shares[0].values[0] * change.values[0]) / 100) ? 'ok' : 'wrong';
  }
  // Explicit operators: "A × B = C", "A / B = C", "A + B = C", "A - B = C".
  const op = sentence.match(new RegExp(`(${NUM})\\s*([×x*/+−-])\\s*[£$€]?(${NUM})\\s*%?\\s*(=|is|comes to|equals)\\s*[£$€]?\\s*${escapeRe(String(result.text).replace(/[£$€%]/g, '').trim())}`, 'i'));
  if (op) {
    const [x, y] = [Number(op[1].replace(/,/g, '')), Number(op[3].replace(/,/g, ''))];
    const v = op[2] === '/' ? x / y : op[2] === '+' ? x + y : op[2] === '-' || op[2] === '−' ? x - y : x * y;
    return near(r, v) ? 'ok' : 'wrong';
  }
  return null;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** Does a supplied quantity support this claim (value, unit, currency, period and meaning)? */
function supports(s: Quantity, c: Quantity): boolean {
  if (s.unit !== c.unit || (c.currency && s.currency && c.currency !== s.currency)) return false;
  if (!c.values.every((v) => s.values.some((w) => near(v, w)))) return false;
  if (c.period && s.period && c.period !== s.period) return false;
  return true;
}
// What the business pays or charges per transaction is one family: a commission is a fee, a price and a cost to someone.
const PAID = new Set(['commission', 'price', 'cost', 'payment']);
const sharesMeaning = (a: Set<string>, b: Set<string>) => [...a].some((m) => b.has(m) || (PAID.has(m) && [...b].some((n) => PAID.has(n))));

/** Classify every quantitative claim in `answer` against the material the model was given. */
export function traceNumbers(answer: string, suppliedText: string): { claims: NumericClaim[]; unsupported: NumericClaim[] } {
  const supplied = quantities(suppliedText, true);
  const claims: NumericClaim[] = [];
  const illustrationValues: number[] = [];
  for (const sentence of sentencesOf(answer)) {
    const labelled = ILLUSTRATION.test(sentence);
    for (const q of quantities(sentence)) {
      // Bare durations in a next step ("in two weeks") are planning, not claims, unless they carry a business meaning.
      if (q.unit === 'duration' && !q.meanings.size) continue;
      const base = { text: q.text, values: q.values, unit: q.unit, sentence, at: q.index };
      const sameValue = supplied.filter((s) => supports(s, q));
      const calc = checkCalculation(q, sentence, supplied);
      let kind: NumberKind; let why: string | undefined;
      if (calc === 'ok') kind = 'calculated';
      else if (calc === 'wrong') { kind = 'miscalculated'; why = 'the calculation does not follow from the supplied inputs'; }
      // A restatement without its own meaning words ("Keep 20% for now") is supported when every matching supplied
      // number shares one meaning (unambiguous); a claim with meaning words must share one with its source.
      else if (sameValue.length && (q.meanings.size === 0
        ? [...sameValue[0].meanings].some((m) => sameValue.every((s) => s.meanings.has(m))) || sameValue.every((s) => s.meanings.size === 0)
        // A share of people ("8% of your buyers") is only supported by a share of people, never by a rate.
        : sameValue.some((s) => sharesMeaning(s.meanings, q.meanings) || (s.meanings.size === 0 && !q.meanings.has('population-share'))))) kind = 'supplied';
      else if (sameValue.length) { kind = 'mismatched-meaning'; why = `the supplied ${q.text} means ${[...sameValue[0].meanings].join('/') || 'something else'}, not ${[...q.meanings].join('/')}`; }
      else if (labelled && !DIRECTIVE.test(sentence)) { kind = 'illustration'; illustrationValues.push(...q.values); }
      else if (labelled) { kind = 'illustration-as-target'; why = 'an illustrative figure phrased as a recommendation'; }
      else if (q.values.every((v) => illustrationValues.some((w) => near(v, w)))) { kind = 'illustration-reused'; why = 'an earlier illustrative figure reused as a recommendation'; }
      else kind = 'unsupported';
      claims.push({ ...base, kind, ...(why ? { why } : {}) });
    }
  }
  return { claims, unsupported: claims.filter((c) => UNSUPPORTED.has(c.kind)) };
}

/**
 * How an unsupported figure is taken out of a sentence. No placeholder and no substitute number: hedge words that only
 * served the figure go with it ("to, say, 15%" → "to a different rate"), a share of people becomes "some"
 * ("8% of your buyers" → "some of your buyers"), an adjectival figure is dropped ("a 10% rise" → "a rise"), otherwise
 * the figure becomes a neutral phrase for its unit. The phrases state no size and no direction, so the sentence makes
 * no quantitative claim and its conclusion is not strengthened.
 */
const NEUTRAL: Record<Unit, string> = { percent: 'a different rate', money: 'a different amount', multiple: 'a different multiple', duration: 'a different period', count: 'a different number' };
const HEDGE = /(,\s*(?:say|perhaps|maybe),\s*|\b(?:say|about|around|roughly|approximately|nearly|almost|some|perhaps|maybe)\s+|~\s*)$/i;
const SHARE_OF = /^\s+of\s+(?:(your|the|their|our|all)\s+)?/i;
export function rephraseFigure(text: string, pos: number, claim: Pick<NumericClaim, 'text' | 'unit'>): { from: number; to: number; replacement: string } {
  let from = pos;
  const to = pos + claim.text.length;
  const before = text.slice(0, from);
  const hedge = HEDGE.exec(before);
  let lead = '';
  if (hedge) { from -= hedge[0].length; lead = hedge[0].startsWith(',') ? ' ' : ''; }
  const after = text.slice(to);
  const share = claim.unit === 'percent' ? SHARE_OF.exec(after) : null;
  if (share && POPULATION.test(after)) {
    // "8% of your buyers" → "some of your buyers"; "3.4% of visitors" → "some visitors".
    return { from, to: to + share[0].length, replacement: `${lead}some ${share[1] ? `of ${share[1]} ` : ''}` };
  }
  const article = /\b(a|an)\s+$/i.exec(text.slice(0, from));
  if (article && /^[\s-]+[a-z]/i.test(after)) {
    // "a 10% rise" → "a rise": drop the figure and the space after it; fix "a"/"an" for the next word.
    const gap = /^[\s-]+/.exec(after)![0].length;
    const next = after.slice(gap);
    const art = /^[aeiou]/i.test(next) ? 'an' : 'a';
    const artFrom = from - article[0].length;
    return { from: artFrom, to: to + gap, replacement: `${article[1][0] === article[1][0].toUpperCase() ? art[0].toUpperCase() + art.slice(1) : art} ` };
  }
  return { from, to, replacement: `${lead}${NEUTRAL[claim.unit]}` };
}
/** How the closing removal note starts (graders and replay split the answer here). */
export const REMOVAL_NOTE_START = '\n\nI removed ';

/**
 * Streaming enforcement: text is released sentence by sentence; an unsupported figure is replaced in place, so the
 * qualitative advice stays and no unsupported quantitative conclusion reaches the founder. `summary()` closes the answer
 * with what was removed and what would allow a supported calculation.
 */
export function createNumberGate(suppliedText: string) {
  let buffer = '', released = '';
  const removed: NumericClaim[] = [];
  const process = (chunk: string): string => {
    const t = traceNumbers(released + chunk, suppliedText);
    // Replace each unsupported figure at its own position (the same figure can be supported elsewhere in the
    // sentence: "You take 8% of each order, and 8% of your buyers will leave").
    const cuts: { pos: number; claim: NumericClaim }[] = [];
    // Claims come in sentence order; each sentence is found in this chunk once, after the previous one.
    // Claims from text already released come first; skip them (an identical later sentence must not match them).
    const fresh = t.claims.slice(released ? traceNumbers(released, suppliedText).claims.length : 0);
    let cursor = 0, sentence: string | null = null, start = -1, lastAt = -1;
    for (const c of fresh) {
      // A new sentence, or the same sentence text repeated (offsets restart).
      if (c.sentence !== sentence || c.at <= lastAt) {
        sentence = c.sentence;
        start = chunk.indexOf(sentence, cursor);
        if (start >= 0) cursor = start + sentence.length;
      }
      lastAt = c.at;
      if (start < 0 || !UNSUPPORTED.has(c.kind)) continue;
      const pos = start + c.at;
      if (chunk.slice(pos, pos + c.text.length) === c.text) cuts.push({ pos, claim: c });
    }
    let out = chunk;
    for (const { pos, claim } of [...cuts].reverse()) { const r = rephraseFigure(out, pos, claim); out = out.slice(0, r.from) + r.replacement + out.slice(r.to); }
    removed.push(...cuts.map((x) => x.claim));
    released += chunk;
    return out;
  };
  return {
    push(text: string): string {
      buffer += text;
      const cut = Math.max(buffer.lastIndexOf('. '), buffer.lastIndexOf('! '), buffer.lastIndexOf('? '), buffer.lastIndexOf('\n'));
      if (cut < 0) return '';
      const ready = buffer.slice(0, cut + 1); buffer = buffer.slice(cut + 1);
      return process(ready);
    },
    flush(): string { const rest = buffer; buffer = ''; return rest ? process(rest) : ''; },
    removed: () => removed,
    summary(): string | null {
      if (!removed.length) return null;
      const figures = [...new Set(removed.map((r) => r.text))].slice(0, 6);
      // Plain text: the app renders **bold** only, so single asterisks would show literally.
      return `${REMOVAL_NOTE_START}${figures.length === 1 ? 'a figure' : `${figures.length} figures`} that ${figures.length === 1 ? "isn't" : "aren't"} supported by your details, your signals or a correct calculation from them, so the advice above is qualitative. If you share the numbers you'd use — for example your current price, volumes or costs — I can work them out.`;
    },
  };
}

/** Kept for grading reports: a note naming unsupported figures (none when there are none). */
export function unsupportedFiguresNote(unsupported: NumericClaim[]): string | null {
  if (!unsupported.length) return null;
  const figures = [...new Set(unsupported.map((c) => c.text))].slice(0, 6);
  return `\n\n*Check before relying on ${figures.length === 1 ? 'this figure' : 'these figures'}: ${figures.join(', ')} ${figures.length === 1 ? 'is' : 'are'} not supported by your details, your signals or a correct calculation shown here.*`;
}
