"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowUpDownIcon,
} from "lucide-react";
import type { Contact, PipelineStage, LeadSource } from "@prisma/client";

import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ─── Stage badge colors ──────────────────────────────────────────────────────

const STAGE_COLORS: Record<PipelineStage, string> = {
  LEAD: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  MQL: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  SQL: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  OPPORTUNITY: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  CUSTOMER: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  LOST: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const STAGES: PipelineStage[] = [
  "LEAD",
  "MQL",
  "SQL",
  "OPPORTUNITY",
  "CUSTOMER",
  "LOST",
];

const SOURCES: LeadSource[] = [
  "ORGANIC",
  "PAID_SEARCH",
  "PAID_SOCIAL",
  "REFERRAL",
  "DIRECT",
  "EMAIL",
  "WEBINAR",
  "OTHER",
];

// ─── Column helper ───────────────────────────────────────────────────────────

const columnHelper = createColumnHelper<Contact>();

function getInitials(first?: string | null, last?: string | null): string {
  return [first?.[0], last?.[0]].filter(Boolean).join("").toUpperCase() || "?";
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CrmPage() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  // Filters
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<PipelineStage | undefined>();
  const [sourceFilter, setSourceFilter] = useState<LeadSource | undefined>();
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);

  // Derive sort params
  const sortBy = (sorting[0]?.id ?? "createdAt") as
    | "firstName"
    | "email"
    | "company"
    | "stage"
    | "score"
    | "source"
    | "createdAt";
  const sortOrder = sorting[0]?.desc ? ("desc" as const) : ("asc" as const);

  // tRPC query
  const contactsQuery = trpc.crm.listContacts.useQuery(
    {
      workspaceId,
      page,
      perPage: 25,
      search: search || undefined,
      stage: stageFilter,
      source: sourceFilter,
      sortBy,
      sortOrder,
    },
    { enabled: !!workspaceId }
  );

  const utils = trpc.useUtils();

  const bulkDeleteMutation = trpc.crm.bulkDelete.useMutation({
    onSuccess: () => {
      setRowSelection({});
      utils.crm.listContacts.invalidate();
    },
  });

  const createMutation = trpc.crm.createContact.useMutation({
    onSuccess: () => {
      setDialogOpen(false);
      utils.crm.listContacts.invalidate();
    },
  });

  // Columns
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            className="size-4 rounded border-border"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="size-4 rounded border-border"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        size: 40,
      }),
      columnHelper.accessor(
        (row) =>
          [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email,
        {
          id: "firstName",
          header: "Name",
          cell: ({ row }) => {
            const c = row.original;
            const name =
              [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;
            return (
              <div className="flex items-center gap-2.5">
                <Avatar size="sm">
                  {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt={name} />}
                  <AvatarFallback>
                    {getInitials(c.firstName, c.lastName)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{name}</span>
              </div>
            );
          },
        }
      ),
      columnHelper.accessor("email", {
        header: "Email",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue()}</span>
        ),
      }),
      columnHelper.accessor("company", {
        header: "Company",
        cell: ({ getValue }) => getValue() || "\u2014",
      }),
      columnHelper.accessor("stage", {
        header: "Stage",
        cell: ({ getValue }) => {
          const stage = getValue();
          return (
            <Badge
              className={cn(
                "border-transparent font-medium",
                STAGE_COLORS[stage]
              )}
            >
              {stage}
            </Badge>
          );
        },
      }),
      columnHelper.accessor("score", {
        header: "Score",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue()}</span>
        ),
      }),
      columnHelper.accessor("source", {
        header: "Source",
        cell: ({ getValue }) => {
          const src = getValue();
          return src ? (
            <Badge variant="outline">{src.replace(/_/g, " ")}</Badge>
          ) : (
            "\u2014"
          );
        },
      }),
      columnHelper.accessor("tags", {
        header: "Tags",
        enableSorting: false,
        cell: ({ getValue }) => {
          const tags = getValue();
          if (!tags || tags.length === 0) return "\u2014";
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">
                  {t}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("createdAt", {
        header: "Created",
        cell: ({ getValue }) => {
          const d = getValue();
          return d ? new Date(d).toLocaleDateString() : "\u2014";
        },
      }),
    ],
    []
  );

  const data = contactsQuery.data?.contacts ?? [];
  const totalPages = contactsQuery.data?.totalPages ?? 1;

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableRowSelection: true,
    getRowId: (row) => row.id,
  });

  const selectedIds = Object.keys(rowSelection);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.length === 0) return;
    bulkDeleteMutation.mutate({ workspaceId, contactIds: selectedIds });
  }, [selectedIds, workspaceId, bulkDeleteMutation]);

  // ─── Create contact form submit ─────────────────────────────────────────────

  const handleCreateSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      createMutation.mutate({
        workspaceId,
        email: formData.get("email") as string,
        firstName: (formData.get("firstName") as string) || undefined,
        lastName: (formData.get("lastName") as string) || undefined,
        phone: (formData.get("phone") as string) || undefined,
        company: (formData.get("company") as string) || undefined,
        jobTitle: (formData.get("jobTitle") as string) || undefined,
        source: (formData.get("source") as LeadSource) || undefined,
      });
    },
    [workspaceId, createMutation]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Manage your CRM contacts and pipeline.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button>
                <PlusIcon className="size-4" />
                Add Contact
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Contact</DialogTitle>
              <DialogDescription>
                Create a new contact in your workspace.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" name="firstName" placeholder="John" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" name="lastName" placeholder="Doe" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="john@example.com"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" placeholder="+1 555 0100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" name="company" placeholder="Acme Inc." />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="jobTitle">Job Title</Label>
                  <Input
                    id="jobTitle"
                    name="jobTitle"
                    placeholder="Marketing Manager"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="source">Source</Label>
                <select
                  id="source"
                  name="source"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Select source...</option>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Contact"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Select
          value={stageFilter ?? ""}
          onValueChange={(v) => {
            setStageFilter((v || undefined) as PipelineStage | undefined);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sourceFilter ?? ""}
          onValueChange={(v) => {
            setSourceFilter((v || undefined) as LeadSource | undefined);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Sources</SelectItem>
            {SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedIds.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkDeleteMutation.isPending}
          >
            <Trash2Icon className="size-4" />
            Delete {selectedIds.length} selected
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b bg-muted/50 text-left"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-3 py-2.5 text-xs font-medium text-muted-foreground",
                      header.column.getCanSort() && "cursor-pointer select-none"
                    )}
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {header.column.getCanSort() &&
                        header.id !== "select" && (
                          <ArrowUpDownIcon className="size-3 text-muted-foreground/50" />
                        )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {contactsQuery.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {columns.map((_, ci) => (
                    <td key={ci} className="px-3 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-12 text-center text-muted-foreground"
                >
                  No contacts found. Add your first contact to get started.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/50 cursor-pointer",
                    row.getIsSelected() && "bg-muted/30"
                  )}
                  onClick={() =>
                    router.push(`/dashboard/crm/${row.original.id}`)
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5">
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
            {contactsQuery.data && (
              <span> &middot; {contactsQuery.data.total} contacts</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
