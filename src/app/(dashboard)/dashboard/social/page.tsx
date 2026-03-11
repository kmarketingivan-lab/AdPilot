"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
  isSameDay,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
} from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { CalendarGrid, type CalendarPost } from "@/components/social/calendar-grid";
import { PostChip, PlatformIcon, STATUS_COLORS } from "@/components/social/post-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  CalendarIcon,
  ListIcon,
} from "lucide-react";
import type { Platform, PostStatus } from "@prisma/client";

type ViewMode = "month" | "week";

const PLATFORMS: { value: Platform | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Platforms" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "TWITTER", label: "Twitter" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" },
];

const STATUSES: { value: PostStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "REVIEW", label: "Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "PUBLISHING", label: "Publishing" },
  { value: "PUBLISHED", label: "Published" },
  { value: "FAILED", label: "Failed" },
];

export default function SocialCalendarPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [platformFilter, setPlatformFilter] = useState<Platform | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<PostStatus | "ALL">("ALL");

  // Compute the query date range based on view mode
  const { queryStart, queryEnd } = useMemo(() => {
    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      return {
        queryStart: startOfWeek(monthStart, { weekStartsOn: 1 }),
        queryEnd: endOfWeek(monthEnd, { weekStartsOn: 1 }),
      };
    }
    // Week view
    return {
      queryStart: startOfWeek(currentDate, { weekStartsOn: 1 }),
      queryEnd: endOfWeek(currentDate, { weekStartsOn: 1 }),
    };
  }, [currentDate, viewMode]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const {
    data: rawPostsByDate,
    isLoading,
  } = (trpc as any).schedule.getCalendarPosts.useQuery(
    {
      workspaceId,
      start: queryStart,
      end: queryEnd,
    },
    { enabled: !!workspaceId }
  ) as { data: Record<string, CalendarPost[]> | undefined; isLoading: boolean };

  // Apply client-side filters
  const filteredPostsByDate = useMemo(() => {
    if (!rawPostsByDate) return {};

    const filtered: Record<string, CalendarPost[]> = {};

    for (const [dateKey, posts] of Object.entries(rawPostsByDate)) {
      const matchingPosts = posts.filter((post: CalendarPost) => {
        // Platform filter
        if (
          platformFilter !== "ALL" &&
          !post.platforms.some((p) => p.platform === platformFilter)
        ) {
          return false;
        }
        // Status filter
        if (statusFilter !== "ALL" && post.status !== statusFilter) {
          return false;
        }
        return true;
      });

      if (matchingPosts.length > 0) {
        filtered[dateKey] = matchingPosts;
      }
    }

    return filtered;
  }, [rawPostsByDate, platformFilter, statusFilter]);

  // Posts for the selected day (side panel)
  const selectedDayPosts = useMemo(() => {
    if (!selectedDate || !filteredPostsByDate) return [];
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return filteredPostsByDate[dateKey] ?? [];
  }, [selectedDate, filteredPostsByDate]);

  // Navigation handlers
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  const goPrev = useCallback(() => {
    setCurrentDate((d) => (viewMode === "month" ? subMonths(d, 1) : subWeeks(d, 1)));
  }, [viewMode]);

  const goNext = useCallback(() => {
    setCurrentDate((d) => (viewMode === "month" ? addMonths(d, 1) : addWeeks(d, 1)));
  }, [viewMode]);

  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate((prev) => (prev && isSameDay(prev, date) ? null : date));
  }, []);

  const handlePostClick = useCallback((post: CalendarPost) => {
    setSelectedPost(post);
  }, []);

  // Week view days
  const weekDays = useMemo(() => {
    if (viewMode !== "week") return [];
    return eachDayOfInterval({ start: queryStart, end: queryEnd });
  }, [viewMode, queryStart, queryEnd]);

  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Editorial Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan, schedule, and track your social media content.
          </p>
        </div>

        <Link href="/dashboard/social/compose">
          <Button>
            <PlusIcon data-icon="inline-start" />
            New Post
          </Button>
        </Link>
      </div>

      {/* Toolbar: navigation + filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Month/week nav */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={goPrev}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" onClick={goNext}>
            <ChevronRightIcon />
          </Button>
        </div>

        <h2 className="min-w-[140px] text-base font-medium">
          {viewMode === "month"
            ? format(currentDate, "MMMM yyyy")
            : `Week of ${format(queryStart, "MMM d")} - ${format(queryEnd, "MMM d, yyyy")}`}
        </h2>

        <div className="ml-auto flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border">
            <Button
              variant={viewMode === "month" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setViewMode("month")}
              aria-label="Month view"
            >
              <CalendarIcon />
            </Button>
            <Button
              variant={viewMode === "week" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setViewMode("week")}
              aria-label="Week view"
            >
              <ListIcon />
            </Button>
          </div>

          {/* Platform filter */}
          <Select
            value={platformFilter}
            onValueChange={(val) => setPlatformFilter(val as Platform | "ALL")}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as PostStatus | "ALL")}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Calendar / Week list */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <CalendarSkeleton viewMode={viewMode} />
          ) : viewMode === "month" ? (
            <CalendarGrid
              currentMonth={currentDate}
              postsByDate={filteredPostsByDate}
              onDayClick={handleDayClick}
              onPostClick={handlePostClick}
              selectedDate={selectedDate}
            />
          ) : (
            <WeekView
              days={weekDays}
              postsByDate={filteredPostsByDate}
              onPostClick={handlePostClick}
            />
          )}
        </div>

        {/* Side panel for selected day (month view only) */}
        {viewMode === "month" && selectedDate && (
          <div className="hidden w-72 shrink-0 lg:block">
            <Card>
              <CardHeader>
                <CardTitle>{format(selectedDate, "EEEE, MMM d")}</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedDayPosts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No posts for this day.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedDayPosts.map((post) => (
                      <PostChip
                        key={post.id}
                        content={post.content}
                        status={post.status}
                        platforms={post.platforms}
                        onClick={() => handlePostClick(post)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Post detail dialog */}
      <Dialog
        open={!!selectedPost}
        onOpenChange={(open) => {
          if (!open) setSelectedPost(null);
        }}
      >
        {selectedPost && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Post Details</DialogTitle>
              <DialogDescription>
                {selectedPost.scheduledAt
                  ? `Scheduled for ${format(new Date(selectedPost.scheduledAt), "PPpp")}`
                  : selectedPost.publishedAt
                    ? `Published on ${format(new Date(selectedPost.publishedAt), "PPpp")}`
                    : "Draft"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Status
                </span>
                <Badge variant="secondary">{selectedPost.status}</Badge>
              </div>

              <Separator />

              {/* Content */}
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Content
                </span>
                <p className="whitespace-pre-wrap text-sm">
                  {selectedPost.content}
                </p>
              </div>

              <Separator />

              {/* Platforms */}
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Platforms
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPost.platforms.map((pp) => (
                    <div
                      key={pp.id}
                      className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
                    >
                      <PlatformIcon platform={pp.platform} />
                      <span>{pp.platform}</span>
                      <Badge
                        variant={
                          pp.status === "PUBLISHED"
                            ? "default"
                            : pp.status === "FAILED"
                              ? "destructive"
                              : "secondary"
                        }
                        className="ml-1"
                      >
                        {pp.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter showCloseButton />
          </DialogContent>
        )}
      </Dialog>

      {/* Floating action button (mobile) */}
      <Link
        href="/dashboard/social/compose"
        className="fixed right-4 bottom-4 z-40 lg:hidden"
      >
        <Button size="icon-lg" className="size-12 rounded-full shadow-lg">
          <PlusIcon className="size-5" />
        </Button>
      </Link>
    </div>
  );
}

// ---- Week View ----

function WeekView({
  days,
  postsByDate,
  onPostClick,
}: {
  days: Date[];
  postsByDate: Record<string, CalendarPost[]>;
  onPostClick: (post: CalendarPost) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {days.map((day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        const posts = postsByDate[dateKey] ?? [];
        const today = isSameDay(day, new Date());

        return (
          <Card key={dateKey} size="sm">
            <CardHeader>
              <CardTitle
                className={today ? "text-primary" : undefined}
              >
                {format(day, "EEEE, MMM d")}
                {today && (
                  <Badge variant="secondary" className="ml-2">
                    Today
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {posts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No posts</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center gap-2 rounded-md border p-2 transition-colors hover:bg-muted/50"
                      role="button"
                      tabIndex={0}
                      onClick={() => onPostClick(post)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onPostClick(post);
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {post.platforms.map((pp) => (
                          <PlatformIcon
                            key={pp.id}
                            platform={pp.platform}
                            className="size-3.5"
                          />
                        ))}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {post.content}
                      </span>
                      <Badge
                        variant={
                          post.status === "PUBLISHED"
                            ? "default"
                            : post.status === "FAILED"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {post.status}
                      </Badge>
                      {post.scheduledAt && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {format(new Date(post.scheduledAt), "HH:mm")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---- Loading skeleton ----

function CalendarSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "week") {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      {/* Header row */}
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="mx-2 my-1.5 h-4" />
        ))}
      </div>
      {/* Grid cells */}
      <div className="grid grid-cols-7 auto-rows-fr">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="min-h-[100px] border-b border-r p-1">
            <Skeleton className="mb-1 h-4 w-6 rounded-full" />
            <Skeleton className="mb-0.5 h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
