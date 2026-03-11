"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  CopyVariantCard,
  type AdPlatform,
  type CopyVariant,
} from "@/components/ads/copy-variant-card";
import {
  BookmarkIcon,
  RefreshCwIcon,
  Loader2,
} from "lucide-react";

// ---------- Types ----------

type SortMode = "order" | "headline_length" | "description_length";

interface CopyResultsProps {
  /** Copy variants produced so far */
  variants: CopyVariant[];
  /** Whether the AI is still generating */
  isGenerating: boolean;
  /** Indices of variants currently streaming (text still appending) */
  streamingIndices?: Set<number>;
  onSave: (variant: CopyVariant) => void;
  onSaveAll: (variants: CopyVariant[]) => void;
  onEdit: (variant: CopyVariant) => void;
  onGenerateMore: () => void;
}

// ---------- Platform filter options ----------

const PLATFORM_OPTIONS: { value: AdPlatform | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Platforms" },
  { value: "GOOGLE_SEARCH", label: "Google Search" },
  { value: "META_FEED", label: "Meta Feed" },
  { value: "LINKEDIN", label: "LinkedIn" },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "order", label: "Generated Order" },
  { value: "headline_length", label: "Headline Length" },
  { value: "description_length", label: "Description Length" },
];

// ---------- Skeleton card ----------

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardContent className="flex flex-col gap-3 pt-4">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-5 w-1/3" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Component ----------

export function CopyResults({
  variants,
  isGenerating,
  streamingIndices,
  onSave,
  onSaveAll,
  onEdit,
  onGenerateMore,
}: CopyResultsProps) {
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | "ALL">("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("order");

  const filtered = useMemo(() => {
    let result = variants.map((v, i) => ({ ...v, _index: i }));

    if (platformFilter !== "ALL") {
      result = result.filter((v) => v.platform === platformFilter);
    }

    switch (sortMode) {
      case "headline_length":
        result.sort((a, b) => a.headline.length - b.headline.length);
        break;
      case "description_length":
        result.sort((a, b) => a.description.length - b.description.length);
        break;
      case "order":
      default:
        // keep original order (by _index)
        break;
    }

    return result;
  }, [variants, platformFilter, sortMode]);

  const handleSaveAll = useCallback(() => {
    onSaveAll(variants);
  }, [variants, onSaveAll]);

  if (variants.length === 0 && !isGenerating) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={platformFilter}
          onValueChange={(val) => setPlatformFilter(val as AdPlatform | "ALL")}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sortMode}
          onValueChange={(val) => setSortMode(val as SortMode)}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveAll}
            disabled={variants.length === 0 || isGenerating}
          >
            <BookmarkIcon data-icon="inline-start" />
            Save All
          </Button>
          <Button
            size="sm"
            onClick={onGenerateMore}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCwIcon data-icon="inline-start" />
                Generate More
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Results grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((variant) => (
          <CopyVariantCard
            key={variant.id}
            variant={variant}
            streaming={streamingIndices?.has(variant._index) ?? false}
            onSave={onSave}
            onEdit={onEdit}
          />
        ))}

        {/* Skeleton placeholders while generating */}
        {isGenerating &&
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={`skel-${i}`} />)}
      </div>

      {/* Empty filtered state */}
      {!isGenerating && filtered.length === 0 && variants.length > 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12">
          <p className="text-sm text-muted-foreground">
            No copies match this filter. Try selecting a different platform.
          </p>
        </div>
      )}
    </div>
  );
}
