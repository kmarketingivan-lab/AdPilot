"use client";

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckIcon,
  GridIcon,
  FlaskConicalIcon,
  XIcon,
  CheckCheckIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Types ----------

export interface VariantCombination {
  id: string;
  headline: string;
  description: string;
  cta: string;
}

interface VariantCombinerProps {
  headlines: string[];
  descriptions: string[];
  ctas: string[];
  onCreateTest: (selected: VariantCombination[]) => void;
}

// ---------- Helpers ----------

function generateCombinations(
  headlines: string[],
  descriptions: string[],
  ctas: string[],
): VariantCombination[] {
  const combinations: VariantCombination[] = [];

  for (let h = 0; h < headlines.length; h++) {
    for (let d = 0; d < descriptions.length; d++) {
      for (let c = 0; c < ctas.length; c++) {
        combinations.push({
          id: `${h}-${d}-${c}`,
          headline: headlines[h],
          description: descriptions[d],
          cta: ctas[c],
        });
      }
    }
  }

  return combinations;
}

// ---------- Mini Preview Card ----------

function MiniPreviewCard({
  combination,
  selected,
  onToggle,
}: {
  combination: VariantCombination;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(combination.id)}
      className={cn(
        "relative w-full cursor-pointer rounded-lg border p-3 text-left transition-all",
        "hover:border-primary/50 hover:shadow-sm",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card",
      )}
    >
      {/* Selection indicator */}
      <div
        className={cn(
          "absolute right-2 top-2 flex size-5 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30",
        )}
      >
        {selected && <CheckIcon className="size-3" />}
      </div>

      {/* Headline */}
      <p className="mb-1 pr-6 text-sm font-semibold leading-tight line-clamp-2">
        {combination.headline}
      </p>

      {/* Description */}
      <p className="mb-1.5 text-xs text-muted-foreground leading-snug line-clamp-2">
        {combination.description}
      </p>

      {/* CTA */}
      <span className="inline-block rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium">
        {combination.cta}
      </span>
    </button>
  );
}

// ---------- Component ----------

export function VariantCombiner({
  headlines,
  descriptions,
  ctas,
  onCreateTest,
}: VariantCombinerProps) {
  const combinations = useMemo(
    () => generateCombinations(headlines, descriptions, ctas),
    [headlines, descriptions, ctas],
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(combinations.map((c) => c.id)),
  );

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(combinations.map((c) => c.id)));
  }, [combinations]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectedCombinations = useMemo(
    () => combinations.filter((c) => selectedIds.has(c.id)),
    [combinations, selectedIds],
  );

  const allSelected = selectedIds.size === combinations.length;
  const noneSelected = selectedIds.size === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <GridIcon className="size-5" />
            Variant Combinations
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {headlines.length} &times; {descriptions.length} &times;{" "}
              {ctas.length} = {combinations.length} total
            </Badge>
            <Badge
              variant={noneSelected ? "destructive" : "default"}
              className="tabular-nums"
            >
              {selectedIds.size} selected
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Actions bar */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={selectAll}
            disabled={allSelected}
          >
            <CheckCheckIcon data-icon="inline-start" />
            Select All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={clearAll}
            disabled={noneSelected}
          >
            <XIcon data-icon="inline-start" />
            Clear All
          </Button>

          <div className="flex-1" />

          <Button
            size="sm"
            onClick={() => onCreateTest(selectedCombinations)}
            disabled={noneSelected}
          >
            <FlaskConicalIcon data-icon="inline-start" />
            Create A/B Test ({selectedIds.size})
          </Button>
        </div>

        {/* Combinations grid */}
        <ScrollArea className="max-h-[600px]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {combinations.map((combo) => (
              <MiniPreviewCard
                key={combo.id}
                combination={combo}
                selected={selectedIds.has(combo.id)}
                onToggle={toggleOne}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
