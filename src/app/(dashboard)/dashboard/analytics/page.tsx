"use client";

import { useState, useCallback, useMemo } from "react";
import { RefreshCwIcon } from "lucide-react";
import { format, eachDayOfInterval, subDays, startOfDay, endOfDay } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/analytics/date-range-picker";
import { KpiCards, type KpiData } from "@/components/analytics/kpi-cards";
import {
  TimeSeriesChart,
  type TimeSeriesPoint,
  type MetricKey,
} from "@/components/analytics/time-series-chart";
import {
  PlatformComparison,
  type PlatformMetrics,
} from "@/components/analytics/platform-comparison";

import { useWorkspace } from "@/hooks/use-workspace";
// import { trpc } from "@/lib/trpc/client";

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

function generateTimeSeriesData(
  start: Date,
  end: Date,
): TimeSeriesPoint[] {
  const days = eachDayOfInterval({ start, end });
  return days.map((day) => ({
    date: format(day, "yyyy-MM-dd"),
    spend: Math.round(200 + Math.random() * 800),
    clicks: Math.round(100 + Math.random() * 500),
    impressions: Math.round(5000 + Math.random() * 20000),
    conversions: Math.round(5 + Math.random() * 50),
  }));
}

const MOCK_KPI: KpiData = {
  totalSpend: 12450.32,
  conversions: 342,
  roas: 4.23,
  cpc: 1.87,
  ctr: 3.42,
  sessions: 18923,
  leads: 127,
};

const MOCK_PREVIOUS_KPI: KpiData = {
  totalSpend: 11200.5,
  conversions: 298,
  roas: 3.89,
  cpc: 2.01,
  ctr: 3.12,
  sessions: 16540,
  leads: 105,
};

const MOCK_GOOGLE: PlatformMetrics = {
  spend: 7200,
  clicks: 4300,
  conversions: 195,
  roas: 4.8,
};

const MOCK_META: PlatformMetrics = {
  spend: 5250,
  clicks: 3100,
  conversions: 147,
  roas: 3.6,
};

interface Campaign {
  id: string;
  name: string;
  platform: "google" | "meta";
  spend: number;
  conversions: number;
  roas: number;
  status: "active" | "paused" | "ended";
}

const MOCK_CAMPAIGNS: Campaign[] = [
  { id: "1", name: "Brand Search IT", platform: "google", spend: 2340, conversions: 89, roas: 6.2, status: "active" },
  { id: "2", name: "Remarketing Q1", platform: "meta", spend: 1850, conversions: 67, roas: 4.5, status: "active" },
  { id: "3", name: "Prospecting Lookalike", platform: "meta", spend: 1620, conversions: 43, roas: 3.1, status: "active" },
  { id: "4", name: "Shopping Feed", platform: "google", spend: 1480, conversions: 52, roas: 5.8, status: "active" },
  { id: "5", name: "Display Awareness", platform: "google", spend: 980, conversions: 18, roas: 1.9, status: "paused" },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { workspace } = useWorkspace();

  // Date range state
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    start: startOfDay(subDays(new Date(), 29)),
    end: endOfDay(new Date()),
  });

  // Active metrics for time series
  const [activeMetrics, setActiveMetrics] = useState<MetricKey[]>([
    "spend",
    "conversions",
  ]);

  const [isSyncing, setIsSyncing] = useState(false);

  // -----------------------------------------------------------------------
  // tRPC queries (mocked for now)
  // -----------------------------------------------------------------------
  // const kpiQuery = trpc.dashboard.getOverviewKpis.useQuery(
  //   { workspaceId: workspace?.id ?? "", start: dateRange.start, end: dateRange.end },
  //   { enabled: !!workspace?.id },
  // );
  // const campaignsQuery = trpc.dashboard.getCampaignList.useQuery(
  //   { workspaceId: workspace?.id ?? "" },
  //   { enabled: !!workspace?.id },
  // );

  const isLoading = false; // Replace with kpiQuery.isLoading when tRPC is connected

  // Generate mock time series based on current date range
  const timeSeriesData = useMemo(
    () => generateTimeSeriesData(dateRange.start, dateRange.end),
    [dateRange.start, dateRange.end],
  );

  const compareTimeSeriesData = useMemo(() => {
    if (!dateRange.compareStart || !dateRange.compareEnd) return undefined;
    return generateTimeSeriesData(dateRange.compareStart, dateRange.compareEnd);
  }, [dateRange.compareStart, dateRange.compareEnd]);

  // Handlers
  const handleRangeChange = useCallback((range: DateRangeValue) => {
    setDateRange(range);
  }, []);

  const handleToggleMetric = useCallback((metric: MetricKey) => {
    setActiveMetrics((prev) =>
      prev.includes(metric)
        ? prev.length > 1
          ? prev.filter((m) => m !== metric)
          : prev // Keep at least one metric active
        : [...prev, metric],
    );
  }, []);

  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    // TODO: call tRPC mutation to trigger platform sync
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsSyncing(false);
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Unified view across all advertising platforms.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker
            value={dateRange}
            onRangeChange={handleRangeChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncNow}
            disabled={isSyncing}
          >
            <RefreshCwIcon
              className={`size-4 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* KPI Cards */}
      <KpiCards
        data={MOCK_KPI}
        previousData={MOCK_PREVIOUS_KPI}
        isLoading={isLoading}
      />

      {/* Time Series Chart */}
      <TimeSeriesChart
        data={timeSeriesData}
        compareData={compareTimeSeriesData}
        activeMetrics={activeMetrics}
        onToggleMetric={handleToggleMetric}
        isLoading={isLoading}
      />

      {/* Bottom row: Platform Comparison + Top Campaigns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PlatformComparison
          googleData={MOCK_GOOGLE}
          metaData={MOCK_META}
          isLoading={isLoading}
        />

        {/* Top Campaigns mini-table */}
        <Card>
          <CardHeader>
            <CardTitle>Top Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Campaign</th>
                      <th className="pb-2 pr-4 font-medium">Platform</th>
                      <th className="pb-2 pr-4 text-right font-medium">Spend</th>
                      <th className="pb-2 pr-4 text-right font-medium">Conv.</th>
                      <th className="pb-2 text-right font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_CAMPAIGNS.map((campaign) => (
                      <tr
                        key={campaign.id}
                        className="border-b last:border-b-0"
                      >
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {campaign.name}
                            </span>
                            {campaign.status === "paused" && (
                              <Badge variant="secondary">
                                Paused
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge
                            variant="outline"
                          >
                            {campaign.platform === "google"
                              ? "Google"
                              : "Meta"}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {new Intl.NumberFormat("it-IT", {
                            style: "currency",
                            currency: "EUR",
                            maximumFractionDigits: 0,
                          }).format(campaign.spend)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {campaign.conversions}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {campaign.roas.toFixed(1)}x
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
