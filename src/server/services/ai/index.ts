/**
 * AI Provider — Unified entry point
 *
 * Selects between Claude (cloud) and Ollama (self-hosted) based on AI_PROVIDER env var.
 * Default: "ollama" if OLLAMA_BASE_URL is set, otherwise "claude".
 *
 * Exports drop-in replacements for the old claude.ts functions.
 */

import type { AIProvider, AIProviderOptions } from "./types";
import { AIProviderError } from "./types";

// Re-export types
export type { AIProvider, AIProviderOptions };
export { AIProviderError };

// Backward-compatible alias
export { AIProviderError as ClaudeApiError };
export type { AIProviderOptions as ClaudeOptions };

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

let _provider: AIProvider | null = null;

function detectProvider(): string {
  // Explicit choice via env var
  if (process.env.AI_PROVIDER) {
    return process.env.AI_PROVIDER;
  }
  // Auto-detect based on available credentials/services
  if (process.env.ANTHROPIC_API_KEY) {
    return "claude";
  }
  if (process.env.OLLAMA_BASE_URL) {
    return "ollama";
  }
  return "none";
}

export function getAIProvider(): AIProvider {
  if (!_provider) {
    const providerType = detectProvider();

    switch (providerType) {
      case "ollama": {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { OllamaProvider } = require("./provider-ollama") as {
          OllamaProvider: new () => AIProvider;
        };
        _provider = new OllamaProvider();
        break;
      }
      case "claude": {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ClaudeProvider } = require("./provider-claude") as {
          ClaudeProvider: new () => AIProvider;
        };
        _provider = new ClaudeProvider();
        break;
      }
      case "none":
      default: {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { NoopProvider } = require("./provider-noop") as {
          NoopProvider: new () => AIProvider;
        };
        _provider = new NoopProvider();
        break;
      }
    }
  }
  return _provider;
}

// ---------------------------------------------------------------------------
// Convenience functions (backward-compatible with claude.ts API)
// ---------------------------------------------------------------------------

export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options?: AIProviderOptions,
): Promise<string> {
  return getAIProvider().generateText(systemPrompt, userPrompt, options);
}

export async function* generateStream(
  systemPrompt: string,
  userPrompt: string,
  options?: AIProviderOptions,
): AsyncIterable<string> {
  yield* getAIProvider().generateStream(systemPrompt, userPrompt, options);
}
