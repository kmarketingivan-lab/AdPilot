"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailKpis {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
}

export interface TimeSeriesPoint {
  date: string;
  opens: number;
  clicks: number;
}

export interface LinkClickData {
  url: string;
  clicks: number;
  label?: string;
}

// ---------------------------------------------------------------------------
// KPI Cards
// ---------------------------------------------------------------------------

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function EmailKpiCards({
  kpis,
  isLoading,
}: {
  kpis: EmailKpis;
  isLoading?: boolean;
}) {
  const openRate = pct(kpis.opened, kpis.delivered);
  const clickRate = pct(kpis.clicked, kpis.delivered);
  const bounceRate = pct(kpis.bounced, kpis.sent);

  const cards = [
    { label: "Sent", value: kpis.sent.toLocaleString(), color: "text-foreground" },
    { label: "Delivered", value: kpis.delivered.toLocaleString(), color: "text-foreground" },
    { label: "Open Rate", value: openRate, color: "text-green-600" },
    { label: "Click Rate", value: clickRate, color: "text-blue-600" },
    { label: "Bounce Rate", value: bounceRate, color: "text-red-600" },
    { label: "Unsubscribed", value: kpis.unsubscribed.toLocaleString(), color: "text-orange-600" },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-8 w-20 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {card.label}
            </p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${card.color}`}>
              {card.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time Series Chart (opens/clicks over time) — pure CSS bars
// ---------------------------------------------------------------------------

export function EmailTimeSeriesChart({
  data,
  isLoading,
}: {
  data: TimeSeriesPoint[];
  isLoading?: boolean;
}) {
  const maxValue = useMemo(() => {
    return Math.max(1, ...data.map((d) => Math.max(d.opens, d.clicks)));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Opens & Clicks Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Opens & Clicks Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No data available for the selected period.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Opens & Clicks Over Time</CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />
              Opens
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
              Clicks
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-64 items-end gap-px overflow-x-auto">
          {data.map((point) => {
            const openHeight = (point.opens / maxValue) * 100;
            const clickHeight = (point.clicks / maxValue) * 100;

            return (
              <div
                key={point.date}
                className="group relative flex min-w-[8px] flex-1 flex-col items-center justify-end gap-0.5"
              >
                {/* Tooltip */}
                <div className="pointer-events-none absolute -top-16 z-10 hidden rounded border bg-popover px-2 py-1 text-xs shadow-md group-hover:block">
                  <p className="font-medium">{point.date}</p>
                  <p className="text-green-600">Opens: {point.opens}</p>
                  <p className="text-blue-600">Clicks: {point.clicks}</p>
                </div>

                {/* Bars */}
                <div className="flex w-full gap-px">
                  <div
                    className="flex-1 rounded-t-sm bg-green-500 transition-all group-hover:bg-green-400"
                    style={{ height: `${Math.max(openHeight, 1)}%` }}
                  />
                  <div
                    className="flex-1 rounded-t-sm bg-blue-500 transition-all group-hover:bg-blue-400"
                    style={{ height: `${Math.max(clickHeight, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis labels (show first, middle, last) */}
        {data.length > 0 && (
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{data[0].date}</span>
            {data.length > 2 && (
              <span>{data[Math.floor(data.length / 2)].date}</span>
            )}
            <span>{data[data.length - 1].date}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Click Heatmap — shows which links received the most clicks
// ---------------------------------------------------------------------------

export function ClickHeatmap({
  links,
  isLoading,
}: {
  links: LinkClickData[];
  isLoading?: boolean;
}) {
  const maxClicks = useMemo(
    () => Math.max(1, ...links.map((l) => l.clicks)),
    [links],
  );

  const sorted = useMemo(
    () => [...links].sort((a, b) => b.clicks - a.clicks),
    [links],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link Click Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link Click Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No link clicks recorded.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link Click Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sorted.map((link, idx) => {
            const intensity = link.clicks / maxClicks;
            // Interpolate from cool (low clicks) to hot (high clicks)
            const hue = Math.round((1 - intensity) * 200); // 200 = blue, 0 = red
            const saturation = 70 + intensity * 30;
            const lightness = 55 - intensity * 15;

            return (
              <div key={`${link.url}-${idx}`} className="relative">
                {/* Background bar */}
                <div
                  className="absolute inset-y-0 left-0 rounded transition-all"
                  style={{
                    width: `${(link.clicks / maxClicks) * 100}%`,
                    backgroundColor: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
                    opacity: 0.15,
                  }}
                />

                <div className="relative flex items-center justify-between rounded px-3 py-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
                      }}
                    />
                    <span
                      className="truncate text-sm"
                      title={link.url}
                    >
                      {link.label ?? truncateUrl(link.url)}
                    </span>
                  </div>
                  <Badge variant="secondary" className="ml-2 shrink-0 tabular-nums">
                    {link.clicks.toLocaleString()} clicks
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateUrl(url: string, maxLen = 60): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > maxLen
      ? display.substring(0, maxLen - 3) + "..."
      : display;
  } catch {
    return url.length > maxLen ? url.substring(0, maxLen - 3) + "..." : url;
  }
}
