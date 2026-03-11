// ---------------------------------------------------------------------------
// Multi-language ad copy — translation & cultural adaptation
// ---------------------------------------------------------------------------
// This module provides placeholder implementations ready for Claude API
// integration. Replace the mock logic with actual API calls when ready.
// ---------------------------------------------------------------------------

// ---------- Types ----------

export type SupportedLanguage = "IT" | "EN" | "ES" | "FR" | "DE";

export interface AdCopyInput {
  headline: string;
  description: string;
  cta: string;
}

export interface TranslatedCopy {
  original: AdCopyInput;
  translated: AdCopyInput;
  sourceLang: SupportedLanguage;
  targetLang: SupportedLanguage;
  /** Notes about the translation (e.g. adapted idioms) */
  notes?: string[];
}

export interface MarketAdaptation {
  original: AdCopyInput;
  adapted: AdCopyInput;
  targetMarket: string;
  targetLang: SupportedLanguage;
  /** Cultural adaptation notes */
  adaptationNotes: string[];
}

// ---------- Constants ----------

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  IT: "Italiano",
  EN: "English",
  ES: "Espanol",
  FR: "Francais",
  DE: "Deutsch",
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  "IT",
  "EN",
  "ES",
  "FR",
  "DE",
];

// ---------- Mock translation maps ----------

const MOCK_TRANSLATIONS: Record<
  SupportedLanguage,
  {
    cta: Record<string, string>;
    prefixes: { headline: string; description: string };
  }
> = {
  IT: {
    cta: {
      "Scopri di piu": "Scopri di piu",
      "Inizia ora": "Inizia ora",
      "Prova gratis": "Prova gratis",
    },
    prefixes: { headline: "", description: "" },
  },
  EN: {
    cta: {
      "Scopri di piu": "Learn More",
      "Inizia ora": "Get Started",
      "Prova gratis": "Try Free",
      Contattaci: "Contact Us",
      "Acquista ora": "Buy Now",
    },
    prefixes: { headline: "", description: "" },
  },
  ES: {
    cta: {
      "Scopri di piu": "Descubre mas",
      "Inizia ora": "Empieza ahora",
      "Prova gratis": "Prueba gratis",
      Contattaci: "Contactanos",
      "Acquista ora": "Compra ahora",
    },
    prefixes: { headline: "", description: "" },
  },
  FR: {
    cta: {
      "Scopri di piu": "En savoir plus",
      "Inizia ora": "Commencer",
      "Prova gratis": "Essai gratuit",
      Contattaci: "Contactez-nous",
      "Acquista ora": "Acheter",
    },
    prefixes: { headline: "", description: "" },
  },
  DE: {
    cta: {
      "Scopri di piu": "Mehr erfahren",
      "Inizia ora": "Jetzt starten",
      "Prova gratis": "Kostenlos testen",
      Contattaci: "Kontaktieren Sie uns",
      "Acquista ora": "Jetzt kaufen",
    },
    prefixes: { headline: "", description: "" },
  },
};

// ---------- Market adaptation metadata ----------

interface MarketMeta {
  lang: SupportedLanguage;
  formalityNote: string;
  culturalNotes: string[];
}

const MARKET_META: Record<string, MarketMeta> = {
  italia: {
    lang: "IT",
    formalityNote: "Tono formale o informale a seconda del target.",
    culturalNotes: [
      "Il mercato italiano apprezza riferimenti alla qualita e tradizione.",
      "Preferire il 'tu' per B2C e il 'Lei' per B2B.",
    ],
  },
  usa: {
    lang: "EN",
    formalityNote: "Direct, benefit-driven copy works best.",
    culturalNotes: [
      "American audiences respond well to urgency and social proof.",
      "Use dollars and imperial units.",
      "Keep tone confident and action-oriented.",
    ],
  },
  uk: {
    lang: "EN",
    formalityNote: "Slightly more understated than US copy.",
    culturalNotes: [
      "British audiences prefer subtlety over hard-sell tactics.",
      "Use pounds sterling and metric units.",
      "Humour can be effective when appropriate.",
    ],
  },
  spagna: {
    lang: "ES",
    formalityNote: "Usar 'tu' para B2C, 'usted' para B2B.",
    culturalNotes: [
      "Il mercato spagnolo preferisce un tono caloroso e relazionale.",
      "Evitare anglicismi quando esiste un equivalente spagnolo.",
    ],
  },
  francia: {
    lang: "FR",
    formalityNote: "Utiliser le vouvoiement par defaut.",
    culturalNotes: [
      "Il mercato francese apprezza eleganza e sofisticazione nel copy.",
      "Evitare anglicismi: la legislazione francese li limita nella pubblicita.",
      "Preferire un tono autorevole ma non aggressivo.",
    ],
  },
  germania: {
    lang: "DE",
    formalityNote: "Siezen (Sie) ist Standard in der Werbung.",
    culturalNotes: [
      "Il mercato tedesco valorizza precisione, dati concreti e affidabilita.",
      "Evitare iperboli: preferire claim supportati da evidenze.",
      "La privacy e un tema sensibile: evitare copy percepiti come invasivi.",
    ],
  },
};

