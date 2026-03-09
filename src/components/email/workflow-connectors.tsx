import { useMemo } from "react";
import type { WorkflowNode } from "./workflow-editor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WorkflowConnectorsProps {
  nodes: WorkflowNode[];
}

// ---------------------------------------------------------------------------
// SVG connector lines between workflow nodes
// ---------------------------------------------------------------------------

export function WorkflowConnectors({ nodes }: WorkflowConnectorsProps) {
  const nodeMap = useMemo(() => {
    const m = new Map<string, WorkflowNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const lines: { from: WorkflowNode; to: WorkflowNode; isFalse?: boolean }[] =
    [];
  for (const node of nodes) {
    for (const nextId of node.nextNodes) {
      const target = nodeMap.get(nextId);
      if (target) lines.push({ from: node, to: target });
    }
    if (node.falseNode) {
      const target = nodeMap.get(node.falseNode);
      if (target) lines.push({ from: node, to: target, isFalse: true });
    }
  }

  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon
            points="0 0, 8 3, 0 6"
            fill="currentColor"
            className="text-muted-foreground"
          />
        </marker>
        <marker
          id="arrowhead-red"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
        </marker>
      </defs>
      {lines.map(({ from, to, isFalse }, i) => {
        const NODE_W = 200;
        const NODE_H = 64;
        const x1 = from.position.x + NODE_W / 2;
        const y1 = from.position.y + NODE_H;
        const x2 = to.position.x + NODE_W / 2;
        const y2 = to.position.y;

        const midY = (y1 + y2) / 2;

        return (
          <path
            key={`${from.id}-${to.id}-${i}`}
            d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
            fill="none"
            stroke={isFalse ? "#ef4444" : "currentColor"}
            strokeWidth={2}
            className={isFalse ? "" : "text-muted-foreground"}
            strokeDasharray={isFalse ? "5,5" : undefined}
            markerEnd={isFalse ? "url(#arrowhead-red)" : "url(#arrowhead)"}
          />
        );
      })}
    </svg>
  );
}
