import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Claude service before importing the module under test
vi.mock("@/server/services/ai/claude", () => ({
  generateText: vi.fn(),
}));

import {
  generateAdCopy,
  generateVariants,
  analyzeCompetitor,
  PLATFORM_CHAR_LIMITS,
  type AdBrief,
} from "@/server/services/ai/copy-generator";
import { generateText } from "@/server/services/ai/claude";

const mockedGenerateText = vi.mocked(generateText);

const baseBrief: AdBrief = {
  product: "AdPilot Marketing Suite",
  targetAudience: "Small business owners",
  usp: "AI-powered ad management",
  tone: "Professional",
  objective: "Lead generation",
  platform: "GOOGLE_SEARCH",
  language: "EN",
};

describe("copy-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // generateAdCopy
  // ---------------------------------------------------------------------------

  describe("generateAdCopy", () => {
    it("should parse valid Claude response into AdCopyVariant[]", async () => {
      const mockResponse = JSON.stringify([
        {
          headline: "Boost Your Ads with AI",
          description: "Get better results from your ad spend using AI automation.",
          ctaText: "Start Free Trial",
        },
        {
          headline: "Save Time on Ads",
          description: "Automate your ad campaigns and focus on growth.",
          ctaText: "Try AdPilot",
        },
      ]);

      mockedGenerateText.mockResolvedValueOnce(mockResponse);

      const result = await generateAdCopy(baseBrief);

      expect(result).toHaveLength(2);
      expect(result[0].platform).toBe("GOOGLE_SEARCH");
      expect(result[0].headline).toBe("Boost Your Ads with AI");
      expect(result[0].charCount.headline).toBe("Boost Your Ads with AI".length);
      expect(result[0].charCount.description).toBeGreaterThan(0);
      expect(result[0].ctaText).toBe("Start Free Trial");
    });

    it("should handle markdown-wrapped JSON response", async () => {
      const mockResponse = `Here are some variants:\n\`\`\`json\n[{"headline":"Test","description":"Desc","ctaText":"CTA"}]\n\`\`\``;

      mockedGenerateText.mockResolvedValueOnce(mockResponse);

      const result = await generateAdCopy(baseBrief);

      expect(result).toHaveLength(1);
      expect(result[0].headline).toBe("Test");
    });

    it("should throw when Claude returns no JSON array", async () => {
      mockedGenerateText.mockResolvedValueOnce("Sorry, I cannot generate ads.");

      await expect(generateAdCopy(baseBrief)).rejects.toThrow(
        "Failed to parse ad copy response: no JSON array found"
      );
    });

    it("should throw when Claude returns an empty array", async () => {
      mockedGenerateText.mockResolvedValueOnce("[]");

      await expect(generateAdCopy(baseBrief)).rejects.toThrow(
        "Failed to parse ad copy response: empty array"
      );
    });

    it("should use correct platform for charCount", async () => {
      const metaBrief: AdBrief = { ...baseBrief, platform: "META_FEED" };
      const mockResponse = JSON.stringify([
        { headline: "Meta Ad", description: "Meta description", ctaText: "Shop Now" },
      ]);

      mockedGenerateText.mockResolvedValueOnce(mockResponse);

      const result = await generateAdCopy(metaBrief);

      expect(result[0].platform).toBe("META_FEED");
      expect(result[0].charCount.headline).toBe("Meta Ad".length);
    });
  });

  // ---------------------------------------------------------------------------
  // generateVariants
  // ---------------------------------------------------------------------------

  describe("generateVariants", () => {
    it("should return string array from valid response", async () => {
      const mockResponse = JSON.stringify([
        "Variant one text",
        "Variant two text",
        "Variant three text",
      ]);

      mockedGenerateText.mockResolvedValueOnce(mockResponse);

      const result = await generateVariants("Original ad copy", 3, "professional");

      expect(result).toHaveLength(3);
      expect(result[0]).toBe("Variant one text");
    });

    it("should throw when response is not a JSON array", async () => {
      mockedGenerateText.mockResolvedValueOnce("No valid JSON here");

      await expect(
        generateVariants("Original text", 3, "casual")
      ).rejects.toThrow("Failed to parse variants response");
    });

    it("should throw when response is a JSON object instead of array", async () => {
      mockedGenerateText.mockResolvedValueOnce('{"variant": "test"}');

      await expect(
        generateVariants("Original text", 3, "casual")
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // analyzeCompetitor
  // ---------------------------------------------------------------------------

  describe("analyzeCompetitor", () => {
    it("should return mock analysis with correct structure", async () => {
      const result = await analyzeCompetitor("https://example.com");

      expect(result.url).toBe("https://example.com");
      expect(result.strengths).toBeInstanceOf(Array);
      expect(result.strengths.length).toBeGreaterThan(0);
      expect(result.weaknesses).toBeInstanceOf(Array);
      expect(result.suggestedAngles).toBeInstanceOf(Array);
      expect(typeof result.toneAnalysis).toBe("string");
    });
  });

  // ---------------------------------------------------------------------------
  // PLATFORM_CHAR_LIMITS
  // ---------------------------------------------------------------------------

  describe("PLATFORM_CHAR_LIMITS", () => {
    it("should define limits for all platforms", () => {
      expect(PLATFORM_CHAR_LIMITS.GOOGLE_SEARCH.headline).toBe(30);
      expect(PLATFORM_CHAR_LIMITS.GOOGLE_SEARCH.description).toBe(90);
      expect(PLATFORM_CHAR_LIMITS.META_FEED.headline).toBe(27);
      expect(PLATFORM_CHAR_LIMITS.META_FEED.description).toBe(125);
      expect(PLATFORM_CHAR_LIMITS.LINKEDIN.headline).toBe(70);
      expect(PLATFORM_CHAR_LIMITS.LINKEDIN.description).toBe(150);
    });
  });
});
