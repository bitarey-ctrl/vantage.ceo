/**
 * Advisor model configuration and stream protocol (server side).
 *
 * Every Advisor stream ends with exactly one terminal event, so a client can never mistake a cut-off answer for a
 * finished one:
 *
 *   data: {"delta": "..."}                       answer text (the memory marker is never sent)
 *   data: {"memory": {...}}                      outcome of a durable memory write (complete answers only)
 *   data: {"end": {"status": "...", ...}}        terminal: complete | max_tokens | refusal | incomplete
 *   data: {"error": {"kind": "...", ...}}        terminal: the provider or server failed
 *
 * A transport drop produces neither terminal event; the client treats that as incomplete.
 * There is no "[DONE]" sentinel: it was sent even after a token-limit cut-off, which is how truncated answers were
 * saved as complete.
 */
import Anthropic from '@anthropic-ai/sdk';

export const ADVISOR_MODEL = 'claude-sonnet-4-5';
/** Output ceiling. The prompt asks for short answers well inside this; hitting it is reported, never hidden. */
export const ADVISOR_MAX_TOKENS = 1000;
/** The output cap actually used. A lower cap is honoured only in the isolated test environment (length-limit test). */
export function advisorMaxTokens(requested?: string | null): number {
  const test = Number(requested ?? process.env.ADVISOR_MAX_TOKENS_TEST);
  return process.env.ISOLATED_TEST === '1' && Number.isInteger(test) && test >= 16 && test < ADVISOR_MAX_TOKENS ? test : ADVISOR_MAX_TOKENS;
}
export const MEMORY_TAG = '[[VANTAGE_MEMORY]]';

export type EndStatus = 'complete' | 'max_tokens' | 'refusal' | 'incomplete';

export function endStatus(stopReason: string | null | undefined): EndStatus {
  if (stopReason === 'end_turn' || stopReason === 'stop_sequence') return 'complete';
  if (stopReason === 'max_tokens') return 'max_tokens';
  if (stopReason === 'refusal') return 'refusal';
  return 'incomplete'; // pause_turn, tool_use, null, or anything unexpected
}

/**
 * Removes the memory marker from streamed text. Text is held back only while it could be the start of the marker
 * (the marker can arrive split across deltas); everything from the marker on is never emitted.
 */
export function createMarkerFilter() {
  let pending = '';
  let suppressed = false;
  return {
    push(text: string): string {
      if (suppressed) return '';
      pending += text;
      const at = pending.indexOf(MEMORY_TAG);
      if (at !== -1) { const out = pending.slice(0, at); pending = ''; suppressed = true; return out; }
      // Keep the longest suffix that is a prefix of the tag; emit the rest.
      let keep = 0;
      for (let n = Math.min(MEMORY_TAG.length - 1, pending.length); n > 0; n--) if (MEMORY_TAG.startsWith(pending.slice(-n))) { keep = n; break; }
      const out = pending.slice(0, pending.length - keep);
      pending = pending.slice(pending.length - keep);
      return out;
    },
    /** Remaining held-back text at the end of the stream (it was not the marker). */
    flush(): string { const out = suppressed ? '' : pending; pending = ''; return out; },
  };
}

export type ErrorKind = 'rate_limited' | 'overloaded' | 'unavailable' | 'bad_request' | 'server';

/** A provider/server failure reduced to a safe category and sentence. Raw provider text is never sent to the client. */
export function safeError(err: unknown): { kind: ErrorKind; message: string } {
  if (err instanceof Anthropic.RateLimitError) return { kind: 'rate_limited', message: 'The Advisor is handling too many requests. Try again in a minute.' };
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    const text = String((err as { message?: string }).message ?? '');
    if (status === 529 || /overloaded/i.test(text)) return { kind: 'overloaded', message: 'The AI provider is overloaded. Try again shortly.' };
    if (/credit balance|billing/i.test(text)) return { kind: 'unavailable', message: 'The Advisor is unavailable right now (the AI account needs attention). Nothing was changed.' };
    if (status === 401 || status === 403) return { kind: 'unavailable', message: 'The Advisor is unavailable right now. Nothing was changed.' };
    if (status >= 400 && status < 500) return { kind: 'bad_request', message: 'The Advisor could not process this conversation. Nothing was changed.' };
  }
  return { kind: 'server', message: 'The Advisor could not finish this answer. Nothing was changed.' };
}

export const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

type Send = (value: unknown) => void;
interface ProviderStream {
  on(event: 'text', listener: (text: string) => void): unknown;
  finalMessage(): Promise<{ stop_reason: string | null; content: { type: string; text?: string }[] }>;
}
export interface MemoryReport { ok: boolean; [k: string]: unknown }

/**
 * Relay one provider stream to the client and decide its outcome. Memory is written only for a complete answer
 * while the client is still connected. Returns what happened, for logging and tests.
 */
export async function relayAdvisorStream(opts: {
  stream: ProviderStream; send: Send; clientGone: () => boolean;
  applyFromReply: (reply: string) => Promise<MemoryReport | null>;
  onUsage?: (usage: unknown) => void;
}): Promise<{ status: EndStatus | 'error' | 'disconnected'; memory: 'applied' | 'none' | 'skipped' | 'failed' }> {
  const { stream, send, clientGone, applyFromReply } = opts;
  const filter = createMarkerFilter();
  try {
    stream.on('text', (text) => { const visible = filter.push(text); if (visible) send({ delta: visible }); });
    const final = await stream.finalMessage();
    opts.onUsage?.((final as { usage?: unknown }).usage);
    const tail = filter.flush();
    if (tail) send({ delta: tail });
    const status = endStatus(final.stop_reason);
    const replyText = final.content.map((b) => (b.type === 'text' ? b.text ?? '' : '')).join('');
    let memory: 'applied' | 'none' | 'skipped' | 'failed' = 'none';
    if (clientGone()) return { status: 'disconnected', memory: replyText.includes(MEMORY_TAG) ? 'skipped' : 'none' };
    if (status === 'complete') {
      try {
        const m = await applyFromReply(replyText);
        if (m) { send({ memory: m }); memory = m.ok ? 'applied' : 'failed'; }
      } catch (err) {
        console.error('[advisor] Memory write failed:', err instanceof Error ? err.message.slice(0, 200) : 'unknown');
        send({ memory: { ok: false, error: 'Could not save that to your profile.' } });
        memory = 'failed';
      }
    } else if (replyText.includes(MEMORY_TAG)) memory = 'skipped';
    send({ end: { status, stopReason: final.stop_reason ?? null, memory } });
    return { status, memory };
  } catch (err) {
    if (clientGone()) return { status: 'disconnected', memory: 'none' };
    const safe = safeError(err);
    console.error('[advisor] Stream error:', safe.kind);
    send({ error: safe });
    return { status: 'error', memory: 'none' };
  }
}
