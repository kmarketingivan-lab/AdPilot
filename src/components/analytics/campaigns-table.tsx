"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Megaphone,
} from "lucide-react";
import type { AdsPlatform, CampaignStatus, BudgetType } from "@prisma/client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CampaignRow {
  id: string;
  externalId: string | null;
  name: string;
  platform: AdsPlatform;
  status: CampaignStatus;
  objective: string | null;
  budget: number | null;
  budgetType: BudgetType;
  startDate: string | Date | null;
  endDate: string | Date | null;
  connectionAccountId: string;
  connectionAccountName: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
  roas: number | null;
}

interface CampaignsTableProps {
  data: CampaignRow[];
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Platform & status config
// ---------------------------------------------------------------------------

const PLATFORM_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  GOOGLE_ADS: {
    label: "Google Ads",
    color: "text-blue-600",
    bgColor: "bg-blue-500/10",
  },
  META_ADS: {
    label: "Meta Ads",
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  DRAFT: { label: "Draft", variant: "outline" },
  ACTIVE: { label: "Active", variant: "default" },
  PAUSED: { label: "Paused", variant: "secondary" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  ARCHIVED: { label: "Archived", variant: "outline" },
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPercent(n: number | null): string {
  if (n === null) return "-";
  return `${n.toFixed(2)}%`;
}

function formatRoas(n: number | null): string {
  if (n === null) return "-";
  return `${n.toFixed(2)}x`;
}

// ---------------------------------------------------------------------------
// Google Ads icon (simplified inline SVG)
// ---------------------------------------------------------------------------

function GoogleAdsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.2 15.24l5.42-9.4a4.81 4.81 0 016.59-1.76 4.81 4.81 0 011.76 6.59l-5.42 9.4a4.81 4.81 0 01-6.59 1.76A4.81 4.81 0 013.2 15.24z" />
      <circle cx="17.5" cy="18.5" r="3.5" />
    </svg>
  );
}

function MetaAdsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7h-2.54v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0022 12.06c0-5.53-4.5-10.02-10-10.02z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const columnHelper = createColumnHelper<CampaignRow>();

const columns = [
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => (
      <div className="max-w-[200px] truncate font-medium" title={info.getValue()}>
        {info.getValue()}
      </div>
    ),
    enableHiding: false,
  }),

  columnHelper.accessor("platform", {
    header: "Platform",
    cell: (info) => {
      const platform = info.getValue();
      const config = PLATFORM_CONFIG[platform];
      const Icon = platform === "GOOGLE_ADS" ? GoogleAdsIcon : MetaAdsIcon;
      return (
        <div className="flex items-center gap-1.5">
          <Icon className={`size-3.5 ${config?.color ?? "text-muted-foreground"}`} />
          <Badge variant="secondary" className={`text-xs ${config?.bgColor ?? ""}`}>
            {config?.label ?? platform}
          </Badge>
        </div>
      );
    },
    filterFn: "equals",
  }),

  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const status = info.getValue();
      const config = STATUS_CONFIG[status];
      return (
        <Badge variant={config?.variant ?? "outline"} className="text-xs">
          {config?.label ?? status}
        </Badge>
      );
    },
    filterFn: "equals",
  }),

  columnHelper.accessor("budget", {
    header: "Budget",
    cell: (info) => {
      const row = info.row.original;
      const budget = info.getValue();
      if (budget === null) return <span className="text-muted-foreground">-</span>;
      return (
        <span className="tabular-nums">
          {formatCurrency(budget)}
          <span className="ml-1 text-xs text-muted-foreground">
            /{row.budgetType === "DAILY" ? "day" : "total"}
          </span>
        </span>
      );
    },
  }),

  columnHelper.accessor("impressions", {
    header: "Impressions",
    cell: (info) => (
      <span className="tabular-nums">{formatCompact(info.getValue())}</span>
    ),
  }),

  columnHelper.accessor("clicks", {
    header: "Clicks",
    cell: (info) => (
      <span className="tabular-nums">{formatCompact(info.getValue())}</span>
    ),
  }),

  columnHelper.accessor("ctr", {
    header: "CTR",
    cell: (info) => (
      <span className="tabular-nums">{formatPercent(info.getValue())}</span>
    ),
  }),

  columnHelper.accessor("conversions", {
    header: "Conv.",
    cell: (info) => (
      <span className="tabular-nums">{formatCompact(info.getValue())}</span>
    ),
  }),

  columnHelper.accessor("spend", {
    header: "Spend",
    cell: (info) => (
      <span className="tabular-nums">{formatCurrency(info.getValue())}</span>
    ),
  }),

  columnHelper.accessor("cpc", {
    header: "CPC",
    cell: (info) => {
      const val = info.getValue();
      return (
        <span className="tabular-nums">
          {val !== null ? formatCurrency(val) : "-"}
        </span>
      );
    },
  }),

  columnHelper.accessor("roas", {
    header: "ROAS",
    cell: (info) => {
      const val = info.getValue();
      if (val === null) return <span className="text-muted-foreground">-</span>;
      return (
        <Badge
          variant={val >= 2 ? "default" : val >= 1 ? "secondary" : "destructive"}
          className="tabular-nums text-xs"
        >
          {formatRoas(val)}
        </Badge>
      );
    },
  }),
];

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-3">
        {Array.from({ length: 11 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-16" />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort header helper
// ---------------------------------------------------------------------------

function SortHeader({
  label,
  column,
}: {
  label: string;
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: () => void };
}) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

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
// Main component
// ---------------------------------------------------------------------------

export function CampaignsTable({ data, isLoading }: CampaignsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "spend", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Apply client-side platform/status filters via column filters
  const effectiveColumnFilters = useMemo(() => {
    const filters: ColumnFiltersState = [...columnFilters];
    if (platformFilter !== "all") {
      filters.push({ id: "platform", value: platformFilter });
    }
    if (statusFilter !== "all") {
      filters.push({ id: "status", value: statusFilter });
    }
    return filters;
  }, [columnFilters, platformFilter, statusFilter]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters: effectiveColumnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      return row.original.name
        .toLowerCase()
        .includes(filterValue.toLowerCase());
    },
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  // Loading state
  if (isLoading) {
    return <TableSkeleton />;
  }

  // Empty state (no data at all)
  if (data.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16">
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <Megaphone className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No campaigns yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect a Google Ads or Meta Ads account and sync your campaigns to
              see data here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Platform filter */}
        <Select
          value={platformFilter}
          onValueChange={(v) => {
            if (v) setPlatformFilter(v);
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="GOOGLE_ADS">Google Ads</SelectItem>
            <SelectItem value="META_ADS">Meta Ads</SelectItem>
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            if (v) setStatusFilter(v);
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>

        {/* Page size */}
        <Select
          value={String(table.getState().pagination.pageSize)}
          onValueChange={(v) => {
            if (v) table.setPageSize(Number(v));
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 per page</SelectItem>
            <SelectItem value="25">25 per page</SelectItem>
            <SelectItem value="50">50 per page</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
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
                            header.getContext()
                          ) as string
                        }
                        column={header.column}
                      />
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <BarChart3 className="size-5 text-muted-foreground/50" />
                    No campaigns match your filters.
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/20"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="whitespace-nowrap px-4 py-2.5 text-sm"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length} campaign
            {table.getFilteredRowModel().rows.length !== 1 ? "s" : ""} total
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
    </div>
  );
}
