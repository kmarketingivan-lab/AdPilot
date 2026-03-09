"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { MousePointerClickIcon } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────

interface ClickHeatmapProps {
  workspaceId: string;
  siteId: string;
  pageUrl?: string;
  startDate?: Date;
  endDate?: Date;
}

// ── Color gradient: blue → green → yellow → red ───────────────────────────

function densityColor(intensity: number): [number, number, number, number] {
  // intensity: 0 → 1
  const t = Math.min(1, Math.max(0, intensity));

  let r: number, g: number, b: number;

  if (t < 0.25) {
    // blue → cyan
    const s = t / 0.25;
    r = 0;
    g = Math.round(s * 255);
    b = 255;
  } else if (t < 0.5) {
    // cyan → green
    const s = (t - 0.25) / 0.25;
    r = 0;
    g = 255;
    b = Math.round((1 - s) * 255);
  } else if (t < 0.75) {
    // green → yellow
    const s = (t - 0.5) / 0.25;
    r = Math.round(s * 255);
    g = 255;
    b = 0;
  } else {
    // yellow → red
    const s = (t - 0.75) / 0.25;
    r = 255;
    g = Math.round((1 - s) * 255);
    b = 0;
  }

  const alpha = Math.round(100 + t * 155); // 100–255
  return [r, g, b, alpha];
}

// ── Grid-based aggregation ─────────────────────────────────────────────────

const GRID_COLS = 50;
const GRID_ROWS = 80;

function aggregateToGrid(
  points: Array<{ x: number; y: number }>,
  cols: number,
  rows: number
): number[][] {
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (const p of points) {
    const col = Math.min(cols - 1, Math.max(0, Math.floor((p.x / 100) * cols)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((p.y / 100) * rows)));
    grid[row][col]++;
  }

  return grid;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ClickHeatmap({
  workspaceId,
  siteId,
  pageUrl,
  startDate,
  endDate,
}: ClickHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    count: number;
  } | null>(null);

  const { data, isLoading } = trpc.heatmap.getClickData.useQuery(
    { workspaceId, siteId, pageUrl, startDate, endDate },
    { enabled: !!workspaceId && !!siteId }
  );

  // ── Draw heatmap ────────────────────────────────────────────────────────

  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data) return;

    const width = container.clientWidth;
    const height = 600;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = "rgba(0, 0, 0, 0.02)";
    ctx.fillRect(0, 0, width, height);

    if (data.points.length === 0) return;

    const grid = aggregateToGrid(data.points, GRID_COLS, GRID_ROWS);

    // Find max density
    let maxDensity = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (cell > maxDensity) maxDensity = cell;
      }
    }
    if (maxDensity === 0) return;

    const cellW = width / GRID_COLS;
    const cellH = height / GRID_ROWS;

    // Draw cells with gaussian blur effect
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const count = grid[row][col];
        if (count === 0) continue;

        const intensity = count / maxDensity;
        const [r, g, b, a] = densityColor(intensity);

        // Draw a radial gradient for each cell to create smooth heatmap
        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2;
        const radius = Math.max(cellW, cellH) * 1.5;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a / 255})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(
          cx - radius,
          cy - radius,
          radius * 2,
          radius * 2
        );
      }
    }
  }, [data]);

  useEffect(() => {
    drawHeatmap();
    window.addEventListener("resize", drawHeatmap);
    return () => window.removeEventListener("resize", drawHeatmap);
  }, [drawHeatmap]);

  // ── Hover tooltip ───────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !data || data.points.length === 0) {
        setTooltip(null);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;

      const col = Math.floor((x / width) * GRID_COLS);
      const row = Math.floor((y / height) * GRID_ROWS);

      const grid = aggregateToGrid(data.points, GRID_COLS, GRID_ROWS);

      if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
        const count = grid[row][col];
        if (count > 0) {
          setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, count });
        } else {
          setTooltip(null);
        }
      }
    },
    [data]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ── Render ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full rounded-lg" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <MousePointerClickIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Total clicks:</span>
          <span className="font-semibold tabular-nums">
            {data?.totalClicks ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rage clicks:</span>
          <span className="font-semibold tabular-nums text-red-600">
            {data?.rageClicks ?? 0}
          </span>
        </div>
      </div>

      {/* Heatmap canvas */}
      <div ref={containerRef} className="relative rounded-lg border bg-white dark:bg-gray-950 overflow-hidden">
        {(!data || data.points.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground">
            <MousePointerClickIcon className="size-12 mb-3 opacity-30" />
            <p className="text-sm">No click data available for this period.</p>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="block"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
            {tooltip && (
              <div
                className="pointer-events-none absolute rounded-md bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md border"
                style={{
                  left: tooltip.x + 12,
                  top: tooltip.y - 8,
                }}
              >
                {tooltip.count} click{tooltip.count !== 1 ? "s" : ""}
              </div>
            )}
          </>
        )}

        {/* Gradient legend */}
        {data && data.points.length > 0 && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-popover/90 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm border backdrop-blur-sm">
            <span>Low</span>
            <div
              className="h-2 w-20 rounded-sm"
              style={{
                background:
                  "linear-gradient(to right, rgba(0,0,255,0.6), rgba(0,255,0,0.6), rgba(255,255,0,0.7), rgba(255,0,0,0.8))",
              }}
            />
            <span>High</span>
          </div>
        )}
      </div>
    </div>
  );
}
