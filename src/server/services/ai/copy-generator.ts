import { generateText } from ".";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdPlatform = "GOOGLE_SEARCH" | "META_FEED" | "LINKEDIN";

export interface AdBrief {
  product: string;
  targetAudience: string;
  usp: string;
  tone: string;
  objective: string;
  platform: AdPlatform;
  language: string;
  charLimits?: {
    headline?: number;
    description?: number;
    primary?: number;
    intro?: number;
  };
}

export interface AdCopyVariant {
  headline: string;
  description: string;
  ctaText: string;
  platform: AdPlatform;
  charCount: {
    headline: number;
    description: number;
    cta: number;
  };
}

export interface CompetitorAnalysis {
  url: string;
  strengths: string[];
  weaknesses: string[];
  toneAnalysis: string;
  suggestedAngles: string[];
}

// ---------------------------------------------------------------------------
// Platform-specific character limits
// ---------------------------------------------------------------------------

export const PLATFORM_CHAR_LIMITS: Record<
  AdPlatform,
  { headline: number; description: number; labels: { headline: string; description: string } }
> = {
  GOOGLE_SEARCH: {
    headline: 30,
    description: 90,
    labels: { headline: "Headline", description: "Description" },
  },
  META_FEED: {
    headline: 27,
    description: 125,
    labels: { headline: "Headline", description: "Primary text" },
  },
  LINKEDIN: {
    headline: 70,
    description: 150,
    labels: { headline: "Headline", description: "Intro text" },
  },
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(platform: AdPlatform, language: string): string {
  const limits = PLATFORM_CHAR_LIMITS[platform];

  return `Sei un copywriter esperto specializzato in advertising digitale.
Scrivi testi pubblicitari ottimizzati per conversioni, nella lingua "${language}".

PIATTAFORMA: ${platform}
LIMITI CARATTERI:
- ${limits.labels.headline}: massimo ${limits.headline} caratteri
- ${limits.labels.description}: massimo ${limits.description} caratteri

REGOLE FONDAMENTALI:
1. Rispetta SEMPRE i limiti di caratteri indicati. Conta con precisione.
2. Ogni variante deve avere un angolo comunicativo diverso (beneficio, urgenza, social proof, curiosita, pain point, ecc.).
3. Includi sempre una CTA (call-to-action) chiara e breve.
4. Usa un linguaggio naturale, mai generico. Evita cliche.
5. Adatta il tono come richiesto nel brief.

FORMATO OUTPUT — Rispondi ESCLUSIVAMENTE con un array JSON valido:
[
  {
    "headline": "testo headline",
    "description": "testo descrizione",
    "ctaText": "testo CTA"
  }
]

Non aggiungere commenti, spiegazioni o markdown. Solo JSON.`;
}

// ---------------------------------------------------------------------------
// Build user prompt from brief
// ---------------------------------------------------------------------------

function buildUserPrompt(brief: AdBrief, count: number): string {
  return `Genera ${count} varianti di ad copy per il seguente brief:

PRODOTTO/SERVIZIO: ${brief.product}
TARGET AUDIENCE: ${brief.targetAudience}
USP (proposta unica): ${brief.usp}
TONO DI VOCE: ${brief.tone}
OBIETTIVO CAMPAGNA: ${brief.objective}
LINGUA: ${brief.language}

Genera esattamente ${count} varianti con angoli comunicativi diversi.`;
}

// ---------------------------------------------------------------------------
// Parse Claude response
// ---------------------------------------------------------------------------

function parseCopyResponse(
  raw: string,
  platform: AdPlatform
): AdCopyVariant[] {
  // Extract JSON array from response (handles potential markdown wrapping)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse ad copy response: no JSON array found");
  }

  const parsed: Array<{
    headline: string;
    description: string;
    ctaText: string;
  }> = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Failed to parse ad copy response: empty array");
  }

  return parsed.map((item) => ({
    headline: item.headline ?? "",
    description: item.description ?? "",
    ctaText: item.ctaText ?? "",
    platform,
    charCount: {
      headline: item.headline?.length ?? 0,
      description: item.description?.length ?? 0,
      cta: item.ctaText?.length ?? 0,
    },
  }));
}

// ---------------------------------------------------------------------------
// generateAdCopy — main entry point
// ---------------------------------------------------------------------------

export async function generateAdCopy(brief: AdBrief): Promise<AdCopyVariant[]> {
  const count = Math.min(Math.max(5, 5), 10); // 5-10 variants
  const systemPrompt = buildSystemPrompt(brief.platform, brief.language);
  const userPrompt = buildUserPrompt(brief, count);

  const raw = await generateText(systemPrompt, userPrompt, {
    temperature: 0.9,
    maxTokens: 4096,
  });

  return parseCopyResponse(raw, brief.platform);
}

// ---------------------------------------------------------------------------
// generateVariants — generate N variations of a base text
// ---------------------------------------------------------------------------

export async function generateVariants(
  baseText: string,
  count: number,
  tone: string
): Promise<string[]> {
  const systemPrompt = `Sei un copywriter esperto. Genera varianti creative di un testo pubblicitario mantenendo il significato ma variando angolo, ritmo e parole.
Rispondi ESCLUSIVAMENTE con un array JSON di stringhe. Nessun commento o markdown.`;

  const userPrompt = `Testo originale: "${baseText}"
Tono desiderato: ${tone}
Genera esattamente ${count} varianti diverse.

Rispondi con un array JSON: ["variante 1", "variante 2", ...]`;

  const raw = await generateText(systemPrompt, userPrompt, {
    temperature: 1.0,
    maxTokens: 2048,
  });

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse variants response");
  }

  const parsed: string[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) {
    throw new Error("Failed to parse variants response: not an array");
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// analyzeCompetitor — placeholder (mock)
// ---------------------------------------------------------------------------

export async function analyzeCompetitor(
  url: string
): Promise<CompetitorAnalysis> {
  // Placeholder: In production this would scrape the URL and analyze with AI
  return {
    url,
    strengths: [
      "Messaggio chiaro e diretto",
      "CTA ben visibile",
      "Social proof con numeri concreti",
    ],
    weaknesses: [
      "Copy generico, manca personalizzazione",
      "Nessuna urgenza o scarcity",
      "Headline troppo lungo per mobile",
    ],
    toneAnalysis:
      "Tono professionale-corporate, poco emozionale. Potrebbe beneficiare di un approccio piu conversazionale.",
    suggestedAngles: [
      "Puntare sul risparmio di tempo (pain point)",
      "Aggiungere testimonianze cliente",
      "Creare urgenza con offerta limitata",
      "Usare domanda retorica in headline",
    ],
  };
}
