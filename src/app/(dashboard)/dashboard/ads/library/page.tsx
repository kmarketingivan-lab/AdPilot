"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  Trash2,
  SparklesIcon,
  Loader2,
  BookOpenIcon,
  MegaphoneIcon,
  PlusIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdPlatform } from "@/components/ads/copy-variant-card";

// ---------- Types ----------

interface SavedCopy {
  id: string;
  headline: string;
  description: string;
  cta: string;
  platform: AdPlatform;
  tone: string | null;
  tags: string[];
  aiGenerated: boolean;
  createdAt: Date | string;
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

const PLATFORM_OPTIONS: { value: AdPlatform | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Platforms" },
  { value: "GOOGLE_SEARCH", label: "Google Search" },
  { value: "META_FEED", label: "Meta Feed" },
  { value: "LINKEDIN", label: "LinkedIn" },
];

const TONE_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "All Tones" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "urgent", label: "Urgent" },
  { value: "friendly", label: "Friendly" },
  { value: "bold", label: "Bold" },
];

// ---------- Page Component ----------

export default function CopyLibraryPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | "ALL">("ALL");
  const [toneFilter, setToneFilter] = useState("ALL");
  const [selectedCopy, setSelectedCopy] = useState<SavedCopy | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = (trpc as any).ads.listCopies.useQuery(
    {
      workspaceId,
      ...(search && { search }),
      ...(platformFilter !== "ALL" && { platform: platformFilter }),
      ...(toneFilter !== "ALL" && { tone: toneFilter }),
    },
    { enabled: !!workspaceId },
  ) as { data: SavedCopy[] | undefined; isLoading: boolean };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteMutation = (trpc as any).ads.deleteCopy.useMutation({
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utils as any).ads.listCopies.invalidate();
    },
  });

  const handleDelete = useCallback(
    async (id: string) => {
      if (!workspace) return;
      setDeletingId(id);
      try {
        await deleteMutation.mutateAsync({ workspaceId: workspace.id, id });
        if (selectedCopy?.id === id) setSelectedCopy(null);
      } finally {
        setDeletingId(null);
      }
    },
    [workspace, deleteMutation, selectedCopy],
  );

  const copies = data ?? [];

  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Copy Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse and manage your saved ad copies.
          </p>
        </div>

        <Link href="/dashboard/ads/generate">
          <Button>
            <PlusIcon data-icon="inline-start" />
            Generate New Copy
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by headline or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

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

        <Select value={toneFilter} onValueChange={(v) => setToneFilter(v ?? "")}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TONE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-3 pt-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && copies.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed py-16">
          <BookOpenIcon className="mb-4 size-12 text-muted-foreground/50" />
          <h3 className="mb-1 text-lg font-medium">No saved copies yet</h3>
          <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
            {search || platformFilter !== "ALL" || toneFilter !== "ALL"
              ? "No copies match your current filters. Try adjusting your search."
              : "Generate your first ad copy with AI and save it here for later use."}
          </p>
          {!search && platformFilter === "ALL" && toneFilter === "ALL" && (
            <Link href="/dashboard/ads/generate">
              <Button>
                <SparklesIcon data-icon="inline-start" />
                Generate Ad Copy
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Copies grid */}
      {!isLoading && copies.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copies.map((copy) => (
            <Card
              key={copy.id}
              className="cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/20"
              onClick={() => setSelectedCopy(copy)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "border-0 font-medium",
                      PLATFORM_COLORS[copy.platform],
                    )}
                  >
                    {PLATFORM_LABELS[copy.platform]}
                  </Badge>
                  {copy.aiGenerated && (
                    <Badge variant="secondary" className="gap-1">
                      <SparklesIcon className="size-3" />
                      AI
                    </Badge>
                  )}
                  {copy.tone && (
                    <Badge variant="outline" className="capitalize">
                      {copy.tone}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                <p className="line-clamp-1 text-sm font-semibold">
                  {copy.headline}
                </p>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {copy.description}
                </p>
                {copy.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {copy.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter className="gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    // placeholder - future "use in campaign" action
                  }}
                >
                  <MegaphoneIcon data-icon="inline-start" />
                  Use in Campaign
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(copy.id);
                  }}
                  disabled={deletingId === copy.id}
                >
                  {deletingId === copy.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" data-icon="inline-start" />
                  )}
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog
        open={!!selectedCopy}
        onOpenChange={(open) => {
          if (!open) setSelectedCopy(null);
        }}
      >
        {selectedCopy && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Copy Details</DialogTitle>
              <DialogDescription>
                {PLATFORM_LABELS[selectedCopy.platform]}
                {selectedCopy.tone ? ` — ${selectedCopy.tone}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              {/* Headline */}
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Headline
                </span>
                <p className="text-sm font-semibold">{selectedCopy.headline}</p>
              </div>

              <Separator />

              {/* Description */}
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Description
                </span>
                <p className="whitespace-pre-wrap text-sm">
                  {selectedCopy.description}
                </p>
              </div>

              <Separator />

              {/* CTA */}
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  CTA
                </span>
                <p className="text-sm font-medium">{selectedCopy.cta}</p>
              </div>

              {/* Tags */}
              {selectedCopy.tags.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      Tags
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {selectedCopy.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Badges row */}
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  className={cn(
                    "border-0 font-medium",
                    PLATFORM_COLORS[selectedCopy.platform],
                  )}
                >
                  {PLATFORM_LABELS[selectedCopy.platform]}
                </Badge>
                {selectedCopy.aiGenerated && (
                  <Badge variant="secondary" className="gap-1">
                    <SparklesIcon className="size-3" />
                    AI Generated
                  </Badge>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // placeholder - future "use in campaign"
                }}
              >
                <MegaphoneIcon data-icon="inline-start" />
                Use in Campaign
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(selectedCopy.id)}
                disabled={deletingId === selectedCopy.id}
              >
                {deletingId === selectedCopy.id ? (
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                ) : (
                  <Trash2 className="size-4" data-icon="inline-start" />
                )}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
