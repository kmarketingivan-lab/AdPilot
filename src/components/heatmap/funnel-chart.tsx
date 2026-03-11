"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunnelStep {
  /** Page path or label for this step (e.g. "/pricing") */
  label: string;
  /** Number of visitors who reached this step */
  count: number;
}

export interface FunnelChartProps {
  steps: FunnelStep[];
  title?: string;
  className?: string;
}

export interface SankeyNode {
  id: string;
  label: string;
  count: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyFlowProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  title?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Funnel Chart
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function getBarColor(index: number, total: number): string {
  // Gradient from primary to muted as we go down the funnel
  const colors = [
    "bg-primary",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-purple-500",
    "bg-fuchsia-500",
    "bg-pink-500",
    "bg-rose-500",
  ];
  return colors[index % colors.length];
}

export function FunnelChart({ steps, title, className }: FunnelChartProps) {
  const maxCount = steps.length > 0 ? steps[0].count : 1;

  const stepsWithMetrics = useMemo(() => {
    return steps.map((step, i) => {
      const prevCount = i > 0 ? steps[i - 1].count : step.count;
      const dropOff = prevCount - step.count;
      const conversionRate =
        prevCount > 0 ? (step.count / prevCount) * 100 : 100;
      const overallRate =
        maxCount > 0 ? (step.count / maxCount) * 100 : 100;
      const barWidth = maxCount > 0 ? (step.count / maxCount) * 100 : 0;

      return {
        ...step,
        dropOff,
        conversionRate,
        overallRate,
        barWidth,
      };
    });
  }, [steps, maxCount]);

  if (steps.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title ?? "Conversion Funnel"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No funnel steps defined. Add pages to create a funnel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title ?? "Conversion Funnel"}</CardTitle>
          <Badge variant="outline" className="tabular-nums text-xs">
            {steps.length} steps
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {stepsWithMetrics.map((step, i) => (
            <div key={step.label} className="group">
              {/* Step row */}
              <div className="flex items-center gap-4 py-2">
                {/* Step number */}
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {i + 1}
                </div>

                {/* Bar and label */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{step.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatNumber(step.count)}
                      </span>
                      <Badge
                        variant={step.overallRate >= 50 ? "secondary" : "outline"}
                        className="tabular-nums text-xs"
                      >
                        {step.overallRate.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="relative h-8 w-full overflow-hidden rounded bg-muted">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded transition-all duration-500",
                        getBarColor(i, steps.length),
                      )}
                      style={{
                        width: `${Math.max(step.barWidth, 2)}%`,
                        opacity: 0.85,
                      }}
                    />
                    {/* Visitor count inside bar */}
                    <div className="absolute inset-0 flex items-center px-3">
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          step.barWidth > 20
                            ? "text-white"
                            : "text-foreground",
                        )}
                      >
                        {formatNumber(step.count)} visitors
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drop-off indicator between steps */}
              {i < stepsWithMetrics.length - 1 && (
                <div className="ml-11 flex items-center gap-2 py-1 text-xs text-muted-foreground">
                  <svg
                    width="12"
                    height="16"
                    viewBox="0 0 12 16"
                    fill="none"
                    className="shrink-0 text-muted-foreground/50"
                  >
                    <path
                      d="M6 0V12M6 12L2 8M6 12L10 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>
                    {formatNumber(step.dropOff)} dropped off
                    {" "}
                    <span className="font-medium">
                      ({step.conversionRate.toFixed(1)}% conversion)
                    </span>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Summary */}
        {steps.length >= 2 && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <span className="text-sm text-muted-foreground">
              Overall conversion rate
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {stepsWithMetrics[stepsWithMetrics.length - 1].overallRate.toFixed(
                1,
              )}
              %
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sankey Flow Diagram (simplified SVG)
// ---------------------------------------------------------------------------

const SANKEY_NODE_WIDTH = 20;
const SANKEY_PADDING = 40;

export function SankeyFlow({
  nodes,
  links,
  title,
  className,
}: SankeyFlowProps) {
  const layout = useMemo(() => {
    if (nodes.length === 0) return null;

    const width = 700;
    const height = 400;
    const innerWidth = width - SANKEY_PADDING * 2;
    const innerHeight = height - SANKEY_PADDING * 2;

    // Group nodes into columns based on link structure
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const outLinks = new Map<string, SankeyLink[]>();
    const inLinks = new Map<string, SankeyLink[]>();

    for (const link of links) {
      if (!outLinks.has(link.source)) outLinks.set(link.source, []);
      outLinks.get(link.source)!.push(link);
      if (!inLinks.has(link.target)) inLinks.set(link.target, []);
      inLinks.get(link.target)!.push(link);
    }

    // Determine columns by traversal depth
    const depths = new Map<string, number>();
    const visited = new Set<string>();

    // Nodes with no incoming links start at depth 0
    const roots = nodes.filter(
      (n) => !inLinks.has(n.id) || inLinks.get(n.id)!.length === 0,
    );

    function assignDepth(nodeId: string, depth: number) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      depths.set(nodeId, Math.max(depths.get(nodeId) ?? 0, depth));
      const out = outLinks.get(nodeId) ?? [];
      for (const link of out) {
        assignDepth(link.target, depth + 1);
      }
    }

    for (const root of roots) {
      assignDepth(root.id, 0);
    }

    // Any unvisited nodes get depth 0
    for (const node of nodes) {
      if (!depths.has(node.id)) {
        depths.set(node.id, 0);
      }
    }

    const maxDepth = Math.max(...depths.values(), 0);
    const columnCount = maxDepth + 1;

    // Group by column
    const columns: string[][] = Array.from({ length: columnCount }, () => []);
    for (const [nodeId, depth] of depths) {
      columns[depth].push(nodeId);
    }

    // Position nodes
    const nodePositions = new Map<
      string,
      { x: number; y: number; height: number }
    >();

    for (let col = 0; col < columnCount; col++) {
      const colNodes = columns[col];
      const totalCount = colNodes.reduce(
        (sum, id) => sum + (nodeMap.get(id)?.count ?? 0),
        0,
      );
      const x =
        SANKEY_PADDING +
        (columnCount > 1 ? (col / (columnCount - 1)) * (innerWidth - SANKEY_NODE_WIDTH) : 0);

      let yOffset = SANKEY_PADDING;
      const availableHeight =
        innerHeight - (colNodes.length - 1) * 8; // 8px gap between nodes

      for (const nodeId of colNodes) {
        const node = nodeMap.get(nodeId)!;
        const nodeHeight = totalCount > 0
          ? Math.max((node.count / totalCount) * availableHeight, 20)
          : 40;

        nodePositions.set(nodeId, {
          x,
          y: yOffset,
          height: nodeHeight,
        });
        yOffset += nodeHeight + 8;
      }
    }

    // Build link paths
    const linkPaths = links.map((link) => {
      const sourcePos = nodePositions.get(link.source);
      const targetPos = nodePositions.get(link.target);
      if (!sourcePos || !targetPos) return null;

      const sourceNode = nodeMap.get(link.source);
      const targetNode = nodeMap.get(link.target);
      if (!sourceNode || !targetNode) return null;

      // Compute link thickness proportional to value
      const sourceTotal = (outLinks.get(link.source) ?? []).reduce(
        (s, l) => s + l.value,
        0,
      );
      const linkThickness = sourceTotal > 0
        ? Math.max((link.value / sourceTotal) * sourcePos.height, 4)
        : 4;

      // Calculate vertical offset for this link at source
      const sourceLinks = outLinks.get(link.source) ?? [];
      let sourceOffset = 0;
      for (const sl of sourceLinks) {
        if (sl.target === link.target) break;
        const t = sourceTotal > 0
          ? (sl.value / sourceTotal) * sourcePos.height
          : 4;
        sourceOffset += t;
      }

      // Calculate vertical offset for this link at target
      const targetLinks = inLinks.get(link.target) ?? [];
      const targetTotal = targetLinks.reduce((s, l) => s + l.value, 0);
      let targetOffset = 0;
      for (const tl of targetLinks) {
        if (tl.source === link.source) break;
        const t = targetTotal > 0
          ? (tl.value / targetTotal) * targetPos.height
          : 4;
        targetOffset += t;
      }

      const targetThickness = targetTotal > 0
        ? Math.max((link.value / targetTotal) * targetPos.height, 4)
        : 4;

      const x0 = sourcePos.x + SANKEY_NODE_WIDTH;
      const y0 = sourcePos.y + sourceOffset;
      const x1 = targetPos.x;
      const y1 = targetPos.y + targetOffset;
      const midX = (x0 + x1) / 2;

      const path = `
        M ${x0} ${y0}
        C ${midX} ${y0}, ${midX} ${y1}, ${x1} ${y1}
        L ${x1} ${y1 + targetThickness}
        C ${midX} ${y1 + targetThickness}, ${midX} ${y0 + linkThickness}, ${x0} ${y0 + linkThickness}
        Z
      `;

      return {
        path,
        value: link.value,
        source: sourceNode.label,
        target: targetNode.label,
      };
    });

    // Colors for nodes
    const nodeColors = [
      "#3b82f6",
      "#6366f1",
      "#8b5cf6",
      "#a855f7",
      "#d946ef",
      "#ec4899",
      "#f43f5e",
      "#10b981",
    ];

    const nodeRects = Array.from(nodePositions.entries()).map(
      ([nodeId, pos], idx) => {
        const node = nodeMap.get(nodeId)!;
        return {
          ...pos,
          id: nodeId,
          label: node.label,
          count: node.count,
          color: nodeColors[idx % nodeColors.length],
        };
      },
    );

    return { width, height, linkPaths, nodeRects };
  }, [nodes, links]);

  if (!layout || nodes.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title ?? "User Flow"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No flow data available. Add tracked pages to visualize user paths.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title ?? "User Flow"}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="w-full"
            style={{ minWidth: 500 }}
          >
            {/* Links */}
            {layout.linkPaths.map(
              (lp, i) =>
                lp && (
                  <g key={`link-${i}`}>
                    <path
                      d={lp.path}
                      fill="currentColor"
                      className="text-primary/10 transition-colors hover:text-primary/25"
                    />
                    <title>
                      {lp.source} → {lp.target}: {formatNumber(lp.value)}
                    </title>
                  </g>
                ),
            )}

            {/* Nodes */}
            {layout.nodeRects.map((node) => (
              <g key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={SANKEY_NODE_WIDTH}
                  height={node.height}
                  rx={4}
                  fill={node.color}
                  className="transition-opacity hover:opacity-80"
                />
                {/* Label */}
                <text
                  x={node.x + SANKEY_NODE_WIDTH + 6}
                  y={node.y + node.height / 2}
                  dominantBaseline="middle"
                  className="fill-foreground text-xs"
                >
                  {node.label}
                </text>
                {/* Count */}
                <text
                  x={node.x + SANKEY_NODE_WIDTH + 6}
                  y={node.y + node.height / 2 + 14}
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatNumber(node.count)}
                </text>
                <title>
                  {node.label}: {formatNumber(node.count)}
                </title>
              </g>
            ))}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