// ---------------------------------------------------------------------------
// translateCopy — Placeholder for Claude API translation
// ---------------------------------------------------------------------------

/**
 * Translates ad copy from the source language to the target language.
 *
 * Currently returns mock translations. Replace with Claude API call for
 * production use:
 *
 * ```ts
 * const prompt = `Translate this ad copy from ${sourceLang} to ${targetLang}...`;
 * const result = await generateText(SYSTEM_PROMPT, prompt);
 * ```
 */
export async function translateCopy(
  copy: AdCopyInput,
  targetLang: SupportedLanguage,
  sourceLang: SupportedLanguage = "IT"
): Promise<TranslatedCopy> {
  // TODO: Replace with Claude API call
  // import { generateText } from "./claude";
  // const systemPrompt = "You are an expert multilingual ad copywriter...";
  // const userPrompt = buildTranslationPrompt(copy, sourceLang, targetLang);
  // const response = await generateText(systemPrompt, userPrompt);
  // return parseTranslationResponse(response, copy, sourceLang, targetLang);

  // Simulate async operation
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (sourceLang === targetLang) {
    return {
      original: copy,
      translated: { ...copy },
      sourceLang,
      targetLang,
      notes: ["Source and target language are the same; no translation needed."],
    };
  }

  const targetData = MOCK_TRANSLATIONS[targetLang];

  const translatedCta =
    targetData.cta[copy.cta] ?? `[${targetLang}] ${copy.cta}`;

  const translated: AdCopyInput = {
    headline: `[${targetLang}] ${copy.headline}`,
    description: `[${targetLang}] ${copy.description}`,
    cta: translatedCta,
  };

  const notes: string[] = [
    `Mock translation from ${LANGUAGE_LABELS[sourceLang]} to ${LANGUAGE_LABELS[targetLang]}.`,
    "Replace with Claude API for production-quality translations.",
  ];

  return {
    original: copy,
    translated,
    sourceLang,
    targetLang,
    notes,
  };
}

// ---------------------------------------------------------------------------
// adaptCopyForMarket — Cultural adaptation placeholder
// ---------------------------------------------------------------------------

/**
 * Adapts ad copy for a specific target market, considering cultural nuances,
 * formality levels, and local preferences.
 *
 * Currently returns mock adaptations. Replace with Claude API call for
 * production use.
 *
 * @param targetMarket - Market key (e.g. "usa", "francia", "germania")
 */
export async function adaptCopyForMarket(
  copy: AdCopyInput,
  targetMarket: string
): Promise<MarketAdaptation> {
  // TODO: Replace with Claude API call
  // import { generateText } from "./claude";
  // const systemPrompt = "You are an expert in cultural ad copy adaptation...";
  // const userPrompt = buildAdaptationPrompt(copy, targetMarket, meta);
  // const response = await generateText(systemPrompt, userPrompt);
  // return parseAdaptationResponse(response, copy, targetMarket);

  // Simulate async operation
  await new Promise((resolve) => setTimeout(resolve, 150));

  const normalizedMarket = targetMarket.toLowerCase().trim();
  const meta = MARKET_META[normalizedMarket];

  if (!meta) {
    // Fallback: return untouched copy with a warning
    return {
      original: copy,
      adapted: { ...copy },
      targetMarket,
      targetLang: "IT",
      adaptationNotes: [
        `Market "${targetMarket}" not recognized. Returning original copy.`,
        "Supported markets: " + Object.keys(MARKET_META).join(", "),
      ],
    };
  }

  // Mock adaptation: translate + add market-specific notes
  const translation = await translateCopy(copy, meta.lang);

  return {
    original: copy,
    adapted: translation.translated,
    targetMarket: normalizedMarket,
    targetLang: meta.lang,
    adaptationNotes: [
      meta.formalityNote,
      ...meta.culturalNotes,
      "Mock adaptation — integrate Claude API for real cultural adaptation.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Utility: get available markets
// ---------------------------------------------------------------------------

export function getAvailableMarkets(): {
  key: string;
  label: string;
  lang: SupportedLanguage;
}[] {
  return Object.entries(MARKET_META).map(([key, meta]) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    lang: meta.lang,
  }));
}
