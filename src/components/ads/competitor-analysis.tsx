"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SearchIcon,
  LoaderIcon,
  ShieldIcon,
  AlertCircleIcon,
  LightbulbIcon,
  TargetIcon,
  SparklesIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Types ----------

export interface CompetitorStrength {
  title: string;
  description: string;
}

export interface CompetitorWeakness {
  title: string;
  description: string;
}

export interface SuggestedDifferentiator {
  title: string;
  description: string;
  impact: "alto" | "medio" | "basso";
}

export interface RecommendedAdAngle {
  angle: string;
  reasoning: string;
  exampleHeadline: string;
}

export interface CompetitorAnalysisResult {
  url: string;
  competitorName: string;
  analyzedAt: string;
  strengths: CompetitorStrength[];
  weaknesses: CompetitorWeakness[];
  differentiators: SuggestedDifferentiator[];
  adAngles: RecommendedAdAngle[];
}

interface CompetitorAnalysisProps {
  onAnalyze?: (url: string) => Promise<CompetitorAnalysisResult>;
  onGenerateCounterCopy?: (result: CompetitorAnalysisResult) => void;
  className?: string;
}

// ---------- Mock data generator ----------

function generateMockResult(url: string): CompetitorAnalysisResult {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace("www.", "");
  } catch {
    hostname = url.replace(/https?:\/\//, "").split("/")[0];
  }

  const competitorName =
    hostname.charAt(0).toUpperCase() + hostname.slice(0).split(".")[0];

  return {
    url,
    competitorName,
    analyzedAt: new Date().toISOString(),
    strengths: [
      {
        title: "Brand awareness consolidata",
        description:
          "Il competitor ha una forte presenza di brand con messaging coerente su tutti i canali.",
      },
      {
        title: "Proposta di valore chiara",
        description:
          "Il copy evidenzia benefit concreti e quantificabili per il target.",
      },
      {
        title: "Social proof efficace",
        description:
          "Utilizzo strategico di testimonianze e numeri per costruire fiducia.",
      },
    ],
    weaknesses: [
      {
        title: "CTA generiche",
        description:
          "Le call-to-action utilizzate sono poco differenzianti ('Scopri di piu', 'Contattaci').",
      },
      {
        title: "Mancanza di urgenza",
        description:
          "Il copy non crea senso di urgenza o scarsita per motivare l'azione immediata.",
      },
      {
        title: "Segmentazione limitata",
        description:
          "I messaggi pubblicitari sembrano generici, non personalizzati per segmenti specifici.",
      },
    ],
    differentiators: [
      {
        title: "Pricing trasparente",
        description:
          "Mostrare prezzi chiari e competitivi dove il competitor li nasconde.",
        impact: "alto",
      },
      {
        title: "Garanzia soddisfatti o rimborsati",
        description:
          "Offrire una garanzia forte per ridurre il rischio percepito dal cliente.",
        impact: "medio",
      },
      {
        title: "Supporto dedicato",
        description:
          "Evidenziare un servizio clienti superiore come vantaggio competitivo.",
        impact: "medio",
      },
      {
        title: "Risultati misurabili",
        description:
          "Comunicare metriche concrete e case study con risultati verificabili.",
        impact: "alto",
      },
    ],
    adAngles: [
      {
        angle: "Confronto diretto",
        reasoning:
          "Sfruttare le debolezze del competitor nelle CTA per posizionarti come alternativa superiore.",
        exampleHeadline: `Stanco di ${competitorName}? Prova chi ti garantisce risultati`,
      },
      {
        angle: "Fear of Missing Out",
        reasoning:
          "Compensare la mancanza di urgenza del competitor creando scarsita reale.",
        exampleHeadline: "Solo 10 posti disponibili — Offerta valida fino a venerdi",
      },
      {
        angle: "Autorevolezza con dati",
        reasoning:
          "Dove il competitor usa testimonianze generiche, tu presenti numeri concreti.",
        exampleHeadline: "+340% ROI medio — Ecco come i nostri clienti crescono",
      },
    ],
  };
}

// ---------- Sub-components ----------

function ImpactBadge({ impact }: { impact: SuggestedDifferentiator["impact"] }) {
  const config = {
    alto: {
      label: "Impatto alto",
      className: "bg-green-500/10 text-green-700 dark:text-green-400",
    },
    medio: {
      label: "Impatto medio",
      className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    },
    basso: {
      label: "Impatto basso",
      className: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    },
  };

  const c = config[impact];
  return (
    <Badge className={cn("border-0 text-xs font-medium", c.className)}>
      {c.label}
    </Badge>
  );
}

// ---------- Main component ----------

export function CompetitorAnalysis({
  onAnalyze,
  onGenerateCounterCopy,
  className,
}: CompetitorAnalysisProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompetitorAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Basic URL validation
    let normalizedUrl = trimmed;
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (onAnalyze) {
        const data = await onAnalyze(normalizedUrl);
        setResult(data);
      } else {
        // Simulate API delay, then use mock data
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setResult(generateMockResult(normalizedUrl));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore durante l'analisi. Riprova."
      );
    } finally {
      setLoading(false);
    }
  }, [url, onAnalyze]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleAnalyze();
    }
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* URL input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SearchIcon className="size-5" />
            Analisi Competitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ExternalLinkIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Inserisci URL del competitor (es. competitor.com)..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
                disabled={loading}
              />
            </div>
            <Button onClick={handleAnalyze} disabled={!url.trim() || loading}>
              {loading ? (
                <>
                  <LoaderIcon className="size-4 animate-spin" />
                  Analisi in corso...
                </>
              ) : (
                <>
                  <SearchIcon data-icon="inline-start" />
                  Analizza
                </>
              )}
            </Button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                Analisi: {result.competitorName}
              </h3>
              <p className="text-xs text-muted-foreground">
                Analizzato il{" "}
                {new Date(result.analyzedAt).toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => onGenerateCounterCopy?.(result)}
            >
              <SparklesIcon data-icon="inline-start" />
              Genera Counter-Copy
            </Button>
          </div>

          {/* Strengths and Weaknesses */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Strengths */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShieldIcon className="size-4 text-green-600 dark:text-green-400" />
                  Punti di forza
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.strengths.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-950/20"
                  >
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.description}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Weaknesses */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertCircleIcon className="size-4 text-red-600 dark:text-red-400" />
                  Punti deboli
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.weaknesses.map((w, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20"
                  >
                    <p className="text-sm font-medium">{w.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {w.description}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Differentiators */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <LightbulbIcon className="size-4 text-yellow-600 dark:text-yellow-400" />
                Differenziatori suggeriti
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.differentiators.map((d, i) => (
                  <div
                    key={i}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{d.title}</p>
                      <ImpactBadge impact={d.impact} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {d.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recommended ad angles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TargetIcon className="size-4 text-blue-600 dark:text-blue-400" />
                Angoli pubblicitari consigliati
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.adAngles.map((a, i) => (
                <div
                  key={i}
                  className="rounded-lg border p-4"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      Angolo {i + 1}
                    </Badge>
                    <p className="text-sm font-medium">{a.angle}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {a.reasoning}
                  </p>
                  <div className="mt-3 rounded-md bg-muted/50 p-2.5">
                    <p className="text-xs text-muted-foreground">
                      Esempio headline:
                    </p>
                    <p className="mt-0.5 text-sm font-medium italic">
                      &ldquo;{a.exampleHeadline}&rdquo;
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <SearchIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            Inserisci un URL per iniziare
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Analizzeremo il competitor e suggeriremo strategie per
            differenziarti.
          </p>
        </div>
      )}
    </div>
  );
}
