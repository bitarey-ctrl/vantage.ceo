import Anthropic from "@anthropic-ai/sdk";
import { ModelRefusalError, SONNET_MODEL, sonnetSettings, tokenizerCap } from "./model";
import { createHash } from "node:crypto";
import { recordProviderDiagnostic, recordProviderFailure, recordProviderUsage, reserveProviderCall } from "./provider-budget";
import { classifyFailure, failureCause, type ModelDiagnostic } from "@/lib/company-context/run-status";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  // Approved paid tests allow no automatic retries; production keeps the SDK default.
  ...(process.env.ISOLATED_TEST === "1" ? { maxRetries: 0 } : {}),
});

export const CLAUDE_MODEL = SONNET_MODEL;

interface ClaudeOptions {
  maxTokens?: number;
  system?: string;
}

/**
 * Core inference call — returns parsed JSON or throws.
 * All VANTAGE AI engines go through this function.
 * Note: temperature is NOT passed — newer Claude models don't support it via basic API.
 */
export async function callClaude<T>(
  prompt: string,
  options: ClaudeOptions = {}
): Promise<T> {
  const { maxTokens = 2048 } = options;

  // Same room for the same text under the new tokenizer; the cap also bounds the worst-case reservation.
  const cap = tokenizerCap(maxTokens);
  const slot = reserveProviderCall("callClaude", CLAUDE_MODEL, { inputBytes: Buffer.byteLength(prompt, "utf8"), maxTokens: cap });
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: cap,
      ...sonnetSettings("high"),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });
  } catch (err) {
    // Usage unknown: the slot keeps its worst-case reservation; the class and cause are kept for diagnosis.
    recordProviderFailure(slot, classifyFailure(err), failureCause(err));
    throw err;
  }

  recordProviderUsage(slot, response.usage, response.model);
  if (response.stop_reason === "refusal") throw new ModelRefusalError();
  // Read text blocks by type: newer models can start a response with thinking blocks.
  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlocks.length) {
    throw new Error("Unexpected response type from Claude API");
  }
  const content = { text: textBlocks.map((b) => b.text).join("") };

  const text = content.text.trim();

  // Try to extract JSON from code blocks first, then raw
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonString = codeBlockMatch ? codeBlockMatch[1].trim() : text;

  // Also try extracting bare JSON object/array if above fails
  const jsonObjectMatch = jsonString.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  const finalJson = jsonObjectMatch ? jsonObjectMatch[1] : jsonString;

  try {
    return JSON.parse(finalJson) as T;
  } catch {
    throw new Error(
      `Failed to parse Claude response as JSON: ${finalJson.slice(0, 300)}`
    );
  }
}

/**
 * Why a schema-constrained answer could not be used. The API guarantees schema-valid output only when the model
 * finishes normally (`end_turn`); a refusal or a length stop can break it, so each is reported as itself.
 * `invalid` means it parsed but failed our structural check.
 */
export class StructuredOutputError extends Error {
  readonly kind: "refusal" | "truncated" | "empty" | "parse" | "invalid";
  readonly diagnostic: ModelDiagnostic;
  constructor(kind: StructuredOutputError["kind"], diagnostic: ModelDiagnostic) {
    super(`Structured output unusable (${kind})${diagnostic.failure ? `: ${diagnostic.failure}` : ""}`);
    this.name = "StructuredOutputError";
    this.kind = kind;
    this.diagnostic = diagnostic;
  }
}

/**
 * Schema-constrained JSON call (structured outputs: `output_config.format` with a JSON schema whose root is an
 * object; platform.claude.com/docs/en/build-with-claude/structured-outputs, checked 2026-11-07). Returns the parsed
 * value and bounded diagnostics, or throws StructuredOutputError (refusal, truncation, empty, unparseable, invalid
 * structure). Network and provider failures are thrown as the SDK raised them. `validate` checks structure only;
 * callers still judge content.
 */
export async function callClaudeStructured<T>(
  prompt: string,
  options: { maxTokens: number; schema: Record<string, unknown>; schemaVersion: string; validate: (value: unknown) => string | null }
): Promise<{ data: T; diagnostic: ModelDiagnostic }> {
  const cap = tokenizerCap(options.maxTokens);
  const slot = reserveProviderCall("callClaude", CLAUDE_MODEL, { inputBytes: Buffer.byteLength(prompt, "utf8"), maxTokens: cap });
  const settings = sonnetSettings("high");
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: cap,
      thinking: settings.thinking,
      output_config: { ...settings.output_config, format: { type: "json_schema", schema: options.schema } },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    recordProviderFailure(slot, classifyFailure(err), failureCause(err));
    throw err;
  }
  recordProviderUsage(slot, response.usage, response.model);

  const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const diagnostic: ModelDiagnostic = {
    ok: false,
    model: response.model ?? null,
    requestId: (response as { _request_id?: string | null })._request_id ?? null,
    stopReason: response.stop_reason ?? null,
    usage: response.usage ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } : null,
    schemaVersion: options.schemaVersion,
    outputChars: text.length,
    outputSha256: createHash("sha256").update(text).digest("hex").slice(0, 16),
  };
  const fail = (kind: StructuredOutputError["kind"], failure: string): never => {
    const d = { ...diagnostic, failure };
    recordProviderDiagnostic(slot, { ...d }, text);
    throw new StructuredOutputError(kind, d);
  };

  if (response.stop_reason === "refusal") fail("refusal", "stop_reason refusal");
  if (response.stop_reason === "max_tokens") fail("truncated", `stop_reason max_tokens at ${cap} output tokens`);
  if (response.stop_reason !== "end_turn" && response.stop_reason !== "stop_sequence") fail("truncated", `stop_reason ${response.stop_reason ?? "none"}`);
  if (!text.trim()) fail("empty", "no text in the response");
  let value: unknown;
  // Only the position: the parser's message can quote the output, which must not reach the run record.
  try { value = JSON.parse(text); } catch (err) { fail("parse", `not valid JSON${/position (\d+)/.exec((err as Error).message)?.[1] ? ` at position ${/position (\d+)/.exec((err as Error).message)![1]}` : ""}`); }
  const problem = options.validate(value);
  if (problem) fail("invalid", problem.slice(0, 200));

  const ok = { ...diagnostic, ok: true };
  recordProviderDiagnostic(slot, { ...ok });
  return { data: value as T, diagnostic: ok };
}
