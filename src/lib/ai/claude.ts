import Anthropic from "@anthropic-ai/sdk";
import { ModelRefusalError, SONNET_MODEL, sonnetSettings, tokenizerCap } from "./model";
import { recordProviderFailure, recordProviderUsage, reserveProviderCall } from "./provider-budget";
import { classifyFailure, failureCause } from "@/lib/company-context/run-status";

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
