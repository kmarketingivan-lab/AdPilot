"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrophyIcon,
  TrendingDownIcon,
  AlertTriangleIcon,
  BarChart3Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Types ----------

export interface CreativeMetric {
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  creativeId: string;
}

export interface CreativeVariant {
  id: string;
  headline: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "WINNER" | "LOSER";
  metrics: CreativeMetric[];
}

interface PerformanceTrackerProps {
  variants: CreativeVariant[];
  onDeclareWinner?: (variantId: string) => void;
  className?: string;
}

// ---------- Aggregation helpers ----------

interface AggregatedMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cpa: number;
}

function aggregateMetrics(metrics: CreativeMetric[]): AggregatedMetrics {
  const impressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
  const clicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
  const conversions = metrics.reduce((sum, m) => sum + m.conversions, 0);
  const spend = metrics.reduce((sum, m) => sum + m.spend, 0);

  return {
    impressions,
    clicks,
    conversions,
    spend,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
  };
}

// ---------- Statistical significance ----------

type SignificanceLevel = "significant" | "insufficient" | "not_significant";

function evaluateSignificance(
  variants: { aggregated: AggregatedMetrics }[]
): SignificanceLevel {
  if (variants.length < 2) return "insufficient";

  const allHaveEnoughData = variants.every(
    (v) => v.aggregated.impressions >= 1000
  );
  if (!allHaveEnoughData) return "insufficient";

  const ctrs = variants.map((v) => v.aggregated.ctr);
  const maxCtr = Math.max(...ctrs);
  const minCtr = Math.min(...ctrs);

  if (minCtr === 0) return "significant";

  const relativeDiff = ((maxCtr - minCtr) / minCtr) * 100;
  return relativeDiff > 20 ? "significant" : "not_significant";
}

// ---------- Formatting ----------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatPercent(n: number): string {
  return `${n.toFixed(2)}%`;
}

// ---------- Sub-components ----------

function SignificanceBadge({ level }: { level: SignificanceLevel }) {
  switch (level) {
    case "significant":
      return (
        <Badge className="gap-1 border-0 bg-green-500/10 text-green-700 dark:text-green-400">
          <BarChart3Icon className="size-3" />
          Statisticamente significativo
        </Badge>
      );
    case "not_significant":
      return (
        <Badge className="gap-1 border-0 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
          <AlertTriangleIcon className="size-3" />
          Non significativo
        </Badge>
      );
    case "insufficient":
      return (
        <Badge className="gap-1 border-0 bg-gray-500/10 text-gray-700 dark:text-gray-400">
          <AlertTriangleIcon className="size-3" />
          Dati insufficienti
        </Badge>
      );
  }
}

function StatusBadge({
  status,
}: {
  status: CreativeVariant["status"];
}) {
  const config: Record<
    CreativeVariant["status"],
    { label: string; className: string; icon?: React.ReactNode }
  > = {
    DRAFT: {
      label: "Bozza",
      className: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    },
    ACTIVE: {
      label: "Attivo",
      className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    },
    PAUSED: {
      label: "In pausa",
      className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    },
    WINNER: {
      label: "Vincitore",
      className: "bg-green-500/10 text-green-700 dark:text-green-400",
      icon: <TrophyIcon className="size-3" />,
    },
    LOSER: {
      label: "Perdente",
      className: "bg-red-500/10 text-red-700 dark:text-red-400",
      icon: <TrendingDownIcon className="size-3" />,
    },
  };

  const c = config[status];

  return (
    <Badge className={cn("gap-1 border-0 font-medium", c.className)}>
      {c.icon}
      {c.label}
    </Badge>
  );
}

function MetricBar({
  value,
  maxValue,
  color,
}: {
  value: number;
  maxValue: number;
  color: "green" | "red" | "gray" | "blue";
}) {
  const widthPct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  const colorClasses: Record<typeof color, string> = {
    green: "bg-green-500",
    red: "bg-red-500",
    gray: "bg-gray-400",
    blue: "bg-blue-500",
  };

  return (
    <div className="h-3 w-full rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", colorClasses[color])}
        style={{ width: `${widthPct}%` }}
      />
    </div>
  );
}

// ---------- Main component ----------

