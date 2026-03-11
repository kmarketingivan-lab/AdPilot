import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Marker shown on the timeline */
export interface TimelineMarker {
  timestamp: number;
  offsetMs: number;
  kind: "click" | "scroll" | "navigation" | "rage_click";
  label: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getMarkerColor(kind: TimelineMarker["kind"]) {
  switch (kind) {
    case "click":
      return "bg-blue-500";
    case "rage_click":
      return "bg-red-500";
    case "scroll":
      return "bg-emerald-500";
    case "navigation":
      return "bg-purple-500";
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SessionTimelineProps {
  currentTime: number;
  totalDuration: number;
  markers: TimelineMarker[];
  progressPercent: number;
  onTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

// ---------------------------------------------------------------------------
// Timeline / scrubber UI
// ---------------------------------------------------------------------------

export function SessionTimeline({
  currentTime,
  totalDuration,
  markers,
  progressPercent,
  onTimelineClick,
}: SessionTimelineProps) {
  return (
    <div className="space-y-1">
      {/* Progress bar */}
      <div
        className="group relative h-3 cursor-pointer rounded-full bg-muted"
        onClick={onTimelineClick}
        role="slider"
        aria-valuenow={Math.round(progressPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Playback position"
        tabIndex={0}
      >
        {/* Filled progress */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-75"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Event markers */}
        {markers.map((marker, i) => {
          const position =
            totalDuration > 0
              ? (marker.offsetMs / totalDuration) * 100
              : 0;
          return (
            <div
              key={`${marker.kind}-${i}`}
              className={cn(
                "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 transition-opacity group-hover:opacity-100",
                getMarkerColor(marker.kind),
              )}
              style={{ left: `${position}%` }}
              title={marker.label}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-sm transition-[left] duration-75"
          style={{ left: `${progressPercent}%` }}
        />
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(totalDuration)}</span>
      </div>
    </div>
  );
}
