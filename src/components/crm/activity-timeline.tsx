"use client";

import { useMemo } from "react";
import {
  Mail,
  MailOpen,
  Eye,
  MousePointer,
  FileText,
  StickyNote,
  Phone,
  Calendar,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import type { ActivityType, Activity } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Icon & label mapping ────────────────────────────────────────────────────

const ACTIVITY_CONFIG: Record<
  ActivityType,
  { icon: LucideIcon; label: string; color: string }
> = {
  EMAIL_SENT: {
    icon: Mail,
    label: "Email Sent",
    color: "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/40",
  },
  EMAIL_OPENED: {
    icon: MailOpen,
    label: "Email Opened",
    color: "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/40",
  },
  PAGE_VIEW: {
    icon: Eye,
    label: "Page View",
    color: "text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/40",
  },
  AD_CLICK: {
    icon: MousePointer,
    label: "Ad Click",
    color: "text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/40",
  },
  FORM_SUBMIT: {
    icon: FileText,
    label: "Form Submitted",
    color: "text-teal-600 bg-teal-100 dark:text-teal-400 dark:bg-teal-900/40",
  },
  NOTE: {
    icon: StickyNote,
    label: "Note",
    color: "text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/40",
  },
  CALL: {
    icon: Phone,
    label: "Call",
    color: "text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/40",
  },
  MEETING: {
    icon: Calendar,
    label: "Meeting",
    color: "text-pink-600 bg-pink-100 dark:text-pink-400 dark:bg-pink-900/40",
  },
  STAGE_CHANGE: {
    icon: ArrowRight,
    label: "Stage Change",
    color: "text-cyan-600 bg-cyan-100 dark:text-cyan-400 dark:bg-cyan-900/40",
  },
};

// ─── Relative time formatter ─────────────────────────────────────────────────

function relativeTime(date: Date | string): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return d.toLocaleDateString();
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ActivityTimelineProps {
  activities: Activity[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export function ActivityTimeline({
  activities,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: ActivityTimelineProps) {
  const items = useMemo(
    () =>
      activities.map((a) => ({
        ...a,
        config: ACTIVITY_CONFIG[a.type],
        time: relativeTime(a.createdAt),
      })),
    [activities]
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="mb-3 size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">
          No activity yet
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Activities will appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

      <div className="flex flex-col gap-0">
        {items.map((item) => {
          const Icon = item.config.icon;
          return (
            <div key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
              {/* Icon circle */}
              <div
                className={cn(
                  "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
                  item.config.color
                )}
              >
                <Icon className="size-4" />
              </div>

              {/* Content */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {item.config.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.time}
                  </span>
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
