/**
 * Ollama (self-hosted) AI Provider
 *
 * Communicates with a local Ollama instance via its REST API.
 * No external SDK needed — uses native fetch.
 */

import type { AIProvider, AIProviderOptions } from "./types";
import { AIProviderError } from "./types";

const DEFAULT_MODEL = "llama3.1:8b";
const DEFAULT_MAX_TOKENS = 4096;

interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";

  private get baseUrl(): string {
    return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  }

  private get defaultModel(): string {
    return process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: AIProviderOptions,
  ): Promise<string> {
    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options?.model ?? this.defaultModel,
          messages,
          stream: false,
          options: {
            num_predict: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: options?.temperature ?? 0.7,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new AIProviderError(
          `Ollama API error: ${response.status} — ${errorText}`,
          { status: response.status, code: "OLLAMA_API_ERROR" },
        );
      }

      const data = (await response.json()) as OllamaChatResponse;

      if (!data.message?.content) {
        throw new AIProviderError("No content in Ollama response", {
          code: "EMPTY_RESPONSE",
        });
      }

      return data.message.content;
    } catch (error) {
      if (error instanceof AIProviderError) throw error;

      throw new AIProviderError(
        `Failed to connect to Ollama at ${this.baseUrl}. Is Ollama running?`,
        { code: "CONNECTION_ERROR", cause: error },
      );
    }
  }

  async *generateStream(
    systemPrompt: string,
    userPrompt: string,
    options?: AIProviderOptions,
  ): AsyncIterable<string> {
    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options?.model ?? this.defaultModel,
          messages,
          stream: true,
          options: {
            num_predict: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: options?.temperature ?? 0.7,
          },
        }),
      });
    } catch (error) {
      throw new AIProviderError(
        `Failed to connect to Ollama at ${this.baseUrl}. Is Ollama running?`,
        { code: "CONNECTION_ERROR", cause: error },
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new AIProviderError(
        `Ollama streaming error: ${response.status} — ${errorText}`,
        { status: response.status, code: "OLLAMA_STREAM_ERROR" },
      );
    }

    if (!response.body) {
      throw new AIProviderError("No response body from Ollama", {
        code: "NO_BODY",
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as OllamaChatResponse;
            if (chunk.message?.content) {
              yield chunk.message.content;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer) as OllamaChatResponse;
          if (chunk.message?.content) {
            yield chunk.message.content;
          }
        } catch {
          // ignore
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
