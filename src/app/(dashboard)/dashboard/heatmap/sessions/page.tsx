"use client";

import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MonitorIcon,
  SmartphoneIcon,
  TabletIcon,
  PlayCircleIcon,
  MousePointerClickIcon,
  AlertTriangleIcon,
  GlobeIcon,
  ClockIcon,
  FilterIcon,
  XIcon,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

import dynamic from "next/dynamic";
import type { ReplayEvent } from "@/components/heatmap/session-player";

const SessionPlayer = dynamic(
  () => import("@/components/heatmap/session-player").then((m) => ({ default: m.SessionPlayer })),
  { loading: () => <Skeleton className="h-96" /> },
);
import { useWorkspace } from "@/hooks/use-workspace";
// import { trpc } from "@/lib/trpc/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionRow {
  id: string;
  visitorId: string;
  userAgent: string | null;
  screenWidth: number;
  screenHeight: number;
  pageUrl: string;
  duration: number | null; // seconds
  startedAt: Date;
  pagesVisited: string[];
  clicksCount: number;
  rageClicksCount: number;
  browser: string;
  device: "desktop" | "tablet" | "mobile";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string | null): { browser: string; device: "desktop" | "tablet" | "mobile" } {
  if (!ua) return { browser: "Unknown", device: "desktop" };

  let browser = "Other";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";

  let device: "desktop" | "tablet" | "mobile" = "desktop";
  if (/Mobi|Android.*Mobile|iPhone/i.test(ua)) device = "mobile";
  else if (/Tablet|iPad/i.test(ua)) device = "tablet";

  return { browser, device };
}

