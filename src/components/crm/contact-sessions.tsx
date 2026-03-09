"use client";

import {
  GlobeIcon,
  ClockIcon,
  MonitorIcon,
  MousePointerClickIcon,
} from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "--";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Edge")) return "Edge";
  return "Other";
}

// ── Component ────────────────────────────────────────────────────────────────

interface ContactSessionsProps {
  contactId: string;
}

export function ContactSessions({ contactId }: ContactSessionsProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const sessionsQuery = trpc.heatmap.getContactSessions.useQuery(
    { workspaceId, contactId },
    { enabled: !!workspaceId && !!contactId }
  );

  if (sessionsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const sessions = sessionsQuery.data ?? [];

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <GlobeIcon className="size-10 opacity-30" />
        <p className="text-sm">No heatmap sessions linked to this contact.</p>
        <p className="text-xs">
          Sessions are linked automatically when the contact submits a form on a
          tracked page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pt-4">
      <p className="text-sm text-muted-foreground">
        {sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded
      </p>

      {sessions.map((session) => (
        <Card key={session.id} size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GlobeIcon className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-xs truncate flex-1">
                {session.pageUrl}
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                {formatDate(session.startedAt)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3" />
                {formatDuration(session.duration)}
              </span>
              <span className="flex items-center gap-1">
                <MousePointerClickIcon className="size-3" />
                {session.eventCount} events
              </span>
              <span className="flex items-center gap-1">
                <MonitorIcon className="size-3" />
                {session.screenWidth}x{session.screenHeight}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {parseUserAgent(session.userAgent)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
