/**
 * AI Provider Abstraction Layer
 *
 * Defines a common interface for AI text generation providers.
 * Supports: Claude (Anthropic), Ollama (self-hosted).
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AIProviderOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface AIProvider {
  readonly name: string;
  generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: AIProviderOptions,
  ): Promise<string>;
  generateStream(
    systemPrompt: string,
    userPrompt: string,
    options?: AIProviderOptions,
  ): AsyncIterable<string>;
}

// ---------------------------------------------------------------------------
// Error class (replaces ClaudeApiError, backward-compatible)
// ---------------------------------------------------------------------------

export class AIProviderError extends Error {
  public readonly status: number | undefined;
  public readonly code: string;

  constructor(
    message: string,
    opts?: { status?: number; code?: string; cause?: unknown },
  ) {
    super(message, { cause: opts?.cause });
    this.name = "AIProviderError";
    this.status = opts?.status;
    this.code = opts?.code ?? "AI_ERROR";
  }
}
