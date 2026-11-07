import Anthropic from "@anthropic-ai/sdk";
import { recordProviderFailure, recordProviderUsage, reserveProviderCall } from "./provider-budget";
import { classifyFailure, failureCause } from "@/lib/company-context/run-status";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  // Approved paid tests allow no automatic retries; production keeps the SDK default.
  ...(process.env.ISOLATED_TEST === "1" ? { maxRetries: 0 } : {}),
});

export const CLAUDE_MODEL = "claude-sonnet-4-5";

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

  const slot = reserveProviderCall("callClaude", CLAUDE_MODEL, { inputBytes: Buffer.byteLength(prompt, "utf8"), maxTokens });
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
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

  recordProviderUsage(slot, response.usage);
  if (response.stop_reason === "refusal") throw new Error("The model declined this request (refusal).");
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
