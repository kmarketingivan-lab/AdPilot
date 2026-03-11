/**
 * Claude (Anthropic) AI Provider
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AIProviderOptions } from "./types";
import { AIProviderError } from "./types";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;

export class ClaudeProvider implements AIProvider {
  readonly name = "claude";
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new AIProviderError(
          "ANTHROPIC_API_KEY is not set. Add it to your .env file.",
          { code: "MISSING_API_KEY" },
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: AIProviderOptions,
  ): Promise<string> {
    const client = this.getClient();

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
        throw new AIProviderError("No text content in Claude response", {
          code: "EMPTY_RESPONSE",
        });
      }

      return textBlock.text;
    } catch (error) {
      if (error instanceof AIProviderError) throw error;

      if (error instanceof Anthropic.APIError) {
        throw new AIProviderError(error.message, {
          status: error.status,
          code: "API_ERROR",
          cause: error,
        });
      }

      throw new AIProviderError("Unexpected error calling Claude API", {
        code: "UNKNOWN_ERROR",
        cause: error,
      });
    }
  }

  async *generateStream(
    systemPrompt: string,
    userPrompt: string,
    options?: AIProviderOptions,
  ): AsyncIterable<string> {
    const client = this.getClient();

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
      if (error instanceof AIProviderError) throw error;

      if (error instanceof Anthropic.APIError) {
        throw new AIProviderError(error.message, {
          status: error.status,
          code: "STREAM_ERROR",
          cause: error,
        });
      }

      throw new AIProviderError(
        "Unexpected error streaming from Claude API",
        { code: "UNKNOWN_STREAM_ERROR", cause: error },
      );
    }
  }
}
