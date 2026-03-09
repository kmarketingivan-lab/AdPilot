"use client";

import { useState, useMemo } from "react";
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Target,
  Users,
  Settings,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdPlatform = "GOOGLE_SEARCH" | "META_FEED" | "LINKEDIN";
type Tone =
  | "professional"
  | "casual"
  | "humorous"
  | "inspirational"
  | "urgent"
  | "empathetic";
type Objective =
  | "awareness"
  | "traffic"
  | "conversions"
  | "leads"
  | "engagement";
type Language = "it" | "en" | "es" | "fr" | "de";

interface BriefForm {
  // Step 1
  product: string;
  description: string;
  usp: string;
  // Step 2
  demographics: string;
  interests: string;
  painPoints: string;
  // Step 3
  objective: Objective;
  platforms: AdPlatform[];
  tone: Tone;
  language: Language;
}

interface AdCopyVariant {
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { label: "Product", icon: Target },
  { label: "Audience", icon: Users },
  { label: "Settings", icon: Settings },
  { label: "Review", icon: FileText },
] as const;

const PLATFORMS: { value: AdPlatform; label: string; charInfo: string }[] = [
  {
    value: "GOOGLE_SEARCH",
    label: "Google Search",
    charInfo: "H: 30 / D: 90",
  },
  { value: "META_FEED", label: "Meta Feed", charInfo: "H: 27 / P: 125" },
  { value: "LINKEDIN", label: "LinkedIn", charInfo: "H: 70 / I: 150" },
];

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "humorous", label: "Humorous" },
  { value: "inspirational", label: "Inspirational" },
  { value: "urgent", label: "Urgent" },
  { value: "empathetic", label: "Empathetic" },
];

const OBJECTIVES: { value: Objective; label: string }[] = [
  { value: "awareness", label: "Brand Awareness" },
  { value: "traffic", label: "Traffic" },
  { value: "conversions", label: "Conversions" },
  { value: "leads", label: "Lead Generation" },
  { value: "engagement", label: "Engagement" },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "es", label: "Espanol" },
  { value: "fr", label: "Francais" },
  { value: "de", label: "Deutsch" },
];

