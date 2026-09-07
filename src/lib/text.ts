/**
 * Plain-text rendering for feed-sourced strings.
 *
 * Signal titles and content come from RSS and NewsAPI, and arrive carrying
 * markup: `<a href="...">`, `<font>`, and entities like `&#8217;`.
 *
 * ORDER MATTERS. Stripping tags before decoding entities does not work, and is
 * how the bad data got stored in the first place (rss-ingestion.ts does
 * `decodeEntities(stripHtml(raw))`). Google News double-encodes, so a link
 * arrives as `&lt;a href=...&gt;`: tag-stripping finds no literal tags and
 * leaves it, then decoding turns it INTO a tag. Decode first, then strip, then
 * decode again for entities that were nested inside the removed markup.
 *
 * This is a DISPLAY-layer helper. Stored rows are left untouched, so it has to
 * cope with whatever is already in the database.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  deg: "°",
  eacute: "é",
  egrave: "è",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
  ccedil: "ç",
  trade: "™",
  reg: "®",
  copy: "©",
  euro: "€",
  pound: "£",
  cent: "¢",
};

/** Numeric code points outside the valid Unicode range would throw. */
function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]{1,10});/gi, (match, name: string) => {
      const replacement = NAMED_ENTITIES[name.toLowerCase()];
      return replacement === undefined ? match : replacement;
    });
}

function stripTags(input: string): string {
  return input
    // Drop script/style bodies entirely rather than leaving their contents.
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Block-level boundaries become spaces so words do not fuse together.
    .replace(/<\/?(p|div|br|li|tr|h[1-6]|blockquote)\b[^>]*>/gi, " ")
    // Only treat `<...>` as a tag when it actually looks like one: `<` followed
    // by a letter, `/`, `!` or `?`. A bare `<[^>]*>` also swallows ordinary
    // prose — "revenue < $1M and margin > 20%" collapsed to "revenue 20%",
    // which matters a lot in a product about pricing and cost.
    .replace(/<\/?[a-zA-Z!?][^>]*>/g, "");
}

/**
 * Convert a feed-sourced string into clean, displayable text.
 *
 * Safe to call on already-clean strings and on null/undefined.
 */
export function toPlainText(raw: string | null | undefined): string {
  if (!raw) return "";

  let text = String(raw);
  text = decodeEntities(text);
  text = stripTags(text);
  text = decodeEntities(text);

  return text.replace(/\s+/g, " ").trim();
}
