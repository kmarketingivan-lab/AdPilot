import { describe, it, expect } from "vitest";

import {
  translateCopy,
  adaptCopyForMarket,
  getAvailableMarkets,
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  type AdCopyInput,
  type SupportedLanguage,
} from "@/server/services/ai/multilang";

const sampleCopy: AdCopyInput = {
  headline: "Gestisci le tue ads con AI",
  description: "La piattaforma che semplifica il marketing digitale.",
  cta: "Scopri di piu",
};

describe("multilang", () => {
  // ---------------------------------------------------------------------------
  // translateCopy
  // ---------------------------------------------------------------------------

  describe("translateCopy", () => {
    it("should return same copy when source and target language are identical", async () => {
      const result = await translateCopy(sampleCopy, "IT", "IT");

      expect(result.translated.headline).toBe(sampleCopy.headline);
      expect(result.translated.description).toBe(sampleCopy.description);
      expect(result.translated.cta).toBe(sampleCopy.cta);
      expect(result.notes).toContain(
        "Source and target language are the same; no translation needed."
      );
    });

    it("should translate CTA using mock translation map", async () => {
      const result = await translateCopy(sampleCopy, "EN", "IT");

      expect(result.translated.cta).toBe("Learn More");
      expect(result.sourceLang).toBe("IT");
      expect(result.targetLang).toBe("EN");
    });

    it("should prefix headline with language code for unknown translations", async () => {
      const result = await translateCopy(sampleCopy, "DE", "IT");

      expect(result.translated.headline).toContain("[DE]");
      expect(result.translated.description).toContain("[DE]");
      expect(result.translated.cta).toBe("Mehr erfahren");
    });

    it("should translate to all supported languages without error", async () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const result = await translateCopy(sampleCopy, lang, "IT");
        expect(result.targetLang).toBe(lang);
        expect(result.translated).toBeDefined();
      }
    });

    it("should fallback CTA for unknown CTA text", async () => {
      const customCopy: AdCopyInput = {
        headline: "Test",
        description: "Test desc",
        cta: "UnknownCTA",
      };

      const result = await translateCopy(customCopy, "FR", "IT");

      expect(result.translated.cta).toBe("[FR] UnknownCTA");
    });
  });

  // ---------------------------------------------------------------------------
  // adaptCopyForMarket
  // ---------------------------------------------------------------------------

  describe("adaptCopyForMarket", () => {
    it("should adapt copy for known market (usa)", async () => {
      const result = await adaptCopyForMarket(sampleCopy, "usa");

      expect(result.targetMarket).toBe("usa");
      expect(result.targetLang).toBe("EN");
      expect(result.adaptationNotes.length).toBeGreaterThan(0);
      expect(result.adapted.cta).toBe("Learn More");
    });

    it("should return original copy for unknown market with warning", async () => {
      const result = await adaptCopyForMarket(sampleCopy, "brazil");

      expect(result.adapted.headline).toBe(sampleCopy.headline);
      expect(result.adapted.description).toBe(sampleCopy.description);
      expect(result.adaptationNotes[0]).toContain("not recognized");
    });

    it("should be case-insensitive for market name", async () => {
      const result = await adaptCopyForMarket(sampleCopy, "ITALIA");

      expect(result.targetMarket).toBe("italia");
      expect(result.targetLang).toBe("IT");
    });

    it("should include cultural notes for each market", async () => {
      const markets = ["italia", "usa", "uk", "spagna", "francia", "germania"];

      for (const market of markets) {
        const result = await adaptCopyForMarket(sampleCopy, market);
        expect(result.adaptationNotes.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getAvailableMarkets
  // ---------------------------------------------------------------------------

  describe("getAvailableMarkets", () => {
    it("should return all configured markets", () => {
      const markets = getAvailableMarkets();

      expect(markets.length).toBeGreaterThanOrEqual(6);
      expect(markets.map((m) => m.key)).toContain("usa");
      expect(markets.map((m) => m.key)).toContain("italia");
    });

    it("should capitalize market labels", () => {
      const markets = getAvailableMarkets();

      for (const market of markets) {
        expect(market.label[0]).toBe(market.label[0].toUpperCase());
      }
    });

    it("should assign valid language codes", () => {
      const markets = getAvailableMarkets();
      const validLangs = new Set<string>(SUPPORTED_LANGUAGES);

      for (const market of markets) {
        expect(validLangs.has(market.lang)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  describe("constants", () => {
    it("should export all 5 supported languages", () => {
      expect(SUPPORTED_LANGUAGES).toEqual(["IT", "EN", "ES", "FR", "DE"]);
    });

    it("should have labels for all supported languages", () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(LANGUAGE_LABELS[lang]).toBeDefined();
        expect(typeof LANGUAGE_LABELS[lang]).toBe("string");
      }
    });
  });
});
