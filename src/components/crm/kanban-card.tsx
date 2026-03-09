"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KanbanContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  company: string | null;
  score: number;
  tags: string[];
  avatarUrl: string | null;
  stage: string;
}

interface KanbanCardProps {
  contact: KanbanContact;
  onCardClick?: (contact: KanbanContact) => void;
}

// ---------------------------------------------------------------------------
// Tag colors (deterministic from string hash)
// ---------------------------------------------------------------------------

const TAG_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-lime-500",
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

// ---------------------------------------------------------------------------
// Score badge variant
// ---------------------------------------------------------------------------

function scoreVariant(score: number) {
  if (score >= 80) return "default" as const;
  if (score >= 50) return "secondary" as const;
  return "outline" as const;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KanbanCard({ contact, onCardClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: contact.id, data: { contact } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const initials =
    [contact.firstName?.[0], contact.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || contact.email[0].toUpperCase();

  const displayName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.email;

  return (
    <div ref={setNodeRef} style={style} {...attributes} role="option" aria-label={displayName}>
      <Card
        size="sm"
        className={cn(
          "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/30",
          isDragging && "z-50 rotate-2 shadow-xl opacity-90",
        )}
        onClick={() => onCardClick?.(contact)}
      >
        <CardContent className="flex items-start gap-2.5 p-3">
          {/* Drag handle */}
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            {...listeners}
            aria-label="Drag handle"
          >
            <GripVertical className="size-4" />
          </button>

          {/* Avatar */}
          <Avatar size="sm">
            {contact.avatarUrl && <AvatarImage src={contact.avatarUrl} />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-sm font-medium leading-tight">
                {displayName}
              </span>
              <Badge variant={scoreVariant(contact.score)} className="shrink-0 text-[10px] h-4 px-1.5">
                {contact.score}
              </Badge>
            </div>

            {contact.company && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {contact.company}
              </p>
            )}

            {/* Tags as colored dots */}
            {contact.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {contact.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    title={tag}
                    className={cn(
                      "inline-block size-2 rounded-full",
                      tagColor(tag),
                    )}
                  />
                ))}
                {contact.tags.length > 5 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{contact.tags.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
