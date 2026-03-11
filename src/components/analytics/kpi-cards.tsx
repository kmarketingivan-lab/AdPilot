"use client";

import {
  DollarSignIcon,
  TargetIcon,
  TrendingUpIcon,
  MousePointerClickIcon,
  PercentIcon,
  ActivityIcon,
  UsersIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KpiData {
  totalSpend: number;
  conversions: number;
  roas: number;
  cpc: number;
  ctr: number;
  sessions: number;
  leads: number;
}

interface KpiCardsProps {
  data?: KpiData | null;
  previousData?: KpiData | null;
  isLoading: boolean;
}

interface KpiDefinition {
  key: keyof KpiData;
  label: string;
  icon: LucideIcon;
  format: (v: number) => string;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function formatNumber(v: number): string {
  return new Intl.NumberFormat("it-IT").format(v);
}

function formatPercent(v: number): string {
  return `${v.toFixed(2)}%`;
}

function formatDecimal(v: number): string {
  return `${v.toFixed(2)}x`;
}

// ---------------------------------------------------------------------------
// KPI definitions
// ---------------------------------------------------------------------------

const KPI_DEFS: KpiDefinition[] = [
  { key: "totalSpend", label: "Total Spend", icon: DollarSignIcon, format: formatCurrency },
  { key: "conversions", label: "Conversions", icon: TargetIcon, format: formatNumber },
  { key: "roas", label: "ROAS", icon: TrendingUpIcon, format: formatDecimal },
  { key: "cpc", label: "CPC", icon: MousePointerClickIcon, format: formatCurrency },
  { key: "ctr", label: "CTR", icon: PercentIcon, format: formatPercent },
  { key: "sessions", label: "Sessions", icon: ActivityIcon, format: formatNumber },
  { key: "leads", label: "Leads", icon: UsersIcon, format: formatNumber },
];

// ---------------------------------------------------------------------------
// Change badge
// ---------------------------------------------------------------------------

function ChangeBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;

  const pctChange = ((current - previous) / Math.abs(previous)) * 100;
  const isPositive = pctChange >= 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
        isPositive
          ? "bg-green-500/10 text-green-600 dark:text-green-400"
          : "bg-red-500/10 text-red-600 dark:text-red-400",
      )}
    >
      {isPositive ? (
        <ArrowUpIcon className="size-3" />
      ) : (
        <ArrowDownIcon className="size-3" />
      )}
      {Math.abs(pctChange).toFixed(1)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------

function KpiCardSkeleton() {
  return (
    <Card size="sm">
      <CardHeader>
        <Skeleton className="h-4 w-20" />
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-5 w-14" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KpiCards({ data, previousData, isLoading }: KpiCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {KPI_DEFS.map((def) => (
          <KpiCardSkeleton key={def.key} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {KPI_DEFS.map((def) => {
        const Icon = def.icon;
        const value = data?.[def.key] ?? 0;
        const prevValue = previousData?.[def.key];

        return (
          <Card key={def.key} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className="size-3.5" />
                {def.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-2">
              <span className="text-xl font-semibold tracking-tight">
                {def.format(value)}
              </span>
              {prevValue !== undefined && prevValue !== null && (
                <ChangeBadge current={value} previous={prevValue} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
