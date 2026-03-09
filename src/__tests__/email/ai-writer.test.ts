import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Claude service
vi.mock("@/server/services/ai/claude", () => ({
  generateText: vi.fn(),
}));

import { generateText } from "@/server/services/ai/claude";
import {
  generateSubjectLines,
  generateEmailBody,
  type SubjectLineRequest,
  type EmailBodyRequest,
} from "@/server/services/email/ai-writer";

const mockedGenerateText = vi.mocked(generateText);

describe("ai-writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // generateSubjectLines
  // ---------------------------------------------------------------------------

  describe("generateSubjectLines", () => {
    it("should parse valid JSON array response", async () => {
      const mockResponse = JSON.stringify([
        "Boost your sales today",
        "Don't miss this opportunity",
        "Your competitors already know this",
      ]);

      mockedGenerateText.mockResolvedValueOnce(mockResponse);

      const result = await generateSubjectLines({
        brief: "Launch of a new marketing tool",
        count: 3,
      });

      expect(result.subjects).toHaveLength(3);
      expect(result.subjects[0]).toBe("Boost your sales today");
    });

    it("should handle markdown-wrapped JSON response", async () => {
      const mockResponse = '```json\n["Subject 1", "Subject 2"]\n```';

      mockedGenerateText.mockResolvedValueOnce(mockResponse);

      const result = await generateSubjectLines({
        brief: "Product update announcement",
        count: 2,
      });

      expect(result.subjects).toHaveLength(2);
    });

    it("should default to 5 variants when count not specified", async () => {
      const mockResponse = JSON.stringify([
        "S1", "S2", "S3", "S4", "S5", "S6",
      ]);

      mockedGenerateText.mockResolvedValueOnce(mockResponse);

      const result = await generateSubjectLines({
        brief: "Newsletter update",
      });

      // Should cap at 5 (the default)
      expect(result.subjects).toHaveLength(5);
    });

    it("should include audience and tone in prompt when provided", async () => {
      mockedGenerateText.mockResolvedValueOnce('["Subject line"]');

      await generateSubjectLines({
        brief: "New feature",
        audience: "SaaS founders",
        tone: "urgent",
        count: 1,
      });

      const userPrompt = mockedGenerateText.mock.calls[0][1];
      expect(userPrompt).toContain("SaaS founders");
      expect(userPrompt).toContain("urgent");
    });

    it("should fallback to line-splitting when JSON parse fails", async () => {
      // Non-JSON response
      mockedGenerateText.mockResolvedValueOnce(
        "1. First subject line\n2. Second subject line\n3. Third subject line"
      );

      const result = await generateSubjectLines({
        brief: "Test",
        count: 3,
      });

      expect(result.subjects.length).toBeGreaterThan(0);
      // Should have stripped the numbering
      expect(result.subjects[0]).not.toMatch(/^\d+\./);
    });
  });

  // ---------------------------------------------------------------------------
  // generateEmailBody
  // ---------------------------------------------------------------------------

  describe("generateEmailBody", () => {
    it("should parse valid JSON object response with html and plainText", async () => {
      const mockResponse = JSON.stringify({
        html: '<div style="max-width:600px"><p>Hello {{firstName}}</p></div>',
        plainText: "Hello {{firstName}}",
      });

      mockedGenerateText.mockResolvedValueOnce(mockResponse);

      const result = await generateEmailBody({
        brief: "Welcome email for new users",
        subject: "Welcome!",
      });

      expect(result.html).toContain("{{firstName}}");
      expect(result.plainText).toContain("{{firstName}}");
    });

    it("should handle markdown-wrapped JSON body response", async () => {
      const mockResponse =
        '```json\n{"html":"<p>Content</p>","plainText":"Content"}\n```';

      mockedGenerateText.mockResolvedValueOnce(mockResponse);

      const result = await generateEmailBody({
        brief: "Product update",
      });

      expect(result.html).toBe("<p>Content</p>");
      expect(result.plainText).toBe("Content");
    });

    it("should fallback gracefully when Claude returns non-JSON", async () => {
      mockedGenerateText.mockResolvedValueOnce(
        "<p>Here is your email content.</p>"
      );

      const result = await generateEmailBody({
        brief: "Fallback test",
      });

      // Should still return something usable
      expect(result.html).toBeDefined();
      expect(result.plainText).toBeDefined();
    });

    it("should include CTA, sender, and company in prompt", async () => {
      mockedGenerateText.mockResolvedValueOnce(
        '{"html":"<p>Test</p>","plainText":"Test"}'
      );

      await generateEmailBody({
        brief: "Follow up email",
        subject: "Following up",
        audience: "Enterprise CTOs",
        tone: "professional",
        ctaText: "Schedule a Demo",
        ctaUrl: "https://example.com/demo",
        senderName: "Alice",
        companyName: "AdPilot",
      });

      const userPrompt = mockedGenerateText.mock.calls[0][1];
      expect(userPrompt).toContain("Schedule a Demo");
      expect(userPrompt).toContain("https://example.com/demo");
      expect(userPrompt).toContain("Alice");
      expect(userPrompt).toContain("AdPilot");
      expect(userPrompt).toContain("Enterprise CTOs");
      expect(userPrompt).toContain("professional");
    });

    it("should return default message when parsed html is missing", async () => {
      mockedGenerateText.mockResolvedValueOnce('{"plainText":"only plain"}');

      const result = await generateEmailBody({
        brief: "Missing html",
      });

      // html defaults to fallback since parsed.html is undefined
      expect(result.html).toContain("Could not generate");
    });
  });
});
