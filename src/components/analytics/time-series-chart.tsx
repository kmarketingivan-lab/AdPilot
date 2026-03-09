"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimeSeriesPoint {
  date: string; // ISO date string
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

export type MetricKey = "spend" | "clicks" | "impressions" | "conversions";

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  compareData?: TimeSeriesPoint[];
  activeMetrics: MetricKey[];
  onToggleMetric: (metric: MetricKey) => void;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Metric configuration
// ---------------------------------------------------------------------------

const METRIC_CONFIG: Record<
  MetricKey,
  { label: string; color: string; formatter: (v: number) => string }
> = {
  spend: {
    label: "Spend",
    color: "#6366f1", // indigo
    formatter: (v) =>
      new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(v),
  },
  clicks: {
    label: "Clicks",
    color: "#f59e0b", // amber
    formatter: (v) => new Intl.NumberFormat("it-IT").format(v),
  },
  impressions: {
    label: "Impressions",
    color: "#10b981", // emerald
    formatter: (v) => new Intl.NumberFormat("it-IT", { notation: "compact" }).format(v),
  },
  conversions: {
    label: "Conversions",
    color: "#ef4444", // red
    formatter: (v) => new Intl.NumberFormat("it-IT").format(v),
  },
};

const ALL_METRICS: MetricKey[] = ["spend", "clicks", "impressions", "conversions"];

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
  strokeDasharray?: string;
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

  const dateLabel = (() => {
    try {
      return format(parseISO(label), "MMM d, yyyy");
    } catch {
      return label;
    }
  })();

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1.5 font-medium text-foreground">{dateLabel}</p>
      {payload.map((entry) => {
        const baseKey = entry.dataKey.replace("_compare", "") as MetricKey;
        const config = METRIC_CONFIG[baseKey];
        if (!config) return null;
        const isCompare = entry.dataKey.includes("_compare");
        return (
          <div
            key={entry.dataKey}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {config.label}
              {isCompare && (
                <span className="text-xs text-muted-foreground/60">(prev)</span>
              )}
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {config.formatter(entry.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric toggle checkboxes
// ---------------------------------------------------------------------------

function MetricToggle({
  metric,
  active,
  onToggle,
}: {
  metric: MetricKey;
  active: boolean;
  onToggle: () => void;
}) {
  const config = METRIC_CONFIG[metric];
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-sm select-none">
      <input
        type="checkbox"
        checked={active}
        onChange={onToggle}
        className="sr-only"
      />
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded border transition-colors",
          active
            ? "border-transparent"
            : "border-muted-foreground/30 bg-transparent",
        )}
        style={active ? { backgroundColor: config.color } : undefined}
      >
        {active && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="white"
            className="size-3"
          >
            <path
              fillRule="evenodd"
              d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </span>
      <span className={cn(active ? "text-foreground" : "text-muted-foreground")}>
        {config.label}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TimeSeriesChart({
  data,
  compareData,
  activeMetrics,
  onToggleMetric,
  isLoading,
}: TimeSeriesChartProps) {
  // Merge data and compare data into a single series for the chart
  const mergedData = useMemo(() => {
    return data.map((point, i) => {
      const merged: Record<string, string | number> = {
        date: point.date,
      };
      for (const m of ALL_METRICS) {
        merged[m] = point[m];
      }
      if (compareData && compareData[i]) {
        for (const m of ALL_METRICS) {
          merged[`${m}_compare`] = compareData[i][m];
        }
      }
      return merged;
    });
  }, [data, compareData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Performance Over Time</CardTitle>
        <div className="flex flex-wrap gap-4">
          {ALL_METRICS.map((m) => (
            <MetricToggle
              key={m}
              metric={m}
              active={activeMetrics.includes(m)}
              onToggle={() => onToggleMetric(m)}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart
            data={mergedData}
            margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => {
                try {
                  return format(parseISO(v), "MMM d");
                } catch {
                  return v;
                }
              }}
              className="text-xs text-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              className="text-xs text-muted-foreground"
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={(v: number) =>
                new Intl.NumberFormat("it-IT", { notation: "compact" }).format(v)
              }
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
            <Legend content={() => null} />

            {/* Current period lines */}
            {activeMetrics.map((m) => (
              <Line
                key={m}
                type="monotone"
                dataKey={m}
                stroke={METRIC_CONFIG[m].color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}

            {/* Comparison period lines (dashed) */}
            {compareData &&
              activeMetrics.map((m) => (
                <Line
                  key={`${m}_compare`}
                  type="monotone"
                  dataKey={`${m}_compare`}
                  stroke={METRIC_CONFIG[m].color}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  strokeOpacity={0.5}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
