"use client";

import { useState, useCallback, useMemo } from "react";
import { Trash2Icon, StickyNote } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Relative time formatter ──────────────────────────────────────────────────

function relativeTime(date: Date | string): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) !== 1 ? "s" : ""} ago`;
  return d.toLocaleDateString();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface NotesPanelProps {
  contactId: string;
}

export function NotesPanel({ contactId }: NotesPanelProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const [noteContent, setNoteContent] = useState("");

  const utils = trpc.useUtils();

  // ─── Queries ──────────────────────────────────────────────────────────────

  const notesQuery = trpc.crm.listNotes.useQuery(
    { workspaceId, contactId },
    { enabled: !!workspaceId && !!contactId }
  );

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const addNoteMutation = trpc.crm.addNote.useMutation({
    onSuccess: () => {
      setNoteContent("");
      utils.crm.listNotes.invalidate({ workspaceId, contactId });
      utils.crm.getContact.invalidate();
      utils.crm.getTimeline.invalidate();
    },
  });

  const deleteNoteMutation = trpc.crm.deleteNote.useMutation({
    onSuccess: () => {
      utils.crm.listNotes.invalidate({ workspaceId, contactId });
      utils.crm.getContact.invalidate();
      utils.crm.getTimeline.invalidate();
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAddNote = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!noteContent.trim()) return;
      addNoteMutation.mutate({
        workspaceId,
        contactId,
        content: noteContent.trim(),
      });
    },
    [noteContent, workspaceId, contactId, addNoteMutation]
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      if (!confirm("Delete this note?")) return;
      deleteNoteMutation.mutate({ workspaceId, noteId });
    },
    [workspaceId, deleteNoteMutation]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 pt-4">
      {/* Add note form */}
      <Card size="sm">
        <CardContent>
          <form onSubmit={handleAddNote} className="flex flex-col gap-3">
            <Textarea
              placeholder="Add a note..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="min-h-20"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={!noteContent.trim() || addNoteMutation.isPending}
              >
                {addNoteMutation.isPending ? "Saving..." : "Add Note"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Notes list */}
      {notesQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} size="sm">
              <CardContent>
                <Skeleton className="mb-2 h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <StickyNote className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No notes yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Add a note above to get started.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((note) => (
            <Card key={note.id} size="sm">
              <CardContent>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-sm">
                      {note.content}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {relativeTime(note.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteNote(note.id)}
                    disabled={deleteNoteMutation.isPending}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
