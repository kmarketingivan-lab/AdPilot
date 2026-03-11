"use client";

import { useState, useCallback, useEffect } from "react";
import {
  PlusIcon,
  CopyIcon,
  CheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  RefreshCwIcon,
  GlobeIcon,
  MousePointerClickIcon,
  ArrowDownIcon,
  MoveIcon,
  ShieldIcon,
} from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { DateRangePicker, type DateRangeValue } from "@/components/analytics/date-range-picker";
import { ClickHeatmap } from "@/components/heatmap/click-heatmap";
import { ScrollHeatmap } from "@/components/heatmap/scroll-heatmap";
import { MoveHeatmap } from "@/components/heatmap/move-heatmap";
import { PrivacySettings } from "@/components/heatmap/privacy-settings";

// ─── Page ──────────────────────────────────────────────────────────────────

export default function HeatmapPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedPage, setSelectedPage] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRangeValue | undefined>();

  const utils = trpc.useUtils();

  // ── Queries ────────────────────────────────────────────────────────────

  const sitesQuery = trpc.heatmap.getSetup.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  // Auto-select first site when data loads
  useEffect(() => {
    if (sitesQuery.data && sitesQuery.data.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sitesQuery.data[0].id);
    }
  }, [sitesQuery.data, selectedSiteId]);

  const activeSiteId = selectedSiteId || sitesQuery.data?.[0]?.id || "";

  const pagesQuery = trpc.heatmap.getPages.useQuery(
    { workspaceId, siteId: activeSiteId },
    { enabled: !!workspaceId && !!activeSiteId }
  );

  const verifyQuery = trpc.heatmap.verifyInstallation.useQuery(
    { workspaceId, siteId: activeSiteId },
    { enabled: !!workspaceId && !!activeSiteId, refetchInterval: 30_000 }
  );

  // ── Mutations ──────────────────────────────────────────────────────────

  const addSiteMutation = trpc.heatmap.addSite.useMutation({
    onSuccess: (data) => {
      setDialogOpen(false);
      setSelectedSiteId(data.id);
      utils.heatmap.getSetup.invalidate();
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleAddSite = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const domain = formData.get("domain") as string;
      if (domain) {
        addSiteMutation.mutate({ workspaceId, domain });
      }
    },
    [workspaceId, addSiteMutation]
  );

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────

  const sites = sitesQuery.data ?? [];
  const activeSite = sites.find((s) => s.id === activeSiteId);
  const snippet = activeSite
    ? `<script src="https://app.adpilot.com/tracking.js" data-id="${activeSite.trackingId}"></script>`
    : "";

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Heatmaps & Session Recording
          </h1>
          <p className="text-sm text-muted-foreground">
            Understand how visitors interact with your site.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button>
                <PlusIcon className="size-4" />
                Add Site
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Website</DialogTitle>
              <DialogDescription>
                Enter the domain you want to track.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddSite} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  name="domain"
                  placeholder="example.com"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addSiteMutation.isPending}>
                  {addSiteMutation.isPending ? "Adding..." : "Add Site"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Loading state */}
      {sitesQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full max-w-xs" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {/* Empty state */}
      {!sitesQuery.isLoading && sites.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12">
          <GlobeIcon className="size-12 text-muted-foreground/50" />
          <div className="text-center">
            <p className="text-lg font-medium">No sites tracked yet</p>
            <p className="text-sm text-muted-foreground">
              Add a website to start collecting heatmap data.
            </p>
          </div>
        </div>
      )}

      {/* Site content */}
      {sites.length > 0 && (
        <>
          {/* Site selector */}
          {sites.length > 1 && (
            <Select value={activeSiteId} onValueChange={(v) => setSelectedSiteId(v ?? "")}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.domain} ({s.sessionCount} sessions)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Setup / Snippet */}
          {activeSite && (
            <div className="rounded-lg border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-medium">Installation Snippet</h3>
                    {verifyQuery.data?.verified ? (
                      <Badge className="bg-green-100 text-green-700 border-transparent dark:bg-green-900/40 dark:text-green-300">
                        <CheckCircleIcon className="size-3 mr-1" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <XCircleIcon className="size-3 mr-1" />
                        Not verified
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add this code before the closing{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      &lt;/body&gt;
                    </code>{" "}
                    tag of your website.
                  </p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                      <code>{snippet}</code>
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-2 top-2"
                      onClick={() => handleCopy(snippet, "snippet")}
                    >
                      {copied === "snippet" ? (
                        <CheckIcon className="size-3.5" />
                      ) : (
                        <CopyIcon className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => utils.heatmap.verifyInstallation.invalidate()}
                  >
                    <RefreshCwIcon className="size-3.5" />
                    Check
                  </Button>
                </div>
              </div>

              {/* Tracking ID */}
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <span>Tracking ID:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  {activeSite.trackingId}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    handleCopy(activeSite.trackingId, "trackingId")
                  }
                >
                  {copied === "trackingId" ? (
                    <CheckIcon className="size-3" />
                  ) : (
                    <CopyIcon className="size-3" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Tracked pages */}
          {pagesQuery.data && pagesQuery.data.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-sm text-muted-foreground">Page:</Label>
              <Select value={selectedPage} onValueChange={(v) => setSelectedPage(v ?? "")}>
                <SelectTrigger className="w-[320px]">
                  <SelectValue placeholder="All pages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All pages</SelectItem>
                  {pagesQuery.data.map((url) => (
                    <SelectItem key={url} value={url}>
                      {url}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DateRangePicker
                value={dateRange}
                onRangeChange={setDateRange}
              />
            </div>
          )}

          {/* Heatmap tabs */}
          {activeSiteId && (
            <Tabs defaultValue="clicks">
              <TabsList>
                <TabsTrigger value="clicks">
                  <MousePointerClickIcon className="size-4" />
                  Clicks
                </TabsTrigger>
                <TabsTrigger value="scroll">
                  <ArrowDownIcon className="size-4" />
                  Scroll
                </TabsTrigger>
                <TabsTrigger value="move">
                  <MoveIcon className="size-4" />
                  Movement
                </TabsTrigger>
                <TabsTrigger value="privacy">
                  <ShieldIcon className="size-4" />
                  Privacy
                </TabsTrigger>
              </TabsList>

              <TabsContent value="clicks">
                <ClickHeatmap
                  workspaceId={workspaceId}
                  siteId={activeSiteId}
                  pageUrl={selectedPage || undefined}
                  startDate={dateRange?.start}
                  endDate={dateRange?.end}
                />
              </TabsContent>

              <TabsContent value="scroll">
                <ScrollHeatmap
                  workspaceId={workspaceId}
                  siteId={activeSiteId}
                  pageUrl={selectedPage || undefined}
                  startDate={dateRange?.start}
                  endDate={dateRange?.end}
                />
              </TabsContent>

              <TabsContent value="move">
                <MoveHeatmap
                  workspaceId={workspaceId}
                  siteId={activeSiteId}
                  pageUrl={selectedPage || undefined}
                  startDate={dateRange?.start}
                  endDate={dateRange?.end}
                />
              </TabsContent>

              <TabsContent value="privacy">
                <PrivacySettings workspaceId={workspaceId} />
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
    </div>
  );
}