function getDeviceIcon(device: "desktop" | "tablet" | "mobile") {
  switch (device) {
    case "desktop":
      return MonitorIcon;
    case "tablet":
      return TabletIcon;
    case "mobile":
      return SmartphoneIcon;
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function generateMockSessions(): SessionRow[] {
  const browsers = ["Chrome", "Firefox", "Safari", "Edge"];
  const devices: Array<"desktop" | "tablet" | "mobile"> = ["desktop", "mobile", "tablet"];
  const pages = ["/", "/pricing", "/features", "/about", "/contact", "/blog", "/signup", "/demo"];

  return Array.from({ length: 47 }, (_, i) => {
    const device = devices[i % devices.length];
    const screenWidth = device === "desktop" ? 1920 : device === "tablet" ? 1024 : 390;
    const screenHeight = device === "desktop" ? 1080 : device === "tablet" ? 768 : 844;
    const numPages = 1 + Math.floor(Math.random() * 5);
    const visitedPages = Array.from(
      { length: numPages },
      () => pages[Math.floor(Math.random() * pages.length)],
    );
    const clicks = Math.floor(Math.random() * 30) + 1;
    const rageClicks = Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 1 : 0;

    return {
      id: `session-${i + 1}`,
      visitorId: `visitor-${Math.floor(Math.random() * 200) + 1}`,
      userAgent: null,
      screenWidth,
      screenHeight,
      pageUrl: visitedPages[0],
      duration: Math.floor(Math.random() * 600) + 10,
      startedAt: subDays(new Date(), Math.floor(Math.random() * 30)),
      pagesVisited: [...new Set(visitedPages)],
      clicksCount: clicks,
      rageClicksCount: rageClicks,
      browser: browsers[i % browsers.length],
      device,
    };
  }).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

const MOCK_SESSIONS = generateMockSessions();

// Generate mock replay events for a session
function generateMockReplayEvents(session: SessionRow): ReplayEvent[] {
  const baseTime = session.startedAt.getTime();
  const duration = (session.duration ?? 30) * 1000;
  const events: ReplayEvent[] = [];

  // Full snapshot at start
  events.push({
    type: 2,
    data: {
      html: `<!DOCTYPE html><html><head><title>Replay</title><style>body{font-family:system-ui;padding:40px;background:#fafafa}h1{color:#333}p{color:#666;line-height:1.6}.btn{background:#2563eb;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:16px;margin-top:20px}.container{max-width:800px;margin:0 auto;background:white;padding:40px;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}</style></head><body><div class="container"><h1>Welcome to Our Platform</h1><p>This is a replayed session showing user interaction with the page.</p><p>The visitor browsed ${session.pagesVisited.length} page(s) and made ${session.clicksCount} click(s).</p><button class="btn">Get Started</button></div></body></html>`,
    },
    timestamp: baseTime,
  });

  // Generate interaction events
  const numEvents = Math.min(session.clicksCount * 3, 50);
  for (let i = 0; i < numEvents; i++) {
    const t = baseTime + (duration * (i + 1)) / (numEvents + 1);
    const kind = Math.random();

    if (kind < 0.3) {
      // Click
      events.push({
        type: 3,
        data: {
          source: 2,
          type: 2,
          x: Math.floor(Math.random() * session.screenWidth * 0.8) + 50,
          y: Math.floor(Math.random() * session.screenHeight * 0.6) + 50,
          selector: ".btn",
        },
        timestamp: t,
      });
    } else if (kind < 0.6) {
      // Mouse move
      events.push({
        type: 3,
        data: {
          source: 1,
          positions: [
            {
              x: Math.floor(Math.random() * session.screenWidth),
              y: Math.floor(Math.random() * session.screenHeight),
            },
          ],
        },
        timestamp: t,
      });
    } else {
      // Scroll
      events.push({
        type: 3,
        data: {
          source: 3,
          x: 0,
          y: Math.floor(Math.random() * 2000),
        },
        timestamp: t,
      });
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const columnHelper = createColumnHelper<SessionRow>();

const columns = [
  columnHelper.accessor("startedAt", {
    header: "Date",
    cell: (info) => (
      <span className="whitespace-nowrap text-sm tabular-nums">
        {format(info.getValue(), "MMM d, HH:mm")}
      </span>
    ),
  }),

  columnHelper.accessor("duration", {
    header: "Duration",
    cell: (info) => (
      <span className="flex items-center gap-1 tabular-nums text-sm">
        <ClockIcon className="size-3.5 text-muted-foreground" />
        {formatDuration(info.getValue())}
      </span>
    ),
  }),

  columnHelper.accessor("pagesVisited", {
    header: "Pages",
    cell: (info) => {
      const pages = info.getValue();
      return (
        <div className="flex items-center gap-1">
          <GlobeIcon className="size-3.5 text-muted-foreground" />
          <span className="text-sm">{pages.length} page{pages.length !== 1 ? "s" : ""}</span>
        </div>
      );
    },
    enableSorting: false,
  }),

  columnHelper.accessor("device", {
    header: "Device",
    cell: (info) => {
      const device = info.getValue();
      const Icon = getDeviceIcon(device);
      return (
        <Badge variant="secondary" className="gap-1 text-xs capitalize">
          <Icon className="size-3" />
          {device}
        </Badge>
      );
    },
  }),

  columnHelper.accessor("browser", {
    header: "Browser",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">{info.getValue()}</span>
    ),
  }),

  columnHelper.accessor("clicksCount", {
    header: "Clicks",
    cell: (info) => (
      <span className="flex items-center gap-1 tabular-nums text-sm">
        <MousePointerClickIcon className="size-3.5 text-blue-500" />
        {info.getValue()}
      </span>
    ),
  }),

  columnHelper.accessor("rageClicksCount", {
    header: "Rage Clicks",
    cell: (info) => {
      const count = info.getValue();
      if (count === 0)
        return <span className="text-sm text-muted-foreground">-</span>;
      return (
        <Badge variant="destructive" className="gap-1 text-xs">
          <AlertTriangleIcon className="size-3" />
          {count}
        </Badge>
      );
    },
  }),

  columnHelper.display({
    id: "actions",
    header: "",
    cell: () => (
      <Button variant="ghost" size="icon-sm">
        <PlayCircleIcon className="size-4" />
      </Button>
    ),
  }),
];

// ---------------------------------------------------------------------------
// Sort header
// ---------------------------------------------------------------------------

function SortHeader({
  label,
  column,
}: {
  label: string;
  column: {
    getIsSorted: () => false | "asc" | "desc";
    toggleSorting: () => void;
  };
}) {
  const sorted = column.getIsSorted();
  const Icon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting()}
      className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
      <Icon
        className={`size-3 ${
          sorted
            ? "text-foreground"
            : "text-muted-foreground/50 group-hover:text-muted-foreground"
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SessionsPage() {
  const { workspace } = useWorkspace();

  // Filters
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [minDuration, setMinDuration] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Table state
  const [sorting, setSorting] = useState<SortingState>([
    { id: "startedAt", desc: true },
  ]);

  // Session replay dialog
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(
    null,
  );
  const [replayEvents, setReplayEvents] = useState<ReplayEvent[]>([]);

  // TODO: Replace with tRPC query
  // const sessionsQuery = trpc.heatmap.listSessions.useQuery(
  //   { workspaceId: workspace?.id ?? "", siteId: "..." },
  //   { enabled: !!workspace?.id },
  // );
  const isLoading = false;

  // Apply filters
  const filteredData = useMemo(() => {
    let data = MOCK_SESSIONS;

    if (deviceFilter !== "all") {
      data = data.filter((s) => s.device === deviceFilter);
    }

    if (minDuration) {
      const minSec = parseInt(minDuration, 10);
      if (!isNaN(minSec)) {
        data = data.filter((s) => (s.duration ?? 0) >= minSec);
      }
    }

    if (dateFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      switch (dateFilter) {
        case "today":
          cutoff = startOfDay(now);
          break;
        case "7d":
          cutoff = startOfDay(subDays(now, 7));
          break;
        case "30d":
          cutoff = startOfDay(subDays(now, 30));
          break;
        default:
          cutoff = new Date(0);
      }
      data = data.filter((s) => s.startedAt >= cutoff);
    }

    return data;
  }, [deviceFilter, minDuration, dateFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  const handleRowClick = useCallback((session: SessionRow) => {
    setSelectedSession(session);
    // Generate mock replay events for the selected session
    setReplayEvents(generateMockReplayEvents(session));
  }, []);

  const hasActiveFilters =
    deviceFilter !== "all" || minDuration !== "" || dateFilter !== "all";

  const clearFilters = useCallback(() => {
    setDeviceFilter("all");
    setMinDuration("");
    setDateFilter("all");
  }, []);

  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Session Recordings
        </h1>
        <p className="text-sm text-muted-foreground">
          Watch how visitors interact with your site. Click a session to replay.
        </p>
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <FilterIcon className="size-4" />
          Filters
        </div>

        <Select
          value={dateFilter}
          onValueChange={(v) => { if (v) setDateFilter(v); }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={deviceFilter}
          onValueChange={(v) => { if (v) setDeviceFilter(v); }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Device" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All devices</SelectItem>
            <SelectItem value="desktop">Desktop</SelectItem>
            <SelectItem value="tablet">Tablet</SelectItem>
            <SelectItem value="mobile">Mobile</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            placeholder="Min duration (s)"
            value={minDuration}
            onChange={(e) => setMinDuration(e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon className="size-3.5" />
            Clear
          </Button>
        )}

        <div className="ml-auto text-sm text-muted-foreground">
          {filteredData.length} session{filteredData.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filteredData.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <PlayCircleIcon className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No sessions found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Try adjusting your filters to see more results."
                  : "Session recordings will appear here once visitors start interacting with your tracked site."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="border-b border-border bg-muted/30"
                  >
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="whitespace-nowrap px-4 py-2.5 text-left"
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <SortHeader
                            label={
                              flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              ) as string
                            }
                            column={header.column}
                          />
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-muted/20"
                    onClick={() => handleRowClick(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="whitespace-nowrap px-4 py-2.5 text-sm"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {currentPage + 1} of {pageCount}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronsLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="px-3 text-sm tabular-nums text-muted-foreground">
                  {currentPage + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => table.setPageIndex(pageCount - 1)}
                  disabled={!table.getCanNextPage()}
                >
                  <ChevronsRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Session Replay Dialog */}
      <Dialog
        open={!!selectedSession}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSession(null);
            setReplayEvents([]);
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Session Replay
              {selectedSession && (
                <>
                  <Badge variant="secondary" className="text-xs">
                    {selectedSession.device}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {selectedSession.browser}
                  </Badge>
                  <Badge variant="outline" className="tabular-nums text-xs">
                    {formatDuration(selectedSession.duration)}
                  </Badge>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedSession && replayEvents.length > 0 && (
            <div className="mt-2">
              <SessionPlayer events={replayEvents} />

              {/* Session details */}
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Pages visited</p>
                  <p className="mt-1 text-sm font-medium">
                    {selectedSession.pagesVisited.length}
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {selectedSession.pagesVisited.slice(0, 3).map((page) => (
                      <p
                        key={page}
                        className="truncate text-xs text-muted-foreground"
                      >
                        {page}
                      </p>
                    ))}
                    {selectedSession.pagesVisited.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{selectedSession.pagesVisited.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Resolution</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {selectedSession.screenWidth}x{selectedSession.screenHeight}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Clicks</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {selectedSession.clicksCount}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Rage clicks</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {selectedSession.rageClicksCount > 0 ? (
                      <span className="text-destructive">
                        {selectedSession.rageClicksCount}
                      </span>
                    ) : (
                      "0"
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
