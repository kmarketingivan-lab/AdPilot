import { generateText, type ClaudeOptions } from "@/server/services/ai/claude";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubjectLineRequest {
  /** Brief description of the email campaign */
  brief: string;
  /** Target audience description */
  audience?: string;
  /** Tone of voice */
  tone?: "professional" | "casual" | "friendly" | "urgent" | "playful";
  /** Number of variants to generate */
  count?: number;
}

export interface SubjectLineResult {
  subjects: string[];
}

export interface EmailBodyRequest {
  /** What the email should accomplish */
  brief: string;
  /** Subject line (for context) */
  subject?: string;
  /** Target audience */
  audience?: string;
  /** Tone of voice */
  tone?: "professional" | "casual" | "friendly" | "urgent" | "playful";
  /** Call-to-action text */
  ctaText?: string;
  /** Call-to-action URL */
  ctaUrl?: string;
  /** Sender name for sign-off */
  senderName?: string;
  /** Company name */
  companyName?: string;
}

export interface EmailBodyResult {
  html: string;
  plainText: string;
}

// ---------------------------------------------------------------------------
// Claude options (lower temperature for more controlled output)
// ---------------------------------------------------------------------------

const AI_OPTIONS: ClaudeOptions = {
  maxTokens: 4096,
  temperature: 0.8,
};

const BODY_OPTIONS: ClaudeOptions = {
  maxTokens: 4096,
  temperature: 0.6,
};

// ---------------------------------------------------------------------------
// Subject line generation
// ---------------------------------------------------------------------------

const SUBJECT_SYSTEM_PROMPT = `You are an expert email marketing copywriter. Your job is to generate compelling email subject lines that maximize open rates.

Rules:
- Each subject line should be under 60 characters
- Use proven techniques: curiosity, urgency, personalization, benefit-driven
- Avoid spam trigger words (free, guarantee, act now, etc.)
- Vary the approach across variants (question, statement, number, emoji, etc.)
- Return ONLY a JSON array of strings, no explanation or markdown`;

/**
 * Generate multiple subject line variants using Claude.
 */
export async function generateSubjectLines(
  request: SubjectLineRequest,
): Promise<SubjectLineResult> {
  const count = request.count ?? 5;

  const userPrompt = buildSubjectPrompt(request, count);

  const raw = await generateText(SUBJECT_SYSTEM_PROMPT, userPrompt, AI_OPTIONS);

  // Parse JSON array from response
  const subjects = parseJsonArray(raw, count);

  return { subjects };
}

function buildSubjectPrompt(request: SubjectLineRequest, count: number): string {
  const parts = [
    `Generate ${count} email subject line variants.`,
    `\nBrief: ${request.brief}`,
  ];

  if (request.audience) {
    parts.push(`Target audience: ${request.audience}`);
  }
  if (request.tone) {
    parts.push(`Tone: ${request.tone}`);
  }

  parts.push(`\nReturn a JSON array of ${count} strings. No markdown, no explanation.`);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Email body generation
// ---------------------------------------------------------------------------

const BODY_SYSTEM_PROMPT = `You are an expert email marketing copywriter. Generate a complete email body in clean, responsive HTML.

Rules:
- Use inline CSS for email client compatibility
- Use a clean, single-column layout with max-width 600px
- Include a clear call-to-action button if CTA details are provided
- Keep paragraphs short (2-3 sentences max)
- Use a professional email structure: greeting, body, CTA, sign-off
- DO NOT include <html>, <head>, or <body> tags — only the inner content
- Use {{firstName}} and {{lastName}} as personalization placeholders where appropriate
- Return a JSON object with two keys: "html" (the HTML content) and "plainText" (plain text version)
- No markdown fences, no explanation — ONLY the JSON object`;

/**
 * Generate a complete email body from a brief using Claude.
 */
export async function generateEmailBody(
  request: EmailBodyRequest,
): Promise<EmailBodyResult> {
  const userPrompt = buildBodyPrompt(request);

  const raw = await generateText(BODY_SYSTEM_PROMPT, userPrompt, BODY_OPTIONS);

  // Parse JSON response
  const parsed = parseJsonObject(raw);

  return {
    html: parsed.html ?? "<p>Could not generate email body.</p>",
    plainText: parsed.plainText ?? "Could not generate email body.",
  };
}

function buildBodyPrompt(request: EmailBodyRequest): string {
  const parts = [`Brief: ${request.brief}`];

  if (request.subject) {
    parts.push(`Subject line: ${request.subject}`);
  }
  if (request.audience) {
    parts.push(`Target audience: ${request.audience}`);
  }
  if (request.tone) {
    parts.push(`Tone: ${request.tone}`);
  }
  if (request.ctaText && request.ctaUrl) {
    parts.push(`CTA button text: "${request.ctaText}" linking to ${request.ctaUrl}`);
  }
  if (request.senderName) {
    parts.push(`Sign off as: ${request.senderName}`);
  }
  if (request.companyName) {
    parts.push(`Company: ${request.companyName}`);
  }

  parts.push(
    '\nReturn a JSON object with "html" and "plainText" keys. No markdown fences.',
  );

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// JSON parsing helpers
// ---------------------------------------------------------------------------

function parseJsonArray(raw: string, expectedCount: number): string[] {
  // Try to extract JSON array from response
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === "string").slice(0, expectedCount);
    }
  } catch {
    // Fall back to line-by-line extraction
  }

  // Fallback: try to find array in the text
  const match = cleaned.match(/\[[\s\S]*?\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is string => typeof s === "string").slice(0, expectedCount);
      }
    } catch {
      // ignore
    }
  }

  // Last resort: split by newlines
  return cleaned
    .split("\n")
    .map((l) => l.replace(/^\d+\.\s*/, "").replace(/^[-*]\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, expectedCount);
}

function parseJsonObject(raw: string): Record<string, string> {
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // ignore
      }
    }
  }

  return { html: cleaned, plainText: cleaned.replace(/<[^>]*>/g, "") };
}