const DEFAULT_BRIEF: BriefForm = {
  product: "",
  description: "",
  usp: "",
  demographics: "",
  interests: "",
  painPoints: "",
  objective: "conversions",
  platforms: [],
  tone: "professional",
  language: "it",
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AdsGeneratePage() {
  const { workspace } = useWorkspace();
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState<BriefForm>(DEFAULT_BRIEF);
  const [results, setResults] = useState<AdCopyVariant[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const generateCopy = trpc.ads.generateCopy.useMutation({
    onSuccess: (data) => {
      setResults(data.variants);
      toast.success(`${data.variants.length} ad copy variants generated!`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // -----------------------------------------------------------------------
  // Validation per step
  // -----------------------------------------------------------------------

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return (
          brief.product.trim().length > 0 &&
          brief.description.trim().length > 0 &&
          brief.usp.trim().length > 0
        );
      case 1:
        return brief.demographics.trim().length > 0;
      case 2:
        return brief.platforms.length > 0;
      case 3:
        return true;
      default:
        return false;
    }
  }, [step, brief]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  function updateBrief<K extends keyof BriefForm>(
    key: K,
    value: BriefForm[K]
  ) {
    setBrief((prev) => ({ ...prev, [key]: value }));
  }

  function togglePlatform(platform: AdPlatform) {
    setBrief((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }));
  }

  function handleGenerate() {
    if (!workspace) return;

    // Build the target audience string from structured fields
    const targetAudience = [
      brief.demographics && `Demografia: ${brief.demographics}`,
      brief.interests && `Interessi: ${brief.interests}`,
      brief.painPoints && `Pain points: ${brief.painPoints}`,
    ]
      .filter(Boolean)
      .join(". ");

    // Generate for first selected platform (user can re-run for others)
    const platform = brief.platforms[0];

    generateCopy.mutate({
      workspaceId: workspace.id,
      brief: {
        product: `${brief.product} - ${brief.description}`,
        targetAudience,
        usp: brief.usp,
        tone: brief.tone,
        objective: brief.objective,
        platform,
        language: brief.language,
      },
    });
  }

  async function handleCopyToClipboard(variant: AdCopyVariant, index: number) {
    const text = `${variant.headline}\n${variant.description}\nCTA: ${variant.ctaText}`;
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">AI Ad Copy Generator</h1>
        <p className="text-sm text-muted-foreground">
          Create high-converting ad copy with AI assistance
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isCompleted = i < step;

          return (
            <div key={s.label} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={cn(
                    "h-px w-8 sm:w-12",
                    isCompleted ? "bg-primary" : "bg-zinc-700"
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : isCompleted
                      ? "border-primary/50 bg-primary/5 text-primary/80"
                      : "border-zinc-700 bg-zinc-800/50 text-zinc-500"
                )}
              >
                {isCompleted ? (
                  <Check className="size-3" />
                ) : (
                  <Icon className="size-3" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
            </div>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </span>
      </div>

      {/* Form steps */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="pt-6">
          {/* Step 1: Product/Service */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Product / Service</h2>
                <p className="text-sm text-muted-foreground">
                  Describe what you are promoting
                </p>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Product Name *</label>
                  <Input
                    placeholder="e.g., AdPilot Marketing Suite"
                    value={brief.product}
                    onChange={(e) => updateBrief("product", e.target.value)}
                    className="border-zinc-700 bg-zinc-800/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description *</label>
                  <Textarea
                    placeholder="Describe the product or service in detail..."
                    value={brief.description}
                    onChange={(e) => updateBrief("description", e.target.value)}
                    className="min-h-24 border-zinc-700 bg-zinc-800/50"
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Unique Selling Proposition (USP) *
                  </label>
                  <Textarea
                    placeholder="What makes this different from competitors?"
                    value={brief.usp}
                    onChange={(e) => updateBrief("usp", e.target.value)}
                    className="min-h-20 border-zinc-700 bg-zinc-800/50"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Target Audience */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Target Audience</h2>
                <p className="text-sm text-muted-foreground">
                  Define who you want to reach
                </p>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Demographics *</label>
                  <Textarea
                    placeholder="Age, gender, location, income level, job title..."
                    value={brief.demographics}
                    onChange={(e) =>
                      updateBrief("demographics", e.target.value)
                    }
                    className="min-h-20 border-zinc-700 bg-zinc-800/50"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Interests</label>
                  <Textarea
                    placeholder="Hobbies, topics, brands they follow..."
                    value={brief.interests}
                    onChange={(e) => updateBrief("interests", e.target.value)}
                    className="min-h-20 border-zinc-700 bg-zinc-800/50"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Pain Points</label>
                  <Textarea
                    placeholder="Problems and frustrations your audience faces..."
                    value={brief.painPoints}
                    onChange={(e) => updateBrief("painPoints", e.target.value)}
                    className="min-h-20 border-zinc-700 bg-zinc-800/50"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Campaign Settings */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Campaign Settings</h2>
                <p className="text-sm text-muted-foreground">
                  Configure how the copy should be generated
                </p>
              </div>
              <Separator />
              <div className="space-y-5">
                {/* Objective */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Objective</label>
                  <div className="flex flex-wrap gap-2">
                    {OBJECTIVES.map((obj) => (
                      <Button
                        key={obj.value}
                        type="button"
                        variant={
                          brief.objective === obj.value ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => updateBrief("objective", obj.value)}
                      >
                        {obj.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Platforms */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Platforms * (select at least one)
                  </label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {PLATFORMS.map((p) => {
                      const selected = brief.platforms.includes(p.value);
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => togglePlatform(p.value)}
                          className={cn(
                            "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                          )}
                        >
                          <span className="text-sm font-medium">
                            {p.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {p.charInfo}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tone */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tone of Voice</label>
                  <div className="flex flex-wrap gap-2">
                    {TONES.map((t) => (
                      <Button
                        key={t.value}
                        type="button"
                        variant={
                          brief.tone === t.value ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => updateBrief("tone", t.value)}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Language */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Language</label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => (
                      <Button
                        key={lang.value}
                        type="button"
                        variant={
                          brief.language === lang.value ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => updateBrief("language", lang.value)}
                      >
                        {lang.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Generate */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Review & Generate</h2>
                <p className="text-sm text-muted-foreground">
                  Confirm your brief before generating ad copy
                </p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <ReviewField label="Product" value={brief.product} />
                <ReviewField label="USP" value={brief.usp} />
                <ReviewField label="Demographics" value={brief.demographics} />
                <ReviewField label="Pain Points" value={brief.painPoints || "Not specified"} />
                <ReviewField
                  label="Objective"
                  value={
                    OBJECTIVES.find((o) => o.value === brief.objective)
                      ?.label ?? brief.objective
                  }
                />
                <ReviewField
                  label="Tone"
                  value={
                    TONES.find((t) => t.value === brief.tone)?.label ??
                    brief.tone
                  }
                />
                <ReviewField
                  label="Language"
                  value={
                    LANGUAGES.find((l) => l.value === brief.language)?.label ??
                    brief.language
                  }
                />
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Platforms
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {brief.platforms.map((p) => (
                      <Badge key={p} variant="secondary">
                        {PLATFORMS.find((pl) => pl.value === p)?.label ?? p}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              {brief.description && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Description
                  </span>
                  <p className="text-sm text-zinc-300">{brief.description}</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>

            {step < 3 ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => setStep((s) => Math.min(3, s + 1))}
                disabled={!stepValid}
              >
                Next
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={handleGenerate}
                disabled={generateCopy.isPending || !workspace}
              >
                {generateCopy.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {generateCopy.isPending
                  ? "Generating..."
                  : "Generate Copy"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Generated Variants ({results.length})
            </h2>
            <Badge variant="secondary">
              {PLATFORMS.find((p) => p.value === results[0]?.platform)?.label}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((variant, i) => (
              <Card
                key={i}
                className="border-zinc-800 bg-zinc-900/50 transition-colors hover:border-zinc-700"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>Variant {i + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleCopyToClipboard(variant, i)}
                    >
                      {copiedIndex === i ? (
                        <Check className="size-3 text-green-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Headline
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {variant.charCount.headline} chars
                      </span>
                    </div>
                    <p className="text-sm font-medium">{variant.headline}</p>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Description
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {variant.charCount.description} chars
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300">
                      {variant.description}
                    </p>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      CTA
                    </span>
                    <p className="text-sm font-medium text-primary">
                      {variant.ctaText}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <p className="text-sm text-zinc-300">{value || "Not specified"}</p>
    </div>
  );
}
