"use client";

import { useState, useEffect } from "react";
import { AlertTriangleIcon } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";

import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { DateRangePicker, type DateRangeValue } from "@/components/analytics/date-range-picker";
import { RageDeadClicks } from "@/components/heatmap/rage-dead-clicks";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RageClicksPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue | undefined>();

  const sitesQuery = trpc.heatmap.getSetup.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  // Auto-select first site
  useEffect(() => {
    if (sitesQuery.data && sitesQuery.data.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sitesQuery.data[0].id);
    }
  }, [sitesQuery.data, selectedSiteId]);

  const activeSiteId = selectedSiteId || sitesQuery.data?.[0]?.id || "";
  const sites = sitesQuery.data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <AlertTriangleIcon className="size-6 text-red-500" />
          Rage & Dead Clicks
        </h1>
        <p className="text-sm text-muted-foreground">
          Identify frustration points where users rage-click or click on
          non-interactive elements.
        </p>
      </div>

      {/* Loading */}
      {sitesQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full max-w-xs" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {/* Empty */}
      {!sitesQuery.isLoading && sites.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12">
          <AlertTriangleIcon className="size-12 text-muted-foreground/50" />
          <div className="text-center">
            <p className="text-lg font-medium">No sites tracked</p>
            <p className="text-sm text-muted-foreground">
              Add a website on the Heatmaps page to start detecting rage clicks.
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {sites.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {sites.length > 1 && (
              <Select
                value={activeSiteId}
                onValueChange={(v) => setSelectedSiteId(v ?? "")}
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Label className="text-sm text-muted-foreground">Period:</Label>
            <DateRangePicker
              value={dateRange}
              onRangeChange={setDateRange}
            />
          </div>

          {/* Rage/Dead clicks component */}
          {activeSiteId && (
            <RageDeadClicks
              workspaceId={workspaceId}
              siteId={activeSiteId}
              startDate={dateRange?.start}
              endDate={dateRange?.end}
            />
          )}
        </>
      )}
    </div>
  );
}
