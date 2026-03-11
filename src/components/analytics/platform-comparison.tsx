"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformMetrics {
  spend: number;
  clicks: number;
  conversions: number;
  roas: number;
}

interface PlatformComparisonProps {
  googleData?: PlatformMetrics | null;
  metaData?: PlatformMetrics | null;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const GOOGLE_COLOR = "#4285f4";
const META_COLOR = "#8b5cf6";

// ---------------------------------------------------------------------------
// Metric formatting
// ---------------------------------------------------------------------------

const METRIC_FORMAT: Record<string, (v: number) => string> = {
  Spend: (v) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(v),
  Clicks: (v) => new Intl.NumberFormat("it-IT").format(v),
  Conversions: (v) => new Intl.NumberFormat("it-IT").format(v),
  ROAS: (v) => `${v.toFixed(2)}x`,
};

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;

  const formatter = METRIC_FORMAT[label] ?? ((v: number) => String(v));

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          className="flex items-center justify-between gap-4"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {formatter(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PlatformComparison({
  googleData,
  metaData,
  isLoading,
}: PlatformComparisonProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Platform Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = [
    {
      metric: "Spend",
      google: googleData?.spend ?? 0,
      meta: metaData?.spend ?? 0,
    },
    {
      metric: "Clicks",
      google: googleData?.clicks ?? 0,
      meta: metaData?.clicks ?? 0,
    },
    {
      metric: "Conversions",
      google: googleData?.conversions ?? 0,
      meta: metaData?.conversions ?? 0,
    },
    {
      metric: "ROAS",
      google: googleData?.roas ?? 0,
      meta: metaData?.roas ?? 0,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              className="stroke-muted"
            />
            <XAxis
              type="number"
              className="text-xs text-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                new Intl.NumberFormat("it-IT", { notation: "compact" }).format(v)
              }
            />
            <YAxis
              type="category"
              dataKey="metric"
              className="text-xs text-muted-foreground"
              tickLine={false}
              axisLine={false}
              width={90}
            />
            <Tooltip
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  payload={payload as unknown as TooltipPayloadEntry[]}
                  label={label as string}
                />
              )}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ paddingBottom: 12, fontSize: 13 }}
            />
            <Bar
              dataKey="google"
              name="Google Ads"
              fill={GOOGLE_COLOR}
              radius={[0, 4, 4, 0]}
              barSize={16}
            />
            <Bar
              dataKey="meta"
              name="Meta Ads"
              fill={META_COLOR}
              radius={[0, 4, 4, 0]}
              barSize={16}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
