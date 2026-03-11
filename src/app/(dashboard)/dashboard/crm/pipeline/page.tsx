"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { PipelineStage } from "@prisma/client";
import Link from "next/link";
import { RefreshCw, UserPlus } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  KanbanColumn,
  STAGE_CONFIG,
} from "@/components/crm/kanban-column";
import { KanbanCard, type KanbanContact } from "@/components/crm/kanban-card";

// ---------------------------------------------------------------------------
// Stage ordering
// ---------------------------------------------------------------------------

const STAGES: PipelineStage[] = [
  "LEAD",
  "MQL",
  "SQL",
  "OPPORTUNITY",
  "CUSTOMER",
  "LOST",
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  // ---- Data fetching ----
  const {
    data: grouped,
    isLoading,
    refetch,
  } = trpc.pipeline.getByStage.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );

  const moveMutation = trpc.pipeline.moveContact.useMutation({
    onSuccess: () => refetch(),
  });

  const recalcMutation = trpc.pipeline.recalculateScores.useMutation({
    onSuccess: () => refetch(),
  });

  // ---- Local state (optimistic columns) ----
  const [columns, setColumns] = useState<Record<
    PipelineStage,
    KanbanContact[]
  > | null>(null);

  // Build columns from server data when it arrives
  const displayColumns = useMemo(() => {
    if (columns) return columns;
    if (!grouped) return null;

    const result = {} as Record<PipelineStage, KanbanContact[]>;
    for (const stage of STAGES) {
      result[stage] = (grouped[stage] ?? []).map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        company: c.company,
        score: c.score,
        tags: c.tags,
        avatarUrl: c.avatarUrl,
        stage: c.stage,
      }));
    }
    return result;
  }, [grouped, columns]);

  // ---- DnD state ----
  const [activeContact, setActiveContact] = useState<KanbanContact | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ---- Dialog state ----
  const [selectedContact, setSelectedContact] = useState<KanbanContact | null>(
    null,
  );

  // ---- Helpers ----
  const findColumn = useCallback(
    (id: string): PipelineStage | null => {
      if (!displayColumns) return null;
      // Check if the id is a stage (droppable column id)
      if (STAGES.includes(id as PipelineStage)) return id as PipelineStage;
      // Otherwise search for the contact
      for (const stage of STAGES) {
        if (displayColumns[stage].some((c) => c.id === id)) return stage;
      }
      return null;
    },
    [displayColumns],
  );

  // ---- DnD handlers ----
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const contact = (event.active.data.current as { contact?: KanbanContact })
        ?.contact;
      if (contact) {
        setActiveContact(contact);
        // Snapshot columns for optimistic updates
        if (displayColumns && !columns) {
          setColumns({ ...displayColumns });
        }
      }
    },
    [displayColumns, columns],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || !columns) return;

      const activeCol = findColumn(active.id as string);
      const overCol = findColumn(over.id as string);
      if (!activeCol || !overCol || activeCol === overCol) return;

      setColumns((prev) => {
        if (!prev) return prev;
        const sourceItems = [...prev[activeCol]];
        const destItems = [...prev[overCol]];
        const activeIdx = sourceItems.findIndex((c) => c.id === active.id);
        if (activeIdx === -1) return prev;

        const [moved] = sourceItems.splice(activeIdx, 1);
        moved.stage = overCol;

        // Find the target index
        const overIdx = destItems.findIndex((c) => c.id === over.id);
        if (overIdx >= 0) {
          destItems.splice(overIdx, 0, moved);
        } else {
          destItems.push(moved);
        }

        return {
          ...prev,
          [activeCol]: sourceItems,
          [overCol]: destItems,
        };
      });
    },
    [columns, findColumn],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveContact(null);

      if (!over || !columns) {
        setColumns(null);
        return;
      }

      const activeCol = findColumn(active.id as string);
      const overCol = findColumn(over.id as string);

      if (!activeCol || !overCol) {
        setColumns(null);
        return;
      }

      // Reorder within same column
      if (activeCol === overCol) {
        setColumns((prev) => {
          if (!prev) return prev;
          const items = [...prev[activeCol]];
          const oldIdx = items.findIndex((c) => c.id === active.id);
          const newIdx = items.findIndex((c) => c.id === over.id);
          if (oldIdx === -1 || newIdx === -1) return prev;
          return { ...prev, [activeCol]: arrayMove(items, oldIdx, newIdx) };
        });
      }

      // Persist stage change to server
      const contact = (active.data.current as { contact?: KanbanContact })
        ?.contact;
      if (contact && contact.stage !== overCol) {
        moveMutation.mutate({
          workspaceId,
          contactId: contact.id,
          newStage: overCol,
        });
      }

      // Clear local columns after mutation is fired — server refetch will update
      setColumns(null);
    },
    [columns, findColumn, moveMutation, workspaceId],
  );

  // ---- Loading skeleton ----
  if (isLoading || !displayColumns) {
    return (
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="flex h-full w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted/30 p-3"
            >
              <Skeleton className="h-6 w-24" />
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalContacts = STAGES.reduce(
    (sum, s) => sum + displayColumns[s].length,
    0,
  );

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {totalContacts} contact{totalContacts !== 1 ? "s" : ""} across{" "}
            {STAGES.length} stages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recalcMutation.mutate({ workspaceId })}
            disabled={recalcMutation.isPending}
          >
            <RefreshCw
              className={`mr-1.5 size-4 ${recalcMutation.isPending ? "animate-spin" : ""}`}
            />
            Recalculate Scores
          </Button>
        </div>
      </div>

      {/* Kanban board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              contacts={displayColumns[stage]}
              onCardClick={setSelectedContact}
              onAddContact={() => {
                // Navigate to add-contact page with pre-selected stage
                // This can be enhanced later with a dialog-based form
                window.location.href = `/dashboard/crm/contacts/new?stage=${stage}`;
              }}
            />
          ))}
        </div>

        {/* Drag overlay — renders the floating card while dragging */}
        <DragOverlay dropAnimation={null}>
          {activeContact ? (
            <div className="w-72 rotate-3 opacity-90">
              <KanbanCard contact={activeContact} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Contact detail dialog */}
      <Dialog
        open={!!selectedContact}
        onOpenChange={(open) => {
          if (!open) setSelectedContact(null);
        }}
      >
        {selectedContact && (
          <ContactDetailDialog
            contact={selectedContact}
            workspaceId={workspaceId}
            onClose={() => setSelectedContact(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact Detail Dialog (inner)
// ---------------------------------------------------------------------------

function ContactDetailDialog({
  contact,
  workspaceId,
  onClose,
}: {
  contact: KanbanContact;
  workspaceId: string;
  onClose: () => void;
}) {
  const { data: breakdown, isLoading } =
    trpc.pipeline.getScoreBreakdown.useQuery(
      { workspaceId, contactId: contact.id },
      { enabled: !!workspaceId },
    );

  const displayName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.email;

  const initials =
    [contact.firstName?.[0], contact.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || contact.email[0].toUpperCase();

  const stageConfig = STAGE_CONFIG[contact.stage as keyof typeof STAGE_CONFIG];

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <Avatar>
            {contact.avatarUrl && <AvatarImage src={contact.avatarUrl} />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <DialogTitle>{displayName}</DialogTitle>
            <DialogDescription>
              {contact.company ?? contact.email}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="grid gap-3 text-sm">
        {/* Stage & Score */}
        <div className="flex items-center gap-3">
          <Badge variant="secondary">
            <span
              className={`mr-1.5 inline-block size-2 rounded-full ${stageConfig?.color ?? "bg-muted"}`}
            />
            {stageConfig?.label ?? contact.stage}
          </Badge>
          <Badge variant="outline">Score: {contact.score}</Badge>
        </div>

        {/* Score breakdown */}
        {isLoading && <Skeleton className="h-16 w-full" />}
        {breakdown && (
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Score Breakdown
            </p>
            <div className="space-y-1">
              {breakdown.activityScores.map((item) => (
                <div
                  key={item.type}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">
                    {item.type.replace(/_/g, " ")} x{item.count}
                  </span>
                  <span className="font-medium">+{item.points}</span>
                </div>
              ))}
              {breakdown.decayPenalty > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Inactivity ({breakdown.decayDays}d)
                  </span>
                  <span className="font-medium text-destructive">
                    -{breakdown.decayPenalty}
                  </span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between border-t pt-1 text-xs font-semibold">
                <span>Total</span>
                <span>{breakdown.totalScore}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <DialogFooter showCloseButton>
        <Link href={`/dashboard/crm/contacts/${contact.id}`}>
          <Button size="sm">View Detail</Button>
        </Link>
      </DialogFooter>
    </DialogContent>
  );
}
