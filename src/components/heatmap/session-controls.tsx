import {
  PlayIcon,
  PauseIcon,
  SkipForwardIcon,
  FastForwardIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlaybackSpeed = 1 | 2 | 4;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SessionControlsProps {
  isPlaying: boolean;
  speed: PlaybackSpeed;
  skipIdle: boolean;
  onTogglePlay: () => void;
  onSkipForward: () => void;
  onCycleSpeed: () => void;
  onSkipIdleChange: (value: boolean) => void;
}

// ---------------------------------------------------------------------------
// Playback control bar
// ---------------------------------------------------------------------------

export function SessionControls({
  isPlaying,
  speed,
  skipIdle,
  onTogglePlay,
  onSkipForward,
  onCycleSpeed,
  onSkipIdleChange,
}: SessionControlsProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        {/* Play / Pause */}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>

        {/* Skip forward 5s */}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onSkipForward}
          aria-label="Skip forward 5 seconds"
        >
          <SkipForwardIcon className="size-4" />
        </Button>

        {/* Speed */}
        <Button
          variant="outline"
          size="sm"
          onClick={onCycleSpeed}
          className="gap-1 tabular-nums"
        >
          <FastForwardIcon className="size-3.5" />
          {speed}x
        </Button>
      </div>

      {/* Skip idle toggle */}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={skipIdle}
          onCheckedChange={onSkipIdleChange}
          size="sm"
        />
        Skip idle
      </label>
    </div>
  );
}
