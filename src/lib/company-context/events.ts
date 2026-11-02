/**
 * Event-level de-duplication. Several outlets reporting the same event become ONE signal with several source records;
 * repeated articles are not independent corroboration and must not create repeated alerts.
 *
 * Two reports are the same event when they were published close together AND either share a distinctive "named
 * thing" (a versioned product such as "Haiku 5.5" / "GPT-6.1 Terra", or a multi-word proper name) together with
 * enough of their remaining wording, or their headlines overlap strongly. Different events about the same company
 * (e.g. a launch and a later price change) stay separate unless the wording overlaps too.
 */
export interface EventInput { id: string; title: string; published_at?: string | null; created_at?: string | null; url?: string | null }
export interface EventCluster { canonicalId: string; memberIds: string[] }

const FILLER = new Set('a an the and or of for to in on at by with from as is are was be its it this that new now how why what will vs via after over up out into than more less about just'.split(' '));
const GENERIC_NAMES = new Set(['ai', 'api', 'eu', 'uk', 'us', 'usa', 'ceo', 'llm', 'saas']);

/** Strip the trailing " - Publisher" / " | Publisher", bracketed tags and years from a headline. */
export function headlineCore(title: string): string {
  return title
    .replace(/\s+[-–—|]\s+(?:https?:\/\/)?[\w .&'’/-]{2,60}$/u, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b20\d\d\b/g, ' ')
    .trim();
}

function tokens(title: string): string[] {
  return headlineCore(title).toLowerCase().replace(/[“”"'’`,:;!?]/g, ' ').replace(/[^a-z0-9.\-+$% ]/g, ' ').split(/\s+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, '')).filter((t) => t && !FILLER.has(t));
}

/** Distinctive names: versioned products ("haiku 5.5", "gpt-6.1 terra") and capitalised multi-word names. */
export function namedThings(title: string): string[] {
  const core = headlineCore(title);
  const out = new Set<string>();
  const versioned = core.match(/\b[A-Za-z][\w-]*[- ]?\d+(?:\.\d+)*(?:\s+[A-Z][a-z]+)?\b/g) ?? [];
  for (const v of versioned) { const k = v.toLowerCase().replace(/[- ]+/g, ' ').trim(); if (/\d/.test(k) && k.length >= 4 && !/^\d/.test(k)) out.add(k); }
  const proper = core.match(/\b(?:[A-Z][\w&.-]+(?:\s+|$)){2,4}/g) ?? [];
  for (const p of proper) { const k = p.trim().toLowerCase(); if (k.split(' ').length >= 2 && !GENERIC_NAMES.has(k)) out.add(k); }
  return [...out];
}

const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
const time = (e: EventInput) => Date.parse(e.published_at ?? e.created_at ?? '') || 0;

export function sameEvent(a: EventInput, b: EventInput, windowDays = 5): boolean {
  if (a.url && b.url && a.url === b.url) return true;
  const ta = time(a), tb = time(b);
  const gap = ta && tb ? Math.abs(ta - tb) : 0;
  const A = new Set(tokens(a.title)), B = new Set(tokens(b.title));
  const overlap = jaccard(A, B);
  // Near-identical headlines are the same story even when republished weeks later (within the lookback).
  if (overlap >= 0.6 && gap <= 45 * 86_400_000) return true;
  if (gap > windowDays * 86_400_000) return false;
  const shared = namedThings(a.title).filter((n) => namedThings(b.title).includes(n));
  const versionedShared = shared.some((n) => /\d/.test(n));
  // Versioned product names are highly specific: a shared one plus some shared wording is the same launch/event.
  if (versionedShared ? overlap >= 0.12 : shared.length > 0 && overlap >= 0.35) return true;
  // Title-case headlines hide proper names, so also accept three or more shared content words (e.g. "<name> outage
  // ... payments") with moderate overlap inside the window.
  // ...unless both name different versioned products (a 5.5 launch and a 6 launch are different events).
  const va = namedThings(a.title).filter((n) => /\d/.test(n)), vb = namedThings(b.title).filter((n) => /\d/.test(n));
  if (va.length && vb.length && !versionedShared) return false;
  let common = 0; for (const t of A) if (B.has(t) && t.length >= 4) common++;
  return common >= 3 && overlap >= 0.2;
}

/** Group events; the canonical member is the earliest report (the original), ties broken by id for stability. */
export function clusterEvents(items: EventInput[], windowDays = 5): EventCluster[] {
  const sorted = [...items].sort((x, y) => (time(x) - time(y)) || x.id.localeCompare(y.id));
  const clusters: { members: EventInput[] }[] = [];
  for (const item of sorted) {
    // No chaining: join a group only through its original report or at least two of its members, so one article
    // mentioning two products cannot glue two different events together.
    const home = clusters.find((c) => sameEvent(c.members[0], item, windowDays) || c.members.filter((m) => sameEvent(m, item, windowDays)).length >= 2);
    if (home) home.members.push(item); else clusters.push({ members: [item] });
  }
  return clusters.map((c) => ({ canonicalId: c.members[0].id, memberIds: c.members.map((m) => m.id) }));
}
