"use client";

import { useState, useCallback, useMemo } from "react";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  differenceInDays,
  subMonths,
} from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateRangeValue {
  start: Date;
  end: Date;
  compareStart?: Date;
  compareEnd?: Date;
}

interface DateRangePickerProps {
  value?: DateRangeValue;
  onRangeChange: (range: DateRangeValue) => void;
  className?: string;
}

type PresetKey =
  | "today"
  | "last7"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "custom";

interface Preset {
  key: PresetKey;
  label: string;
  range: () => { start: Date; end: Date };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS: Preset[] = [
  {
    key: "today",
    label: "Today",
    range: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }),
  },
  {
    key: "last7",
    label: "Last 7 days",
    range: () => ({
      start: startOfDay(subDays(new Date(), 6)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last30",
    label: "Last 30 days",
    range: () => ({
      start: startOfDay(subDays(new Date(), 29)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last90",
    label: "Last 90 days",
    range: () => ({
      start: startOfDay(subDays(new Date(), 89)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "thisMonth",
    label: "This month",
    range: () => ({
      start: startOfMonth(new Date()),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "lastMonth",
    label: "Last month",
    range: () => {
      const prev = subMonths(new Date(), 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeComparisonRange(start: Date, end: Date) {
  const days = differenceInDays(end, start);
  const compareEnd = subDays(start, 1);
  const compareStart = subDays(compareEnd, days);
  return { compareStart: startOfDay(compareStart), compareEnd: endOfDay(compareEnd) };
}

function formatRangeLabel(start: Date, end: Date): string {
  if (format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
    return format(start, "MMM d, yyyy");
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
  }
  return `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DateRangePicker({
  value,
  onRangeChange,
  className,
}: DateRangePickerProps) {
  const defaultRange = PRESETS[2].range(); // Last 30 days
  const [activePreset, setActivePreset] = useState<PresetKey>("last30");
  const [compare, setCompare] = useState(false);
  const [open, setOpen] = useState(false);

  const [selectedRange, setSelectedRange] = useState<{ start: Date; end: Date }>(
    value ? { start: value.start, end: value.end } : defaultRange,
  );

  // Calendar controlled value (DateRange from react-day-picker)
  const calendarRange: DateRange = useMemo(
    () => ({ from: selectedRange.start, to: selectedRange.end }),
    [selectedRange],
  );

  const handlePresetClick = useCallback((preset: Preset) => {
    const r = preset.range();
    setSelectedRange(r);
    setActivePreset(preset.key);
  }, []);

  const handleCalendarSelect = useCallback((range: DateRange | undefined) => {
    if (range?.from) {
      setSelectedRange({
        start: startOfDay(range.from),
        end: range.to ? endOfDay(range.to) : endOfDay(range.from),
      });
      setActivePreset("custom");
    }
  }, []);

  const handleApply = useCallback(() => {
    const result: DateRangeValue = {
      start: selectedRange.start,
      end: selectedRange.end,
    };
    if (compare) {
      const comp = computeComparisonRange(selectedRange.start, selectedRange.end);
      result.compareStart = comp.compareStart;
      result.compareEnd = comp.compareEnd;
    }
    onRangeChange(result);
    setOpen(false);
  }, [selectedRange, compare, onRangeChange]);

  const displayLabel = formatRangeLabel(selectedRange.start, selectedRange.end);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "h-9 justify-start gap-2 px-3 text-sm font-normal",
              className,
            )}
          />
        }
      >
        <CalendarIcon className="size-4 text-muted-foreground" />
        <span>{displayLabel}</span>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="flex w-auto max-w-none flex-col gap-0 p-0 sm:flex-row"
      >
        {/* Preset sidebar */}
        <div className="flex flex-col gap-1 border-b p-3 sm:w-40 sm:border-b-0 sm:border-r">
          {PRESETS.map((preset) => (
            <Button
              key={preset.key}
              variant={activePreset === preset.key ? "secondary" : "ghost"}
              size="sm"
              className="justify-start"
              onClick={() => handlePresetClick(preset)}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant={activePreset === "custom" ? "secondary" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => setActivePreset("custom")}
          >
            Custom
          </Button>
        </div>

        {/* Calendar + controls */}
        <div className="flex flex-col">
          <div className="p-3">
            <Calendar
              mode="range"
              selected={calendarRange}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4 p-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={compare}
                onCheckedChange={setCompare}
                size="sm"
              />
              Compare with previous period
            </label>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleApply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
