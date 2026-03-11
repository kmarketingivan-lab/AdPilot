"use client";

import { useState } from "react";
import { Platform } from "@prisma/client";
import {
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  Music2,
  Youtube,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Platform config
// ---------------------------------------------------------------------------

const PLATFORM_ICON: Record<string, typeof Facebook> = {
  FACEBOOK: Facebook,
  INSTAGRAM: Instagram,
  LINKEDIN: Linkedin,
  TWITTER: Twitter,
  TIKTOK: Music2,
  YOUTUBE: Youtube,
};

const PLATFORM_COLOR: Record<string, string> = {
  FACEBOOK: "text-blue-500",
  INSTAGRAM: "text-pink-500",
  LINKEDIN: "text-sky-600",
  TWITTER: "text-zinc-100",
  TIKTOK: "text-rose-400",
  YOUTUBE: "text-red-500",
};

const PLATFORM_LABEL: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  LINKEDIN: "LinkedIn",
  TWITTER: "X",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey =
  | "publishedAt"
  | "impressions"
  | "clicks"
  | "likes"
  | "comments"
  | "shares"
  | "reach"
  | "engagement";

type SortOrder = "asc" | "desc";

interface PostAnalyticsTableProps {
  dateRange: "7d" | "30d" | "90d";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortOrder,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  currentSortOrder: SortOrder;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSortKey === sortKey;
  const Icon = isActive
    ? currentSortOrder === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground ${className ?? ""}`}
    >
      {label}
      <Icon
        className={`size-3 ${isActive ? "text-foreground" : "text-muted-foreground/50 group-hover:text-muted-foreground"}`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Table skeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PostAnalyticsTable({ dateRange }: PostAnalyticsTableProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const [sortBy, setSortBy] = useState<SortKey>("publishedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const metrics = trpc.analytics.getPostMetrics.useQuery(
    {
      workspaceId,
      sortBy,
      sortOrder,
      dateRange,
      ...(platformFilter !== "all" && {
        platform: platformFilter as Platform,
      }),
    },
    { enabled: !!workspaceId }
  );

  function handleSort(key: SortKey) {
    if (key === sortBy) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
  }

  const columns: { label: string; key: SortKey; align?: "right" }[] = [
    { label: "Impressions", key: "impressions", align: "right" },
    { label: "Clicks", key: "clicks", align: "right" },
    { label: "Likes", key: "likes", align: "right" },
    { label: "Comments", key: "comments", align: "right" },
    { label: "Shares", key: "shares", align: "right" },
    { label: "Reach", key: "reach", align: "right" },
    { label: "Eng. Rate", key: "engagement", align: "right" },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v ?? "all")}>
          <SelectTrigger size="sm">
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {Object.entries(PLATFORM_LABEL).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {metrics.isLoading && <TableSkeleton />}

      {/* Empty */}
      {metrics.data && metrics.data.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-12">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <BarChart3 className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No published posts yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Publish some posts to see analytics data here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {metrics.data && metrics.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="min-w-[180px] flex-1">
              <SortableHeader
                label="Post"
                sortKey="publishedAt"
                currentSortKey={sortBy}
                currentSortOrder={sortOrder}
                onSort={handleSort}
              />
            </div>
            <div className="w-16 shrink-0 text-center">
              <span className="text-xs font-medium text-muted-foreground">
                Platform
              </span>
            </div>
            <div className="w-20 shrink-0">
              <SortableHeader
                label="Date"
                sortKey="publishedAt"
                currentSortKey={sortBy}
                currentSortOrder={sortOrder}
                onSort={handleSort}
                className="justify-end w-full"
              />
            </div>
            {columns.map((col) => (
              <div key={col.key} className="w-20 shrink-0">
                <SortableHeader
                  label={col.label}
                  sortKey={col.key}
                  currentSortKey={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="justify-end w-full"
                />
              </div>
            ))}
          </div>

          {/* Rows */}
          {metrics.data.map((row) => {
            const PlatformIcon =
              PLATFORM_ICON[row.platform] ?? Facebook;
            const platformColor =
              PLATFORM_COLOR[row.platform] ?? "text-muted-foreground";

            return (
              <div
                key={row.postPlatformId}
                className="flex items-center gap-2 border-b border-border px-4 py-2.5 last:border-b-0 transition-colors hover:bg-muted/20"
              >
                {/* Content */}
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm leading-tight" title={row.content}>
                    {truncate(row.content, 60)}
                  </p>
                </div>

                {/* Platform icon */}
                <div className="flex w-16 shrink-0 items-center justify-center">
                  <PlatformIcon className={`size-4 ${platformColor}`} />
                </div>

                {/* Date */}
                <div className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                  {formatDate(row.publishedAt)}
                </div>

                {/* Metrics */}
                <div className="w-20 shrink-0 text-right text-sm tabular-nums">
                  {formatNumber(row.impressions)}
                </div>
                <div className="w-20 shrink-0 text-right text-sm tabular-nums">
                  {formatNumber(row.clicks)}
                </div>
                <div className="w-20 shrink-0 text-right text-sm tabular-nums">
                  {formatNumber(row.likes)}
                </div>
                <div className="w-20 shrink-0 text-right text-sm tabular-nums">
                  {formatNumber(row.comments)}
                </div>
                <div className="w-20 shrink-0 text-right text-sm tabular-nums">
                  {formatNumber(row.shares)}
                </div>
                <div className="w-20 shrink-0 text-right text-sm tabular-nums">
                  {formatNumber(row.reach)}
                </div>
                <div className="w-20 shrink-0 text-right">
                  <Badge variant="secondary" className="text-xs tabular-nums">
                    {row.engagement.toFixed(2)}%
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
