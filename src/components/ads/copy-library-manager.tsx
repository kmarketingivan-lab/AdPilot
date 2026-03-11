"use client";

import { useState, useMemo, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlusIcon,
  SearchIcon,
  TrashIcon,
  PencilIcon,
  TagIcon,
  DownloadIcon,
  CheckIcon,
  BookmarkIcon,
  ArrowUpDownIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdPlatform } from "./copy-variant-card";
import { CopyFormDialog } from "./copy-form-dialog";

// ---------- Types ----------

export type CopyTone =
  | "Professionale"
  | "Conversazionale"
  | "Urgente"
  | "Informativo";

export interface SavedCopy {
  id: string;
  headline: string;
  description: string;
  cta: string;
  platform: AdPlatform;
  tone?: CopyTone;
  tags: string[];
  createdAt: string;
  /** Optional performance score (0-100), derived from metrics when available */
  performanceScore?: number;
}

interface CopyLibraryManagerProps {
  copies: SavedCopy[];
  onSave: (copy: Omit<SavedCopy, "id" | "createdAt">) => void;
  onEdit?: (copy: SavedCopy) => void;
  onDelete: (copyId: string) => void;
  onBulkDelete: (copyIds: string[]) => void;
  className?: string;
}

// ---------- Constants ----------

const ALL_TONES: CopyTone[] = [
  "Professionale",
  "Conversazionale",
  "Urgente",
  "Informativo",
];

const ALL_PLATFORMS: { value: AdPlatform; label: string }[] = [
  { value: "GOOGLE_SEARCH", label: "Google Search" },
  { value: "META_FEED", label: "Meta Feed" },
  { value: "LINKEDIN", label: "LinkedIn" },
];

type SortMode = "date_desc" | "date_asc" | "performance_desc" | "performance_asc";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "date_desc", label: "Piu recenti" },
  { value: "date_asc", label: "Meno recenti" },
  { value: "performance_desc", label: "Performance (migliore)" },
  { value: "performance_asc", label: "Performance (peggiore)" },
];

// ---------- Main component ----------

