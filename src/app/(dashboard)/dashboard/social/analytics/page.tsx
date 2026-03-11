"use client";

import { useState } from "react";
import {
  Eye,
  MousePointerClick,
  TrendingUp,
  FileCheck2,
  Trophy,
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  Music2,
  Youtube,
} from "lucide-react";
import { Platform } from "@prisma/client";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PostAnalyticsTable } from "@/components/social/post-analytics-table";

// ---------------------------------------------------------------------------
// Platform helpers
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
// KPI card skeleton
// ---------------------------------------------------------------------------

function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="size-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-20" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Top post skeleton
// ---------------------------------------------------------------------------

function TopPostSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SocialAnalyticsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d">("30d");

  const kpi = trpc.analytics.getKpiSummary.useQuery(
    { workspaceId, dateRange },
    { enabled: !!workspaceId }
  );

  const topPosts = trpc.analytics.getTopPosts.useQuery(
    { workspaceId, dateRange },
    { enabled: !!workspaceId }
  );

  const kpiCards = [
    {
      label: "Total Impressions",
      value: kpi.data ? formatNumber(kpi.data.totalImpressions) : null,
      icon: Eye,
      color: "text-blue-400",
    },
    {
      label: "Total Clicks",
      value: kpi.data ? formatNumber(kpi.data.totalClicks) : null,
      icon: MousePointerClick,
      color: "text-green-400",
    },
    {
      label: "Avg Engagement Rate",
      value: kpi.data ? `${kpi.data.avgEngagement.toFixed(2)}%` : null,
      icon: TrendingUp,
      color: "text-purple-400",
    },
    {
      label: "Posts Published",
      value: kpi.data ? kpi.data.totalPosts.toString() : null,
      icon: FileCheck2,
      color: "text-orange-400",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Social Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track performance across all your social channels.
          </p>
        </div>
        <Select
          value={dateRange}
          onValueChange={(v) => { if (v) setDateRange(v as "7d" | "30d" | "90d"); }}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) =>
          kpi.isLoading ? (
            <KpiCardSkeleton key={card.label} />
          ) : (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <card.icon className={`size-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{card.value ?? "-"}</p>
              </CardContent>
            </Card>
          )
        )}
      </div>

      {/* Post analytics table */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Post Performance</h2>
        <PostAnalyticsTable dateRange={dateRange} />
      </div>

      {/* Top performing posts */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="size-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Top Performing Posts</h2>
        </div>

        {topPosts.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <TopPostSkeleton key={i} />
            ))}
          </div>
        )}

        {topPosts.data && topPosts.data.length === 0 && (
          <Card className="flex flex-col items-center justify-center py-8">
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">
                No published posts to rank yet.
              </p>
            </CardContent>
          </Card>
        )}

        {topPosts.data && topPosts.data.length > 0 && (
          <div className="space-y-2">
            {topPosts.data.map((post, index) => (
              <div
                key={post.postId}
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/20"
              >
                {/* Rank */}
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                  {index + 1}
                </div>

                {/* Content + platforms */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight" title={post.content}>
                    {truncate(post.content, 80)}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {post.platforms.map((p: Platform) => {
                        const Icon = PLATFORM_ICON[p] ?? Facebook;
                        const color =
                          PLATFORM_COLOR[p] ?? "text-muted-foreground";
                        return (
                          <Icon key={p} className={`size-3 ${color}`} />
                        );
                      })}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(post.publishedAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(post.impressions)} impressions
                    </span>
                  </div>
                </div>

                {/* Engagement badge */}
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {post.engagement.toFixed(2)}%
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
