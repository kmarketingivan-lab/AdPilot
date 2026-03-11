"use client";

import { useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import { PostChip } from "@/components/social/post-chip";
import type { Platform, PostStatus } from "@prisma/client";

export interface CalendarPost {
  id: string;
  content: string;
  status: PostStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  platforms: {
    id: string;
    platform: Platform;
    status: PostStatus;
  }[];
}

interface CalendarGridProps {
  currentMonth: Date;
  postsByDate: Record<string, CalendarPost[]>;
  onDayClick: (date: Date) => void;
  onPostClick: (post: CalendarPost) => void;
  selectedDate: Date | null;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

export function CalendarGrid({
  currentMonth,
  postsByDate,
  onDayClick,
  onPostClick,
  selectedDate,
}: CalendarGridProps) {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      {/* Weekday header row */}
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {WEEKDAY_LABELS.map((day) => (
          <div
            key={day}
            className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div className="grid grid-cols-7 auto-rows-fr">
        {calendarDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const posts = postsByDate[dateKey] ?? [];
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
          const today = isToday(day);
          const overflow = posts.length > MAX_CHIPS;
          const visiblePosts = overflow ? posts.slice(0, MAX_CHIPS) : posts;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onDayClick(day)}
              className={cn(
                "group relative flex min-h-[100px] flex-col border-b border-r p-1 text-left transition-colors hover:bg-muted/30",
                !isCurrentMonth && "bg-muted/10 opacity-50",
                isSelected && "ring-2 ring-primary ring-inset"
              )}
            >
              {/* Day number */}
              <span
                className={cn(
                  "mb-0.5 inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                  today && "bg-primary text-primary-foreground",
                  !today && "text-foreground"
                )}
              >
                {format(day, "d")}
              </span>

              {/* Post chips */}
              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                {visiblePosts.map((post) => (
                  <div
                    key={post.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPostClick(post);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        onPostClick(post);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <PostChip
                      content={post.content}
                      status={post.status}
                      platforms={post.platforms}
                    />
                  </div>
                ))}
                {overflow && (
                  <span className="px-1 text-[10px] font-medium text-muted-foreground">
                    +{posts.length - MAX_CHIPS} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
