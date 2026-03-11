/**
 * No-op AI Provider — used when no AI backend is configured.
 *
 * Returns a friendly message instead of crashing, so the app
 * runs fine without Ollama or Claude API keys.
 */

import type { AIProvider, AIProviderOptions } from "./types";
import { AIProviderError } from "./types";

const DISABLED_MSG =
  "AI is not configured. Set AI_PROVIDER=ollama or AI_PROVIDER=claude with the appropriate env vars.";

export class NoopProvider implements AIProvider {
  readonly name = "noop";

  async generateText(
    _systemPrompt: string,
    _userPrompt: string,
    _options?: AIProviderOptions,
  ): Promise<string> {
    throw new AIProviderError(DISABLED_MSG, { code: "AI_DISABLED" });
  }

  async *generateStream(
    _systemPrompt: string,
    _userPrompt: string,
    _options?: AIProviderOptions,
  ): AsyncIterable<string> {
    throw new AIProviderError(DISABLED_MSG, { code: "AI_DISABLED" });
  }
}
