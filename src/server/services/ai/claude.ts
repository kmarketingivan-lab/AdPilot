import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export class ClaudeApiError extends Error {
  public readonly status: number | undefined;
  public readonly code: string;

  constructor(
    message: string,
    opts?: { status?: number; code?: string; cause?: unknown }
  ) {
    super(message, { cause: opts?.cause });
    this.name = "ClaudeApiError";
    this.status = opts?.status;
    this.code = opts?.code ?? "CLAUDE_ERROR";
  }
}

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ClaudeApiError(
        "ANTHROPIC_API_KEY is not set. Add it to your .env file.",
        { code: "MISSING_API_KEY" }
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaudeOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Non-streaming completion
// ---------------------------------------------------------------------------

export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options?: ClaudeOptions
): Promise<string> {
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: options?.model ?? DEFAULT_MODEL,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new ClaudeApiError("No text content in Claude response", {
        code: "EMPTY_RESPONSE",
      });
    }

    return textBlock.text;
  } catch (error) {
    if (error instanceof ClaudeApiError) throw error;

    if (error instanceof Anthropic.APIError) {
      throw new ClaudeApiError(error.message, {
        status: error.status,
        code: "API_ERROR",
        cause: error,
      });
    }

    throw new ClaudeApiError("Unexpected error calling Claude API", {
      code: "UNKNOWN_ERROR",
      cause: error,
    });
  }
}

// ---------------------------------------------------------------------------
// Streaming completion — returns an AsyncIterable of text chunks
// ---------------------------------------------------------------------------

export async function* generateStream(
  systemPrompt: string,
  userPrompt: string,
  options?: ClaudeOptions
): AsyncIterable<string> {
  const client = getClient();

  try {
    const stream = client.messages.stream({
      model: options?.model ?? DEFAULT_MODEL,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  } catch (error) {
    if (error instanceof ClaudeApiError) throw error;

    if (error instanceof Anthropic.APIError) {
      throw new ClaudeApiError(error.message, {
        status: error.status,
        code: "STREAM_ERROR",
        cause: error,
      });
    }

    throw new ClaudeApiError("Unexpected error streaming from Claude API", {
      code: "UNKNOWN_STREAM_ERROR",
      cause: error,
    });
  }
}
