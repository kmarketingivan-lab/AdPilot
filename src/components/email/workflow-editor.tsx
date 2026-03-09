"use client";

import {
  useState,
  useCallback,
  useRef,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type DragEvent,
} from "react";
import {
  PlayIcon,
  MailIcon,
  ClockIcon,
  TagIcon,
  GitBranchIcon,
  GlobeIcon,
  ArrowRightIcon,
  PlusIcon,
  SaveIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { WorkflowNodeCard } from "./workflow-node-card";
import { WorkflowNodeConfig } from "./workflow-node-config";
import { WorkflowConnectors } from "./workflow-connectors";

// ---------------------------------------------------------------------------
// Types (matches automation-engine.ts)
// ---------------------------------------------------------------------------

export type NodeType =
  | "trigger"
  | "condition"
  | "sendEmail"
  | "wait"
  | "addTag"
  | "changeStage"
  | "webhook";

export interface WorkflowNode {
  id: string;
  type: NodeType;
  data: Record<string, unknown>;
  nextNodes: string[];
  falseNode?: string;
  position: { x: number; y: number };
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  entryNodeId: string;
}

// ---------------------------------------------------------------------------
// Node catalog
// ---------------------------------------------------------------------------

export interface NodeCatalogEntry {
  type: NodeType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  defaultData: Record<string, unknown>;
}

const NODE_CATALOG: NodeCatalogEntry[] = [
  {
    type: "trigger",
    label: "Trigger",
    icon: PlayIcon,
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700",
    defaultData: { type: "contactCreated" },
  },
  {
    type: "sendEmail",
    label: "Send Email",
    icon: MailIcon,
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700",
    defaultData: { subject: "", htmlContent: "" },
  },
  {
    type: "wait",
    label: "Wait",
    icon: ClockIcon,
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700",
    defaultData: { amount: 1, unit: "hours" },
  },
  {
    type: "condition",
    label: "Condition",
    icon: GitBranchIcon,
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-50 border-purple-300 dark:bg-purple-950 dark:border-purple-700",
    defaultData: { field: "", operator: "equals", value: "" },
  },
  {
    type: "addTag",
    label: "Add Tag",
    icon: TagIcon,
    color: "text-teal-700 dark:text-teal-400",
    bgColor: "bg-teal-50 border-teal-300 dark:bg-teal-950 dark:border-teal-700",
    defaultData: { tag: "" },
  },
  {
    type: "changeStage",
    label: "Change Stage",
    icon: ArrowRightIcon,
    color: "text-orange-700 dark:text-orange-400",
    bgColor: "bg-orange-50 border-orange-300 dark:bg-orange-950 dark:border-orange-700",
    defaultData: { stage: "MQL" },
  },
  {
    type: "webhook",
    label: "Webhook",
    icon: GlobeIcon,
    color: "text-rose-700 dark:text-rose-400",
    bgColor: "bg-rose-50 border-rose-300 dark:bg-rose-950 dark:border-rose-700",
    defaultData: { url: "", method: "POST" },
  },
];

export function getCatalogEntry(type: NodeType): NodeCatalogEntry {
  return NODE_CATALOG.find((n) => n.type === type) ?? NODE_CATALOG[0];
}

// ---------------------------------------------------------------------------
// Unique ID generator
// ---------------------------------------------------------------------------

let _idCounter = 0;
function newNodeId(): string {
  _idCounter += 1;
  return `node_${Date.now()}_${_idCounter}`;
}

// ---------------------------------------------------------------------------
// Main Workflow Editor
// ---------------------------------------------------------------------------

export interface WorkflowEditorProps {
  /** Initial workflow definition (for editing existing) */
  initialWorkflow?: WorkflowDefinition;
  /** Called when the user clicks Save */
  onSave?: (workflow: WorkflowDefinition) => void;
  /** Whether save is in progress */
  isSaving?: boolean;
}

export function WorkflowEditor({
  initialWorkflow,
  onSave,
  isSaving,
}: WorkflowEditorProps) {
  // State
  const [nodes, setNodes] = useState<WorkflowNode[]>(
    initialWorkflow?.nodes ?? [
      {
        id: "trigger_start",
        type: "trigger",
        data: { type: "contactCreated" },
        nextNodes: [],
        position: { x: 300, y: 40 },
      },
    ],
  );
  const [entryNodeId] = useState(
    initialWorkflow?.entryNodeId ?? "trigger_start",
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);

  // Dragging state
  const dragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    nodeStartX: number;
    nodeStartY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Selected node
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  // -----------------------------------------------------------------------
  // Node operations
  // -----------------------------------------------------------------------

  const handleDragStart = useCallback(
    (nodeId: string, e: ReactMouseEvent) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      dragRef.current = {
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        nodeStartX: node.position.x,
        nodeStartY: node.position.y,
      };

      const handleMove = (me: globalThis.MouseEvent) => {
        if (!dragRef.current) return;
        const dx = me.clientX - dragRef.current.startX;
        const dy = me.clientY - dragRef.current.startY;

        setNodes((prev) =>
          prev.map((n) =>
            n.id === dragRef.current!.nodeId
              ? {
                  ...n,
                  position: {
                    x: Math.max(0, dragRef.current!.nodeStartX + dx),
                    y: Math.max(0, dragRef.current!.nodeStartY + dy),
                  },
                }
              : n,
          ),
        );
      };

      const handleUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [nodes],
  );

  const handleDeleteNode = useCallback((id: string) => {
    setNodes((prev) => {
      const filtered = prev.filter((n) => n.id !== id);
      // Remove all references to deleted node
      return filtered.map((n) => ({
        ...n,
        nextNodes: n.nextNodes.filter((nid) => nid !== id),
        falseNode: n.falseNode === id ? undefined : n.falseNode,
      }));
    });
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, []);

  const handleConnect = useCallback(
    (fromId: string) => {
      if (connectingFromId === null) {
        setConnectingFromId(fromId);
      } else if (connectingFromId !== fromId) {
        // Complete connection
        setNodes((prev) =>
          prev.map((n) =>
            n.id === connectingFromId
              ? {
                  ...n,
                  nextNodes: n.nextNodes.includes(fromId)
                    ? n.nextNodes
                    : [...n.nextNodes, fromId],
                }
              : n,
          ),
        );
        setConnectingFromId(null);
      } else {
        // Clicked same node — cancel
        setConnectingFromId(null);
      }
    },
    [connectingFromId],
  );

  const handleUpdateNodeData = useCallback(
    (id: string, data: Record<string, unknown>) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, data } : n)),
      );
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Drop handler for palette items
  // -----------------------------------------------------------------------

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData("nodeType") as NodeType;
    if (!nodeType) return;

    const catalog = getCatalogEntry(nodeType);
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 100;
    const y = rect ? e.clientY - rect.top : 100;

    const newNode: WorkflowNode = {
      id: newNodeId(),
      type: nodeType,
      data: { ...catalog.defaultData },
      nextNodes: [],
      position: { x: Math.max(0, x - 100), y: Math.max(0, y - 32) },
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------

  const handleSave = useCallback(() => {
    const workflow: WorkflowDefinition = {
      nodes,
      entryNodeId,
    };
    onSave?.(workflow);
  }, [nodes, entryNodeId, onSave]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex h-full gap-4">
      {/* Left sidebar: Node palette */}
      <div className="w-48 shrink-0 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Drag to add
        </p>
        {NODE_CATALOG.map((entry) => {
          const Icon = entry.icon;
          return (
            <div
              key={entry.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("nodeType", entry.type);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`flex cursor-grab items-center gap-2 rounded-md border p-2 text-sm transition-colors hover:shadow-sm ${entry.bgColor}`}
            >
              <Icon className={`size-4 ${entry.color}`} />
              <span className="font-medium">{entry.label}</span>
            </div>
          );
        })}

        <div className="pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full"
            size="sm"
          >
            <SaveIcon className="mr-1.5 size-3.5" />
            {isSaving ? "Saving..." : "Save Workflow"}
          </Button>
        </div>

        {connectingFromId && (
          <p className="rounded border border-primary/30 bg-primary/5 p-2 text-xs text-primary">
            Click the{" "}
            <PlusIcon className="inline size-3" /> button on the
            target node to complete the connection. Click the same node to
            cancel.
          </p>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative flex-1 overflow-auto rounded-lg border bg-muted/30"
        style={{ minHeight: 500 }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => {
          setSelectedNodeId(null);
          setConnectingFromId(null);
        }}
      >
        <WorkflowConnectors nodes={nodes} />

        {nodes.map((node) => (
          <WorkflowNodeCard
            key={node.id}
            node={node}
            isSelected={node.id === selectedNodeId}
            onSelect={setSelectedNodeId}
            onDragStart={handleDragStart}
            onDelete={handleDeleteNode}
            onConnect={handleConnect}
          />
        ))}

        {nodes.length <= 1 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Drag nodes from the palette to build your workflow
            </p>
          </div>
        )}
      </div>

      {/* Right sidebar: Node config */}
      {selectedNode && (
        <WorkflowNodeConfig node={selectedNode} onUpdate={handleUpdateNodeData} />
      )}
    </div>
  );
}
