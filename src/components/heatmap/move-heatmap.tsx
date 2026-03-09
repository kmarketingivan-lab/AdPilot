"use client";

import { useRef, useEffect, useCallback } from "react";
import { MoveIcon } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────

interface MoveHeatmapProps {
  workspaceId: string;
  siteId: string;
  pageUrl?: string;
  startDate?: Date;
  endDate?: Date;
}

// ── Grid-based aggregation (same as click heatmap) ─────────────────────────

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

// ── Color gradient for movement: purple → blue → cyan ─────────────────────

function moveColor(intensity: number): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, intensity));

  let r: number, g: number, b: number;

  if (t < 0.33) {
    // purple → blue
    const s = t / 0.33;
    r = Math.round((1 - s) * 128);
    g = 0;
    b = Math.round(128 + s * 127);
  } else if (t < 0.66) {
    // blue → cyan
    const s = (t - 0.33) / 0.33;
    r = 0;
    g = Math.round(s * 255);
    b = 255;
  } else {
    // cyan → white
    const s = (t - 0.66) / 0.34;
    r = Math.round(s * 255);
    g = 255;
    b = 255;
  }

  const alpha = Math.round(80 + t * 175);
  return [r, g, b, alpha];
}

// ── Component ──────────────────────────────────────────────────────────────

export function MoveHeatmap({
  workspaceId,
  siteId,
  pageUrl,
  startDate,
  endDate,
}: MoveHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = trpc.heatmap.getMoveData.useQuery(
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

    // Dark background for movement heatmap
    ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
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

    // Draw cells with radial gradients
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const count = grid[row][col];
        if (count === 0) continue;

        const intensity = count / maxDensity;
        const [r, g, b, a] = moveColor(intensity);

        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2;
        const radius = Math.max(cellW, cellH) * 1.5;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a / 255})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }
    }
  }, [data]);

  useEffect(() => {
    drawHeatmap();
    window.addEventListener("resize", drawHeatmap);
    return () => window.removeEventListener("resize", drawHeatmap);
  }, [drawHeatmap]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full rounded-lg" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <MoveIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Total move points:</span>
          <span className="font-semibold tabular-nums">
            {data?.totalMoves ?? 0}
          </span>
        </div>
      </div>

      {/* Heatmap canvas */}
      <div
        ref={containerRef}
        className="relative rounded-lg border bg-white dark:bg-gray-950 overflow-hidden"
      >
        {(!data || data.points.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground">
            <MoveIcon className="size-12 mb-3 opacity-30" />
            <p className="text-sm">No movement data available for this period.</p>
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block" />

            {/* Gradient legend */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-popover/90 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm border backdrop-blur-sm">
              <span>Low</span>
              <div
                className="h-2 w-20 rounded-sm"
                style={{
                  background:
                    "linear-gradient(to right, rgba(128,0,255,0.4), rgba(0,0,255,0.6), rgba(0,255,255,0.7), rgba(255,255,255,0.8))",
                }}
              />
              <span>High</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