export function CopyLibraryManager({
  copies,
  onSave,
  onEdit,
  onDelete,
  onBulkDelete,
  className,
}: CopyLibraryManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<AdPlatform | "ALL">(
    "ALL"
  );
  const [filterTone, setFilterTone] = useState<CopyTone | "ALL">("ALL");
  const [filterTag, setFilterTag] = useState<string | "ALL">("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("date_desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const copy of copies) {
      for (const tag of copy.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [copies]);

  // Filter and sort
  const filteredCopies = useMemo(() => {
    let result = copies;

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.headline.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
      );
    }

    // Platform filter
    if (filterPlatform !== "ALL") {
      result = result.filter((c) => c.platform === filterPlatform);
    }

    // Tone filter
    if (filterTone !== "ALL") {
      result = result.filter((c) => c.tone === filterTone);
    }

    // Tag filter
    if (filterTag !== "ALL") {
      result = result.filter((c) => c.tags.includes(filterTag));
    }

    // Sort
    const sorted = [...result];
    switch (sortMode) {
      case "date_desc":
        sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
      case "date_asc":
        sorted.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        break;
      case "performance_desc":
        sorted.sort(
          (a, b) => (b.performanceScore ?? -1) - (a.performanceScore ?? -1)
        );
        break;
      case "performance_asc":
        sorted.sort(
          (a, b) => (a.performanceScore ?? Infinity) - (b.performanceScore ?? Infinity)
        );
        break;
    }

    return sorted;
  }, [copies, searchQuery, filterPlatform, filterTone, filterTag, sortMode]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredCopies.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCopies.map((c) => c.id)));
    }
  }, [selectedIds.size, filteredCopies]);

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length > 0) {
      onBulkDelete(ids);
      setSelectedIds(new Set());
    }
  }

  function handleExportSelected() {
    const selected = copies.filter((c) => selectedIds.has(c.id));
    const data = selected.map((c) => ({
      headline: c.headline,
      description: c.description,
      cta: c.cta,
      platform: c.platform,
      tone: c.tone,
      tags: c.tags,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adpilot-copies-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const platformLabel: Record<AdPlatform, string> = {
    GOOGLE_SEARCH: "Google Search",
    META_FEED: "Meta Feed",
    LINKEDIN: "LinkedIn",
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookmarkIcon className="size-5" />
          <h3 className="text-lg font-semibold">Libreria Copy</h3>
          <Badge variant="secondary">{copies.length}</Badge>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} selezionati
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportSelected}
              >
                <DownloadIcon data-icon="inline-start" />
                Esporta
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={handleBulkDelete}
              >
                <TrashIcon data-icon="inline-start" />
                Elimina
              </Button>
            </>
          )}
          <CopyFormDialog
            trigger={
              <Button size="sm">
                <PlusIcon data-icon="inline-start" />
                Nuovo copy
              </Button>
            }
            onSubmit={onSave}
          />
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per headline o descrizione..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={filterPlatform}
          onValueChange={(v) => setFilterPlatform((v ?? "ALL") as AdPlatform | "ALL")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Piattaforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tutte le piattaforme</SelectItem>
            {ALL_PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterTone}
          onValueChange={(v) => setFilterTone((v ?? "ALL") as CopyTone | "ALL")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tono" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tutti i toni</SelectItem>
            {ALL_TONES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {allTags.length > 0 && (
          <Select
            value={filterTag}
            onValueChange={(v) => setFilterTag(v ?? "ALL")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tutti i tag</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={sortMode}
          onValueChange={(v) => setSortMode((v ?? "date_desc") as SortMode)}
        >
          <SelectTrigger>
            <ArrowUpDownIcon className="size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Select all */}
      {filteredCopies.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            className={cn(
              "flex size-4 items-center justify-center rounded border transition-colors",
              selectedIds.size === filteredCopies.length
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input"
            )}
          >
            {selectedIds.size === filteredCopies.length && (
              <CheckIcon className="size-3" />
            )}
          </button>
          <span className="text-xs text-muted-foreground">
            Seleziona tutti ({filteredCopies.length})
          </span>
        </div>
      )}

      {/* Copy cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredCopies.map((copy) => {
          const isSelected = selectedIds.has(copy.id);

          return (
            <Card
              key={copy.id}
              className={cn(
                "transition-shadow",
                isSelected && "ring-2 ring-primary"
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSelect(copy.id)}
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      )}
                    >
                      {isSelected && <CheckIcon className="size-3" />}
                    </button>
                    <CardTitle className="text-sm">
                      {copy.headline}
                    </CardTitle>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 text-xs"
                  >
                    {platformLabel[copy.platform]}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-2 pb-2">
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {copy.description}
                </p>
                {copy.cta && (
                  <p className="text-xs font-medium">CTA: {copy.cta}</p>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  {copy.tone && (
                    <Badge variant="outline" className="text-xs">
                      {copy.tone}
                    </Badge>
                  )}
                  {copy.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-0.5 text-xs"
                    >
                      <TagIcon className="size-2.5" />
                      {tag}
                    </Badge>
                  ))}
                </div>
                {copy.performanceScore != null && (
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          copy.performanceScore >= 70
                            ? "bg-green-500"
                            : copy.performanceScore >= 40
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        )}
                        style={{ width: `${copy.performanceScore}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {copy.performanceScore}%
                    </span>
                  </div>
                )}
              </CardContent>

              <CardFooter className="gap-1 pt-0">
                {onEdit && (
                  <CopyFormDialog
                    trigger={
                      <Button size="sm" variant="ghost">
                        <PencilIcon data-icon="inline-start" />
                        Modifica
                      </Button>
                    }
                    initial={copy}
                    onSubmit={(data) =>
                      onEdit({
                        ...copy,
                        ...data,
                      })
                    }
                  />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => onDelete(copy.id)}
                >
                  <TrashIcon data-icon="inline-start" />
                  Elimina
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredCopies.length === 0 && (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <BookmarkIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nessun copy trovato</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {copies.length === 0
              ? "La tua libreria e vuota. Crea il tuo primo copy."
              : "Prova a modificare i filtri di ricerca."}
          </p>
        </div>
      )}
    </div>
  );
}
