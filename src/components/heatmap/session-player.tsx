"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MousePointerClickIcon,
  ArrowDownIcon,
  NavigationIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SessionTimeline, formatTime, getMarkerColor } from "./session-timeline";
import { SessionControls } from "./session-controls";
import type { TimelineMarker } from "./session-timeline";
import type { PlaybackSpeed } from "./session-controls";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simplified recording event — compatible with rrweb event shape. */
export interface ReplayEvent {
  type: number;
  data: Record<string, unknown>;
  timestamp: number;
}

interface SessionPlayerProps {
  events: ReplayEvent[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPEED_OPTIONS: readonly PlaybackSpeed[] = [1, 2, 4] as const;

const IDLE_THRESHOLD_MS = 3000; // Skip idle periods longer than 3s

// rrweb event types
const RRWEB_FULL_SNAPSHOT = 2;
const RRWEB_INCREMENTAL = 3;

// rrweb incremental snapshot sources
const RRWEB_SOURCE_MOUSE_INTERACTION = 2;
const RRWEB_SOURCE_SCROLL = 3;

// rrweb mouse interaction types
const RRWEB_MOUSE_CLICK = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyEvent(event: ReplayEvent): TimelineMarker | null {
  const data = event.data;

  // rrweb incremental snapshot
  if (event.type === RRWEB_INCREMENTAL) {
    const source = data.source as number | undefined;
    const interactionType = data.type as number | undefined;

    if (source === RRWEB_SOURCE_MOUSE_INTERACTION) {
      if (interactionType === RRWEB_MOUSE_CLICK) {
        return {
          timestamp: event.timestamp,
          offsetMs: 0,
          kind: "click",
          label: (data.selector as string) ?? "Click",
        };
      }
    }

    if (source === RRWEB_SOURCE_SCROLL) {
      return {
        timestamp: event.timestamp,
        offsetMs: 0,
        kind: "scroll",
        label: `Scroll to ${data.y ?? 0}px`,
      };
    }
  }

  // Simplified event format support
  if (data.eventType === "click") {
    return {
      timestamp: event.timestamp,
      offsetMs: 0,
      kind: data.isRageClick ? "rage_click" : "click",
      label: (data.selector as string) ?? "Click",
    };
  }

  if (data.eventType === "scroll") {
    return {
      timestamp: event.timestamp,
      offsetMs: 0,
      kind: "scroll",
      label: `Scroll ${Math.round((data.scrollDepth as number) ?? 0)}%`,
    };
  }

  if (data.eventType === "navigation" || data.href) {
    return {
      timestamp: event.timestamp,
      offsetMs: 0,
      kind: "navigation",
      label: (data.href as string) ?? "Navigation",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// DOM Snapshot Renderer
// ---------------------------------------------------------------------------

/**
 * Renders a simplified "replay" by showing DOM snapshots in an iframe.
 * For full rrweb playback, the rrweb-player package would be used.
 * This basic renderer handles:
 * - Full snapshot rendering (type 2)
 * - Mouse position overlay
 * - Click indicators
 */
function SnapshotRenderer({
  events,
  currentIndex,
  currentTime,
}: {
  events: ReplayEvent[];
  currentIndex: number;
  currentTime: number;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [clickIndicator, setClickIndicator] = useState<{
    x: number;
    y: number;
    key: number;
  } | null>(null);

  // Find the last full snapshot before current index
  useEffect(() => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (!doc) return;

    // Find last full snapshot
    let lastSnapshot: ReplayEvent | null = null;
    for (let i = currentIndex; i >= 0; i--) {
      if (events[i].type === RRWEB_FULL_SNAPSHOT) {
        lastSnapshot = events[i];
        break;
      }
    }

    if (lastSnapshot?.data?.html) {
      doc.open();
      doc.write(lastSnapshot.data.html as string);
      doc.close();

      // Add non-interactive style
      const style = doc.createElement("style");
      style.textContent = `
        * { pointer-events: none !important; cursor: default !important; }
        body { overflow: hidden !important; }
      `;
      doc.head?.appendChild(style);
    }
  }, [events, currentIndex]);

  // Update mouse position based on incremental events
  useEffect(() => {
    const event = events[currentIndex];
    if (!event) return;

    const data = event.data;

    // rrweb mouse move
    if (
      event.type === RRWEB_INCREMENTAL &&
      (data.source === 1 || data.source === 6)
    ) {
      const positions = data.positions as
        | Array<{ x: number; y: number }>
        | undefined;
      if (positions?.length) {
        const last = positions[positions.length - 1];
        setMousePos({ x: last.x, y: last.y });
      }
    }

    // Simple format mouse move
    if (data.eventType === "mousemove" && data.x != null && data.y != null) {
      setMousePos({ x: data.x as number, y: data.y as number });
    }

    // Click indicator
    const isClick =
      (event.type === RRWEB_INCREMENTAL &&
        data.source === RRWEB_SOURCE_MOUSE_INTERACTION &&
        data.type === RRWEB_MOUSE_CLICK) ||
      data.eventType === "click";

    if (isClick && data.x != null && data.y != null) {
      setClickIndicator({
        x: data.x as number,
        y: data.y as number,
        key: currentTime,
      });
      setTimeout(() => setClickIndicator(null), 500);
    }
  }, [events, currentIndex, currentTime]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border bg-white">
      <iframe
        ref={iframeRef}
        className="h-full w-full border-0"
        title="Session replay"
        sandbox="allow-same-origin"
      />

      {/* Mouse cursor overlay */}
      {mousePos && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: mousePos.x,
            top: mousePos.y,
            transform: "translate(-2px, -2px)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 2L4 16L8.5 11.5L13 16L15 14L10.5 9.5L16 5L4 2Z"
              fill="black"
              stroke="white"
              strokeWidth="1"
            />
          </svg>
        </div>
      )}

      {/* Click indicator */}
      {clickIndicator && (
        <div
          key={clickIndicator.key}
          className="pointer-events-none absolute z-10 animate-ping"
          style={{
            left: clickIndicator.x - 10,
            top: clickIndicator.y - 10,
          }}
        >
          <div className="size-5 rounded-full border-2 border-red-500 bg-red-500/30" />
        </div>
      )}

      {/* No snapshot placeholder */}
      {events.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No recording data available
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SessionPlayer({ events, className }: SessionPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [skipIdle, setSkipIdle] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  // Compute total duration and base timestamp
  const { totalDuration, baseTimestamp } = useMemo(() => {
    if (events.length === 0) return { totalDuration: 0, baseTimestamp: 0 };
    const timestamps = events.map((e) => e.timestamp);
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    return { totalDuration: max - min, baseTimestamp: min };
  }, [events]);

  // Build timeline markers
  const markers = useMemo(() => {
    const result: TimelineMarker[] = [];
    for (const event of events) {
      const marker = classifyEvent(event);
      if (marker) {
        marker.offsetMs = marker.timestamp - baseTimestamp;
        result.push(marker);
      }
    }
    return result;
  }, [events, baseTimestamp]);

  // Find current event index based on playback time
  const currentIndex = useMemo(() => {
    const targetTimestamp = baseTimestamp + currentTime;
    let idx = 0;
    for (let i = 0; i < events.length; i++) {
      if (events[i].timestamp <= targetTimestamp) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [events, baseTimestamp, currentTime]);

  // Build idle periods map for skip-idle feature
  const idlePeriods = useMemo(() => {
    const periods: Array<{ start: number; end: number }> = [];
    for (let i = 1; i < events.length; i++) {
      const gap = events[i].timestamp - events[i - 1].timestamp;
      if (gap > IDLE_THRESHOLD_MS) {
        periods.push({
          start: events[i - 1].timestamp - baseTimestamp,
          end: events[i].timestamp - baseTimestamp,
        });
      }
    }
    return periods;
  }, [events, baseTimestamp]);

  // Playback loop
  const tick = useCallback(() => {
    const now = performance.now();
    const delta = now - lastTickRef.current;
    lastTickRef.current = now;

    setCurrentTime((prev) => {
      let next = prev + delta * speed;

      // Skip idle periods
      if (skipIdle) {
        for (const period of idlePeriods) {
          if (next >= period.start && next < period.end) {
            next = period.end;
            break;
          }
        }
      }

      // Stop at end
      if (next >= totalDuration) {
        setIsPlaying(false);
        return totalDuration;
      }

      return next;
    });

    animFrameRef.current = requestAnimationFrame(tick);
  }, [speed, skipIdle, totalDuration, idlePeriods]);

  useEffect(() => {
    if (isPlaying) {
      lastTickRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(tick);
    } else if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, tick]);

  // Handlers
  const togglePlay = useCallback(() => {
    if (currentTime >= totalDuration) {
      setCurrentTime(0);
    }
    setIsPlaying((prev) => !prev);
  }, [currentTime, totalDuration]);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev);
      return SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    });
  }, []);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      setCurrentTime(Math.max(0, Math.min(fraction * totalDuration, totalDuration)));
    },
    [totalDuration],
  );

  const skipForward = useCallback(() => {
    setCurrentTime((prev) => Math.min(prev + 5000, totalDuration));
  }, [totalDuration]);

  const progressPercent =
    totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Session Replay</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums text-xs">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {events.length} events
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Replay viewport */}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
          <SnapshotRenderer
            events={events}
            currentIndex={currentIndex}
            currentTime={currentTime}
          />
        </div>

        {/* Timeline with markers */}
        <SessionTimeline
          currentTime={currentTime}
          totalDuration={totalDuration}
          markers={markers}
          progressPercent={progressPercent}
          onTimelineClick={handleTimelineClick}
        />

        {/* Controls */}
        <SessionControls
          isPlaying={isPlaying}
          speed={speed}
          skipIdle={skipIdle}
          onTogglePlay={togglePlay}
          onSkipForward={skipForward}
          onCycleSpeed={cycleSpeed}
          onSkipIdleChange={setSkipIdle}
        />

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-blue-500" />
            Clicks
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-red-500" />
            Rage clicks
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-emerald-500" />
            Scrolls
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-purple-500" />
            Navigation
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
