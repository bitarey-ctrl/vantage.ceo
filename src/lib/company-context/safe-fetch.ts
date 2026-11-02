/**
 * Fetch a public web page or feed safely: HTTPS only, public hosts only (no private, loopback or link-local
 * addresses, checked on every redirect hop), bounded size and time, no cookies or credentials. Retrieved text is
 * untrusted data: callers only parse it, hash it and store short excerpts.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface FetchedPage { ok: boolean; status: number; finalUrl: string; contentType: string; text: string; error?: string }

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:') && privateAddress(v.slice(7));
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function assertPublicHttps(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('Only https addresses are fetched');
  if (url.username || url.password) throw new Error('Addresses with credentials are not fetched');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) { if (privateAddress(host)) throw new Error('Private address'); return url; }
  if (!host.includes('.') || /\.(local|localhost|internal|lan|home|corp)$/i.test(host)) throw new Error('Non-public host');
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error('Host resolves to a private address');
  return url;
}

export async function safeFetch(raw: string, opts: { timeoutMs?: number; maxBytes?: number; accept?: string; fetchImpl?: typeof fetch } = {}): Promise<FetchedPage> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? 1_500_000;
  let current = raw;
  try {
    for (let hop = 0; hop < 5; hop++) {
      const url = await assertPublicHttps(current);
      const res = await doFetch(url.href, {
        redirect: 'manual', signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
        headers: { 'user-agent': 'VANTAGE-research/1.0 (+https://www.vantage.ceo)', accept: opts.accept ?? 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.5' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location')!, url).href; continue; }
      const reader = res.body?.getReader();
      let received = 0; const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > maxBytes) { await reader.cancel(); break; }
          chunks.push(value);
        }
      }
      const text = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
      return { ok: res.ok, status: res.status, finalUrl: url.href, contentType: res.headers.get('content-type') ?? '', text, ...(res.ok ? {} : { error: `HTTP ${res.status}` }) };
    }
    return { ok: false, status: 0, finalUrl: current, contentType: '', text: '', error: 'Too many redirects' };
  } catch (error) {
    return { ok: false, status: 0, finalUrl: current, contentType: '', text: '', error: (error as Error).message.slice(0, 160) };
  }
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

/** Title and readable text of an HTML page (scripts, styles, navigation and footers removed). */
export function pageText(html: string): { title: string; text: string } {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const body = html.replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const text = decode(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return { title, text };
}

/** A feed advertised by the page (<link rel="alternate" type="application/rss+xml|atom+xml">). */
export function feedLink(html: string, base: string): string | null {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) { try { return new URL(decode(href), base).href; } catch { /* ignore */ } }
  }
  return null;
}
