import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
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

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude API");
  }

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
