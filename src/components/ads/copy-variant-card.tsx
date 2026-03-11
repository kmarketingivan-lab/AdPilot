"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckIcon,
  ClipboardIcon,
  PencilIcon,
  BookmarkIcon,
  XIcon,
  SparklesIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Types ----------

export type AdPlatform = "GOOGLE_SEARCH" | "META_FEED" | "LINKEDIN";

export interface CopyVariant {
  id: string;
  headline: string;
  description: string;
  cta: string;
  platform: AdPlatform;
  aiGenerated?: boolean;
}

interface CopyVariantCardProps {
  variant: CopyVariant;
  /** Whether the text is still streaming in */
  streaming?: boolean;
  onSave?: (variant: CopyVariant) => void;
  onEdit?: (variant: CopyVariant) => void;
  className?: string;
}

// ---------- Platform metadata ----------

const PLATFORM_LABELS: Record<AdPlatform, string> = {
  GOOGLE_SEARCH: "Google Search",
  META_FEED: "Meta Feed",
  LINKEDIN: "LinkedIn",
};

const PLATFORM_COLORS: Record<AdPlatform, string> = {
  GOOGLE_SEARCH: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  META_FEED: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  LINKEDIN: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

// ---------- Character limits ----------

const CHAR_LIMITS: Record<AdPlatform, { headline: number; description: number; cta: number }> = {
  GOOGLE_SEARCH: { headline: 30, description: 90, cta: 15 },
  META_FEED: { headline: 40, description: 125, cta: 30 },
  LINKEDIN: { headline: 70, description: 150, cta: 25 },
};

function charColor(current: number, limit: number): string {
  const ratio = current / limit;
  if (ratio <= 0.8) return "text-green-600 dark:text-green-400";
  if (ratio <= 1) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function CharCount({ current, limit }: { current: number; limit: number }) {
  return (
    <span className={cn("text-xs tabular-nums", charColor(current, limit))}>
      {current}/{limit}
    </span>
  );
}

// ---------- Component ----------

export function CopyVariantCard({
  variant,
  streaming = false,
  onSave,
  onEdit,
  className,
}: CopyVariantCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CopyVariant>(variant);
  const [copied, setCopied] = useState(false);

  const limits = CHAR_LIMITS[variant.platform];

  const startEdit = useCallback(() => {
    setDraft(variant);
    setEditing(true);
  }, [variant]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const confirmEdit = useCallback(() => {
    setEditing(false);
    onEdit?.(draft);
  }, [draft, onEdit]);

  const copyToClipboard = useCallback(async () => {
    const text = `${variant.headline}\n${variant.description}\n${variant.cta}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [variant]);

  const displayed = editing ? draft : variant;

  return (
    <Card
      className={cn(
        "transition-shadow hover:ring-2 hover:ring-primary/20",
        streaming && "animate-pulse",
        className,
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge
            className={cn(
              "border-0 font-medium",
              PLATFORM_COLORS[variant.platform],
            )}
          >
            {PLATFORM_LABELS[variant.platform]}
          </Badge>
          {variant.aiGenerated && (
            <Badge variant="secondary" className="gap-1">
              <SparklesIcon className="size-3" />
              AI
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/* Headline */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Headline
            </span>
            <CharCount current={displayed.headline.length} limit={limits.headline} />
          </div>
          {editing ? (
            <Input
              value={draft.headline}
              onChange={(e) =>
                setDraft((d) => ({ ...d, headline: e.target.value }))
              }
            />
          ) : (
            <p className="text-sm font-semibold leading-snug">
              {variant.headline}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Description
            </span>
            <CharCount
              current={displayed.description.length}
              limit={limits.description}
            />
          </div>
          {editing ? (
            <Textarea
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              rows={3}
            />
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {variant.description}
            </p>
          )}
        </div>

        {/* CTA */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              CTA
            </span>
            <CharCount current={displayed.cta.length} limit={limits.cta} />
          </div>
          {editing ? (
            <Input
              value={draft.cta}
              onChange={(e) =>
                setDraft((d) => ({ ...d, cta: e.target.value }))
              }
            />
          ) : (
            <p className="text-sm font-medium">{variant.cta}</p>
          )}
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        {editing ? (
          <>
            <Button size="sm" onClick={confirmEdit}>
              <CheckIcon data-icon="inline-start" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>
              <XIcon data-icon="inline-start" />
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSave?.(variant)}
              disabled={streaming}
            >
              <BookmarkIcon data-icon="inline-start" />
              Save to Library
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={startEdit}
              disabled={streaming}
            >
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={copyToClipboard}
              disabled={streaming}
            >
              {copied ? (
                <>
                  <CheckIcon data-icon="inline-start" />
                  Copied
                </>
              ) : (
                <>
                  <ClipboardIcon data-icon="inline-start" />
                  Copy
                </>
              )}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
