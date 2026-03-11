"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { PipelineStage } from "@prisma/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KanbanCard, type KanbanContact } from "./kanban-card";

// ---------------------------------------------------------------------------
// Stage display config
// ---------------------------------------------------------------------------

export const STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; color: string }
> = {
  LEAD: { label: "Lead", color: "bg-slate-500" },
  MQL: { label: "MQL", color: "bg-blue-500" },
  SQL: { label: "SQL", color: "bg-indigo-500" },
  OPPORTUNITY: { label: "Opportunity", color: "bg-amber-500" },
  CUSTOMER: { label: "Customer", color: "bg-emerald-500" },
  LOST: { label: "Lost", color: "bg-rose-500" },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  stage: PipelineStage;
  contacts: KanbanContact[];
  onCardClick: (contact: KanbanContact) => void;
  onAddContact?: (stage: PipelineStage) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KanbanColumn({
  stage,
  contacts,
  onCardClick,
  onAddContact,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const config = STAGE_CONFIG[stage];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn("inline-block size-2.5 rounded-full", config.color)}
          />
          <h3 className="text-sm font-semibold">{config.label}</h3>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            {contacts.length}
          </span>
        </div>
        {onAddContact && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onAddContact(stage)}
            aria-label={`Add contact to ${config.label}`}
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>

      {/* Scrollable card list */}
      <ScrollArea className="flex-1 overflow-hidden">
        <SortableContext
          items={contacts.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div role="listbox" aria-label={`${config.label} contacts`} className="flex flex-col gap-2 p-2">
            {contacts.map((contact) => (
              <KanbanCard
                key={contact.id}
                contact={contact}
                onCardClick={onCardClick}
              />
            ))}

            {/* Drop indicator when column is empty */}
            {contacts.length === 0 && (
              <div
                className={cn(
                  "flex h-24 items-center justify-center rounded-lg border-2 border-dashed text-xs text-muted-foreground transition-colors",
                  isOver
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-muted-foreground/20",
                )}
              >
                Drop here
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}
