"use client";

import { useMemo } from "react";
import {
  FileCheck2,
  Eye,
  Heart,
  TrendingUp,
  Trophy,
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  Music2,
  Youtube,
} from "lucide-react";
import type { Platform } from "@prisma/client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SocialPostMetric {
  postPlatformId: string;
  content: string;
  platform: Platform;
  publishedAt: string | Date | null;
  impressions: number;
  clicks: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
}

interface SocialMetricsSummaryProps {
  posts: SocialPostMetric[];
  isLoading?: boolean;
}

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

const PLATFORM_LABEL: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  LINKEDIN: "LinkedIn",
  TWITTER: "X",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
};

const PLATFORM_COLOR: Record<string, string> = {
  FACEBOOK: "bg-blue-500",
  INSTAGRAM: "bg-pink-500",
  LINKEDIN: "bg-sky-600",
  TWITTER: "bg-zinc-400",
  TIKTOK: "bg-rose-400",
  YOUTUBE: "bg-red-500",
};

const PLATFORM_TEXT_COLOR: Record<string, string> = {
  FACEBOOK: "text-blue-500",
  INSTAGRAM: "text-pink-500",
  LINKEDIN: "text-sky-600",
  TWITTER: "text-zinc-400",
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

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Skeleton
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
// Component
// ---------------------------------------------------------------------------

export function SocialMetricsSummary({
  posts,
  isLoading,
}: SocialMetricsSummaryProps) {
  const stats = useMemo(() => {
    if (posts.length === 0) {
      return {
        totalPosts: 0,
        totalImpressions: 0,
        totalEngagement: 0,
        avgEngagementRate: 0,
        bestPlatform: null as string | null,
        topPosts: [] as SocialPostMetric[],
        platformBreakdown: [] as {
          platform: string;
          engagement: number;
          posts: number;
          percentage: number;
        }[],
      };
    }

    let totalImpressions = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;

    // Per-platform aggregation
    const platformMap = new Map<
      string,
      { engagement: number; posts: number; impressions: number }
    >();

    for (const post of posts) {
      totalImpressions += post.impressions;
      totalLikes += post.likes;
      totalComments += post.comments;
      totalShares += post.shares;

      const engagement = post.likes + post.comments + post.shares;
      const existing = platformMap.get(post.platform) ?? {
        engagement: 0,
        posts: 0,
        impressions: 0,
      };
      platformMap.set(post.platform, {
        engagement: existing.engagement + engagement,
        posts: existing.posts + 1,
        impressions: existing.impressions + post.impressions,
      });
    }

    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgEngagementRate =
      totalImpressions > 0 ? (totalEngagement / totalImpressions) * 100 : 0;

    // Best platform by engagement
    let bestPlatform: string | null = null;
    let maxEngagement = 0;
    for (const [platform, data] of platformMap) {
      if (data.engagement > maxEngagement) {
        maxEngagement = data.engagement;
        bestPlatform = platform;
      }
    }

    // Platform breakdown sorted by engagement
    const platformBreakdown = Array.from(platformMap.entries())
      .map(([platform, data]) => ({
        platform,
        engagement: data.engagement,
        posts: data.posts,
        percentage:
          totalEngagement > 0
            ? (data.engagement / totalEngagement) * 100
            : 0,
      }))
      .sort((a, b) => b.engagement - a.engagement);

    // Top 5 posts by engagement
    const topPosts = [...posts]
      .sort(
        (a, b) =>
          b.likes +
          b.comments +
          b.shares -
          (a.likes + a.comments + a.shares)
      )
      .slice(0, 5);

    return {
      totalPosts: posts.length,
      totalImpressions,
      totalEngagement,
      avgEngagementRate,
      bestPlatform,
      topPosts,
      platformBreakdown,
    };
  }, [posts]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const kpiCards = [
    {
      label: "Posts Published",
      value: stats.totalPosts.toString(),
      icon: FileCheck2,
      color: "text-orange-400",
    },
    {
      label: "Total Impressions",
      value: formatNumber(stats.totalImpressions),
      icon: Eye,
      color: "text-blue-400",
    },
    {
      label: "Total Engagement",
      value: formatNumber(stats.totalEngagement),
      icon: Heart,
      color: "text-pink-400",
    },
    {
      label: "Avg Eng. Rate",
      value: `${stats.avgEngagementRate.toFixed(2)}%`,
      icon: TrendingUp,
      color: "text-purple-400",
    },
    {
      label: "Best Platform",
      value: stats.bestPlatform
        ? PLATFORM_LABEL[stats.bestPlatform] ?? stats.bestPlatform
        : "-",
      icon: Trophy,
      color: "text-yellow-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <card.icon className={`size-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Platform breakdown */}
        {stats.platformBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Engagement by Platform</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.platformBreakdown.map(
                ({ platform, engagement, posts: postCount, percentage }) => {
                  const Icon =
                    PLATFORM_ICON[platform] ?? Facebook;
                  const barColor =
                    PLATFORM_COLOR[platform] ?? "bg-muted-foreground";
                  const textColor =
                    PLATFORM_TEXT_COLOR[platform] ?? "text-muted-foreground";

                  return (
                    <div key={platform} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`size-4 ${textColor}`} />
                          <span className="text-sm font-medium">
                            {PLATFORM_LABEL[platform] ?? platform}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({postCount} post{postCount !== 1 ? "s" : ""})
                          </span>
                        </div>
                        <span className="text-sm tabular-nums font-medium">
                          {formatNumber(engagement)}
                        </span>
                      </div>

                      {/* Bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        />
                      </div>

                      <p className="text-xs text-muted-foreground tabular-nums">
                        {percentage.toFixed(1)}% of total engagement
                      </p>
                    </div>
                  );
                }
              )}
            </CardContent>
          </Card>
        )}

        {/* Top 5 performing posts */}
        {stats.topPosts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-4 text-yellow-500" />
                Top Performing Posts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.topPosts.map((post, index) => {
                const Icon =
                  PLATFORM_ICON[post.platform] ?? Facebook;
                const textColor =
                  PLATFORM_TEXT_COLOR[post.platform] ??
                  "text-muted-foreground";
                const engagement =
                  post.likes + post.comments + post.shares;

                return (
                  <div
                    key={post.postPlatformId}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/20"
                  >
                    {/* Rank */}
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {index + 1}
                    </div>

                    {/* Platform icon */}
                    <Icon className={`size-4 shrink-0 ${textColor}`} />

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm leading-tight"
                        title={post.content}
                      >
                        {truncate(post.content, 60)}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDate(post.publishedAt)}</span>
                        <span>{formatNumber(post.impressions)} imp.</span>
                      </div>
                    </div>

                    {/* Engagement count */}
                    <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">
                      {formatNumber(engagement)} eng.
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Empty state for both sections */}
      {stats.totalPosts === 0 && (
        <Card className="flex flex-col items-center justify-center py-12">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <FileCheck2 className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No social posts data</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Publish posts across your social platforms to see aggregated
                metrics here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
