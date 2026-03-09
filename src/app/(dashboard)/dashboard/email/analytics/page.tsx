"use client";

import { useState, useMemo } from "react";
import { subDays, eachDayOfInterval, format } from "date-fns";
import { MailIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import {
  EmailKpiCards,
  EmailTimeSeriesChart,
  ClickHeatmap,
  type EmailKpis,
  type TimeSeriesPoint,
  type LinkClickData,
} from "@/components/email/email-analytics-charts";

import { useWorkspace } from "@/hooks/use-workspace";

// ---------------------------------------------------------------------------
// Mock data (will be replaced with tRPC queries)
// ---------------------------------------------------------------------------

function generateMockTimeSeries(days: number): TimeSeriesPoint[] {
  const end = new Date();
  const start = subDays(end, days - 1);
  return eachDayOfInterval({ start, end }).map((day) => ({
    date: format(day, "yyyy-MM-dd"),
    opens: Math.round(50 + Math.random() * 200),
    clicks: Math.round(10 + Math.random() * 80),
  }));
}

const MOCK_KPIS: EmailKpis = {
  sent: 12480,
  delivered: 12105,
  opened: 4236,
  clicked: 1089,
  bounced: 375,
  unsubscribed: 42,
};

const MOCK_LINKS: LinkClickData[] = [
  { url: "https://example.com/promo", clicks: 423, label: "Main CTA — Shop Now" },
  { url: "https://example.com/blog/post-1", clicks: 287, label: "Blog post link" },
  { url: "https://example.com/pricing", clicks: 189, label: "Pricing page" },
  { url: "https://example.com/about", clicks: 98, label: "About us" },
  { url: "https://example.com/social/instagram", clicks: 56, label: "Instagram profile" },
  { url: "https://example.com/unsubscribe", clicks: 36, label: "Unsubscribe link" },
];

const MOCK_CAMPAIGNS = [
  { id: "1", name: "Welcome Series — Day 1", sent: 3200, openRate: 42.1, clickRate: 12.3, status: "sent" },
  { id: "2", name: "March Newsletter", sent: 5100, openRate: 35.2, clickRate: 8.7, status: "sent" },
  { id: "3", name: "Product Launch", sent: 4180, openRate: 38.9, clickRate: 10.1, status: "sent" },
  { id: "4", name: "Re-engagement", sent: 0, openRate: 0, clickRate: 0, status: "scheduled" },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function EmailAnalyticsPage() {
  const { workspace } = useWorkspace();

  const [dateRangeDays] = useState(30);
  const [isSyncing, setIsSyncing] = useState(false);
  const isLoading = false;

  // Mock time series data
  const timeSeries = useMemo(
    () => generateMockTimeSeries(dateRangeDays),
    [dateRangeDays],
  );

  const handleSync = async () => {
    setIsSyncing(true);
    // TODO: call tRPC mutation to resync SES events
    await new Promise((r) => setTimeout(r, 1500));
    setIsSyncing(false);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Email Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Track performance across all your email campaigns.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
        >
          <RefreshCwIcon
            className={`mr-1.5 size-4 ${isSyncing ? "animate-spin" : ""}`}
          />
          {isSyncing ? "Syncing..." : "Sync Events"}
        </Button>
      </div>

      <Separator />

      {/* KPI Cards */}
      <EmailKpiCards kpis={MOCK_KPIS} isLoading={isLoading} />

      {/* Time Series */}
      <EmailTimeSeriesChart data={timeSeries} isLoading={isLoading} />

      {/* Bottom row: Click Heatmap + Campaign Table */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ClickHeatmap links={MOCK_LINKS} isLoading={isLoading} />

        {/* Recent Campaigns Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailIcon className="size-4" />
              Recent Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Campaign</th>
                    <th className="pb-2 pr-4 text-right font-medium">Sent</th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Open Rate
                    </th>
                    <th className="pb-2 text-right font-medium">Click Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_CAMPAIGNS.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-b last:border-b-0"
                    >
                      <td className="py-2.5 pr-4">
                        <span className="font-medium">{campaign.name}</span>
                        {campaign.status === "scheduled" && (
                          <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            Scheduled
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {campaign.sent.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {campaign.openRate > 0
                          ? `${campaign.openRate.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {campaign.clickRate > 0
                          ? `${campaign.clickRate.toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
