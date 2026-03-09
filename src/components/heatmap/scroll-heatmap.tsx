"use client";

import { ArrowDownIcon } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────

interface ScrollHeatmapProps {
  workspaceId: string;
  siteId: string;
  pageUrl?: string;
  startDate?: Date;
  endDate?: Date;
}

// ── Color helpers ──────────────────────────────────────────────────────────

function scrollColor(percentage: number): string {
  // 100% → green, 0% → red
  const t = percentage / 100;

  if (t > 0.7) {
    // green zone
    return `rgba(34, 197, 94, ${0.3 + t * 0.4})`;
  } else if (t > 0.4) {
    // yellow zone
    return `rgba(234, 179, 8, ${0.3 + t * 0.3})`;
  } else if (t > 0.15) {
    // orange zone
    return `rgba(249, 115, 22, ${0.3 + t * 0.3})`;
  } else {
    // red zone
    return `rgba(239, 68, 68, ${0.2 + t * 0.3})`;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function ScrollHeatmap({
  workspaceId,
  siteId,
  pageUrl,
  startDate,
  endDate,
}: ScrollHeatmapProps) {
  const { data, isLoading } = trpc.heatmap.getScrollData.useQuery(
    { workspaceId, siteId, pageUrl, startDate, endDate },
    { enabled: !!workspaceId && !!siteId }
  );

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full rounded-lg" />;
  }

  if (!data || data.totalSessions === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] rounded-lg border text-muted-foreground">
        <ArrowDownIcon className="size-12 mb-3 opacity-30" />
        <p className="text-sm">No scroll data available for this period.</p>
      </div>
    );
  }

  const { distribution, averageDepth, totalSessions } = data;

  // Find the fold line — assume typical fold at ~60% of viewport
  // or we use the bucket where percentage drops below 50%
  const foldBucket = distribution.find((b) => b.percentage < 50);
  const foldDepth = foldBucket ? foldBucket.depth : 100;

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <ArrowDownIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Avg. scroll depth:</span>
          <span className="font-semibold tabular-nums">
            {averageDepth}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Total sessions:</span>
          <span className="font-semibold tabular-nums">{totalSessions}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Fold line:</span>
          <span className="font-semibold tabular-nums">{foldDepth}%</span>
        </div>
      </div>

      {/* Scroll visualization */}
      <div className="flex gap-4 rounded-lg border bg-white dark:bg-gray-950 p-4 overflow-hidden">
        {/* Left: vertical scroll bar */}
        <div className="relative flex flex-col w-16 shrink-0">
          {distribution.map((bucket, i) => {
            const height = `${100 / distribution.length}%`;
            return (
              <div
                key={bucket.depth}
                className="relative flex items-center justify-center text-[10px] font-medium text-foreground/80"
                style={{
                  height,
                  background: scrollColor(bucket.percentage),
                }}
              >
                {bucket.depth}%
              </div>
            );
          })}

          {/* Fold line indicator */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-red-500"
            style={{
              top: `${(foldDepth / 100) * 100}%`,
            }}
          >
            <span className="absolute -top-3 left-full ml-2 whitespace-nowrap text-[10px] font-medium text-red-500">
              Fold
            </span>
          </div>
        </div>

        {/* Right: horizontal bars chart */}
        <div className="flex flex-1 flex-col gap-1">
          {distribution.map((bucket) => (
            <div key={bucket.depth} className="flex items-center gap-3">
              <div className="w-10 text-right text-xs text-muted-foreground tabular-nums shrink-0">
                {bucket.depth}%
              </div>
              <div className="flex-1 h-5 rounded-sm bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: `${bucket.percentage}%`,
                    background: scrollColor(bucket.percentage),
                  }}
                />
              </div>
              <div className="w-16 text-right text-xs tabular-nums">
                <span className="font-medium">{bucket.percentage}%</span>
                <span className="text-muted-foreground ml-1">
                  ({bucket.sessions})
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full-page scroll overlay representation */}
      <div className="relative h-[500px] rounded-lg border bg-white dark:bg-gray-950 overflow-hidden">
        {/* Gradient overlay representing scroll reach */}
        {distribution.map((bucket, i) => {
          const top = ((bucket.depth - 10) / 100) * 100;
          const height = 10; // 10% of page per bucket
          return (
            <div
              key={bucket.depth}
              className="absolute left-0 right-0"
              style={{
                top: `${top}%`,
                height: `${height}%`,
                background: scrollColor(bucket.percentage),
              }}
            >
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-foreground/70 tabular-nums">
                {bucket.percentage}% reached
              </div>
            </div>
          );
        })}

        {/* Fold line on overlay */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-red-500 z-10"
          style={{ top: `${(foldDepth / 100) * 100}%` }}
        >
          <span className="absolute -top-3 left-2 text-[10px] font-semibold text-red-500 bg-white/80 dark:bg-gray-950/80 px-1 rounded">
            Fold line ({foldDepth}%)
          </span>
        </div>

        {/* Average line */}
        <div
          className="absolute left-0 right-0 border-t-2 border-blue-500 z-10"
          style={{ top: `${(averageDepth / 100) * 100}%` }}
        >
          <span className="absolute -top-3 right-2 text-[10px] font-semibold text-blue-500 bg-white/80 dark:bg-gray-950/80 px-1 rounded">
            Avg ({averageDepth}%)
          </span>
        </div>
      </div>
    </div>
  );
}
