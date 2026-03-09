"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  MousePointerClickIcon,
  BanIcon,
  BellIcon,
} from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

// ── Types ────────────────────────────────────────────────────────────────────

interface RageDeadClicksProps {
  workspaceId: string;
  siteId: string;
  startDate?: Date;
  endDate?: Date;
}

interface ClickRow {
  pageUrl: string;
  element: string;
  clickCount: number;
  type: "rage" | "dead";
  lastSeen: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateUrl(url: string, maxLen = 50): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + "...";
}

function truncateSelector(selector: string, maxLen = 40): string {
  if (selector.length <= maxLen) return selector;
  return selector.slice(0, maxLen - 3) + "...";
}

// ── Click table ──────────────────────────────────────────────────────────────

function ClickTable({
  items,
  isLoading,
  emptyMessage,
}: {
  items: ClickRow[];
  isLoading: boolean;
  emptyMessage: string;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <MousePointerClickIcon className="size-10 mb-2 opacity-30" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Page</th>
            <th className="pb-2 pr-4 font-medium">Element</th>
            <th className="pb-2 pr-4 font-medium text-right">Clicks</th>
            <th className="pb-2 pr-4 font-medium">Type</th>
            <th className="pb-2 font-medium">Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr
              key={`${item.pageUrl}-${item.element}-${i}`}
              className="border-b last:border-0 hover:bg-muted/50"
            >
              <td className="py-2.5 pr-4">
                <span className="font-mono text-xs" title={item.pageUrl}>
                  {truncateUrl(item.pageUrl)}
                </span>
              </td>
              <td className="py-2.5 pr-4">
                <code
                  className="rounded bg-muted px-1.5 py-0.5 text-xs"
                  title={item.element}
                >
                  {truncateSelector(item.element)}
                </code>
              </td>
              <td className="py-2.5 pr-4 text-right">
                <span className="font-semibold tabular-nums">
                  {item.clickCount}
                </span>
              </td>
              <td className="py-2.5 pr-4">
                {item.type === "rage" ? (
                  <Badge className="bg-red-100 text-red-700 border-transparent dark:bg-red-900/40 dark:text-red-300">
                    <AlertTriangleIcon className="size-3 mr-1" />
                    Rage
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-700 border-transparent dark:bg-amber-900/40 dark:text-amber-300">
                    <BanIcon className="size-3 mr-1" />
                    Dead
                  </Badge>
                )}
              </td>
              <td className="py-2.5 text-muted-foreground text-xs">
                {formatDate(item.lastSeen)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function RageDeadClicks({
  workspaceId,
  siteId,
  startDate,
  endDate,
}: RageDeadClicksProps) {
  const [alertThreshold, setAlertThreshold] = useState(10);

  const rageQuery = trpc.heatmap.getRageClicks.useQuery(
    { workspaceId, siteId, startDate, endDate },
    { enabled: !!workspaceId && !!siteId }
  );

  const deadQuery = trpc.heatmap.getDeadClicks.useQuery(
    { workspaceId, siteId, startDate, endDate },
    { enabled: !!workspaceId && !!siteId }
  );

  const alertsQuery = trpc.heatmap.getRageClickAlerts.useQuery(
    { workspaceId, siteId, threshold: alertThreshold },
    { enabled: !!workspaceId && !!siteId }
  );

  const rageItems: ClickRow[] = rageQuery.data?.items ?? [];
  const deadItems: ClickRow[] = deadQuery.data?.items ?? [];
  const allItems = [...rageItems, ...deadItems].sort(
    (a, b) => b.clickCount - a.clickCount
  );
  const alerts = alertsQuery.data?.alerts ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rage Click Hotspots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-red-600">
                {rageQuery.data?.total ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">
                unique elements
              </span>
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dead Click Hotspots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-amber-600">
                {deadQuery.data?.total ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">
                unique elements
              </span>
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <BellIcon className="size-3.5" />
              Active Alerts (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {alerts.length}
              </span>
              <span className="text-xs text-muted-foreground">
                pages above threshold
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert threshold config */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <BellIcon className="size-4 text-muted-foreground shrink-0" />
        <Label
          htmlFor="alert-threshold"
          className="text-sm text-muted-foreground whitespace-nowrap"
        >
          Alert when rage clicks exceed
        </Label>
        <Input
          id="alert-threshold"
          type="number"
          min={1}
          max={1000}
          value={alertThreshold}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 1) setAlertThreshold(v);
          }}
          className="w-20 h-8"
        />
        <span className="text-sm text-muted-foreground">
          per page in 24 hours
        </span>
      </div>

      {/* Alert list */}
      {alerts.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 p-4">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3 flex items-center gap-1.5">
            <AlertTriangleIcon className="size-4" />
            Pages Exceeding Threshold
          </h3>
          <div className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <div
                key={alert.pageUrl}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-mono text-xs text-red-800 dark:text-red-300">
                  {truncateUrl(alert.pageUrl, 60)}
                </span>
                <Badge className="bg-red-200 text-red-800 border-transparent dark:bg-red-900 dark:text-red-200">
                  {alert.rageClickCount} rage clicks
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs: All / Rage / Dead */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            All ({allItems.length})
          </TabsTrigger>
          <TabsTrigger value="rage">
            <AlertTriangleIcon className="size-3.5" />
            Rage ({rageItems.length})
          </TabsTrigger>
          <TabsTrigger value="dead">
            <BanIcon className="size-3.5" />
            Dead ({deadItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <ClickTable
            items={allItems}
            isLoading={rageQuery.isLoading || deadQuery.isLoading}
            emptyMessage="No rage or dead clicks detected yet."
          />
        </TabsContent>

        <TabsContent value="rage">
          <ClickTable
            items={rageItems}
            isLoading={rageQuery.isLoading}
            emptyMessage="No rage clicks detected. Users seem happy!"
          />
        </TabsContent>

        <TabsContent value="dead">
          <ClickTable
            items={deadItems}
            isLoading={deadQuery.isLoading}
            emptyMessage="No dead clicks detected."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
