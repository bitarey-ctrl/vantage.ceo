/**
 * One place for the model and its request settings (migration from claude-sonnet-4-5, which retires 2026-11-30).
 * Source: platform.claude.com/docs/en/models/sonnet-5-5/migration-guide (checked 2026-11-07).
 *
 * - Model: claude-sonnet-5-5 (no date suffix).
 * - Thinking: Sonnet 5.5 thinks by default when `thinking` is omitted. These routes ran without thinking on 4.5, so they
 *   send the guide's lowest setting, `between_tools`, to keep that behaviour (without tools the response is text only).
 *   Adaptive thinking is a later, evaluated change — not part of this migration.
 * - Effort: set explicitly (4.5 had none). Chat is latency-sensitive (guide: start at medium or low); structured
 *   generation keeps the API default, high. `between_tools` accepts low/medium/high only.
 * - Output caps: the new tokenizer produces about 30% more tokens for the same text, so caps are raised by that factor
 *   to keep the same room for the same answer. They also bound worst-case cost.
 * - Responses are read by block type; `stop_reason: "refusal"` is handled by each caller.
 */
import type Anthropic from '@anthropic-ai/sdk';

export const SONNET_MODEL = 'claude-sonnet-5-5';

/** SDK 0.97.1 does not yet type `between_tools`; the API accepts it on claude-sonnet-5-5 (see the guide). */
const NO_UPFRONT_THINKING = { type: 'between_tools' } as unknown as Anthropic.ThinkingConfigParam;

export type Effort = 'low' | 'medium' | 'high';

/** Request settings shared by every Sonnet 5.5 call in this app. */
export function sonnetSettings(effort: Effort): { thinking: Anthropic.ThinkingConfigParam; output_config: { effort: Effort } } {
  return { thinking: NO_UPFRONT_THINKING, output_config: { effort } };
}

/** Same room for the same text under the new tokenizer (about +30%). */
export const tokenizerCap = (maxTokensOnOldModel: number) => Math.ceil(maxTokensOnOldModel * 1.3);

/** The text of a response, read by block type (a response can contain thinking blocks). */
export function textOf(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
}

export class ModelRefusalError extends Error {
  constructor() { super('The model declined this request.'); this.name = 'ModelRefusalError'; }
}