export function PerformanceTracker({
  variants,
  onDeclareWinner,
  className,
}: PerformanceTrackerProps) {
  const analyzed = useMemo(() => {
    const items = variants.map((v) => ({
      variant: v,
      aggregated: aggregateMetrics(v.metrics),
    }));

    // Determine best performer by CTR
    let bestId: string | null = null;
    let bestCtr = -1;
    for (const item of items) {
      if (
        item.aggregated.impressions >= 1000 &&
        item.aggregated.ctr > bestCtr
      ) {
        bestCtr = item.aggregated.ctr;
        bestId = item.variant.id;
      }
    }

    const significance = evaluateSignificance(items);

    return { items, bestId, significance };
  }, [variants]);

  const maxImpressions = Math.max(
    ...analyzed.items.map((i) => i.aggregated.impressions),
    1
  );
  const maxCtr = Math.max(
    ...analyzed.items.map((i) => i.aggregated.ctr),
    0.01
  );

  function getBarColor(
    item: (typeof analyzed.items)[number]
  ): "green" | "red" | "gray" {
    if (item.aggregated.impressions < 1000) return "gray";
    if (item.variant.id === analyzed.bestId) return "green";
    return "red";
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <BarChart3Icon className="size-5" />
            Performance A/B Test
          </CardTitle>
          <SignificanceBadge level={analyzed.significance} />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Metrics table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Variante</th>
                <th className="pb-2 pr-4 text-right font-medium">Impressioni</th>
                <th className="pb-2 pr-4 text-right font-medium">Click</th>
                <th className="pb-2 pr-4 text-right font-medium">CTR</th>
                <th className="pb-2 pr-4 text-right font-medium">Conversioni</th>
                <th className="pb-2 pr-4 text-right font-medium">CPA</th>
                <th className="pb-2 pr-4 text-right font-medium">Spesa</th>
                <th className="pb-2 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {analyzed.items.map((item, idx) => {
                const isBest =
                  item.variant.id === analyzed.bestId &&
                  analyzed.significance === "significant";

                return (
                  <tr
                    key={item.variant.id}
                    className={cn(
                      "border-b last:border-0",
                      isBest && "bg-green-500/5"
                    )}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          Variante {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="max-w-48 truncate text-xs text-muted-foreground">
                          {item.variant.headline}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {formatNumber(item.aggregated.impressions)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {formatNumber(item.aggregated.clicks)}
                    </td>
                    <td
                      className={cn(
                        "py-3 pr-4 text-right font-medium tabular-nums",
                        isBest
                          ? "text-green-700 dark:text-green-400"
                          : item.aggregated.impressions < 1000
                            ? "text-muted-foreground"
                            : ""
                      )}
                    >
                      {formatPercent(item.aggregated.ctr)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {formatNumber(item.aggregated.conversions)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {item.aggregated.conversions > 0
                        ? formatCurrency(item.aggregated.cpa)
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {formatCurrency(item.aggregated.spend)}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={item.variant.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bar chart comparison */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">
            Confronto CTR
          </h4>
          <div className="space-y-3">
            {analyzed.items.map((item, idx) => (
              <div key={item.variant.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    Variante {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatPercent(item.aggregated.ctr)}
                  </span>
                </div>
                <MetricBar
                  value={item.aggregated.ctr}
                  maxValue={maxCtr}
                  color={getBarColor(item)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Impressions comparison */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">
            Confronto Impressioni
          </h4>
          <div className="space-y-3">
            {analyzed.items.map((item, idx) => (
              <div key={item.variant.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    Variante {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(item.aggregated.impressions)}
                  </span>
                </div>
                <MetricBar
                  value={item.aggregated.impressions}
                  maxValue={maxImpressions}
                  color="blue"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Declare winner action */}
        {analyzed.significance === "significant" &&
          analyzed.bestId &&
          !variants.some((v) => v.status === "WINNER") && (
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <div className="flex items-center gap-2">
                <TrophyIcon className="size-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-medium">
                    Vincitore identificato
                  </p>
                  <p className="text-xs text-muted-foreground">
                    I risultati sono statisticamente significativi. Puoi
                    dichiarare il vincitore.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => onDeclareWinner?.(analyzed.bestId!)}
              >
                <TrophyIcon data-icon="inline-start" />
                Dichiara vincitore
              </Button>
            </div>
          )}

        {/* No data state */}
        {analyzed.items.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nessuna variante da confrontare. Crea almeno due varianti per
            avviare un A/B test.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
