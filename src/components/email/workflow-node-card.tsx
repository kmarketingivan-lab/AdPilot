import { type MouseEvent as ReactMouseEvent } from "react";
import {
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import type { WorkflowNode } from "./workflow-editor";
import { getCatalogEntry } from "./workflow-editor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WorkflowNodeCardProps {
  node: WorkflowNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: ReactMouseEvent) => void;
  onDelete: (id: string) => void;
  onConnect: (fromId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getNodeSummary(node: WorkflowNode): string {
  switch (node.type) {
    case "trigger":
      return String(node.data.type ?? "");
    case "sendEmail":
      return String(node.data.subject ?? "No subject");
    case "wait":
      return `${node.data.amount ?? 1} ${node.data.unit ?? "hours"}`;
    case "condition":
      return `${node.data.field ?? "?"} ${node.data.operator ?? "?"} ${node.data.value ?? "?"}`;
    case "addTag":
      return String(node.data.tag ?? "");
    case "changeStage":
      return String(node.data.stage ?? "");
    case "webhook":
      return String(node.data.url ?? "");
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Node card component
// ---------------------------------------------------------------------------

export function WorkflowNodeCard({
  node,
  isSelected,
  onSelect,
  onDragStart,
  onDelete,
  onConnect,
}: WorkflowNodeCardProps) {
  const catalog = getCatalogEntry(node.type);
  const Icon = catalog.icon;

  const summary = getNodeSummary(node);

  return (
    <div
      role="button"
      aria-label={`${catalog.label} node: ${summary || "empty"}`}
      tabIndex={0}
      className={`absolute cursor-grab select-none rounded-lg border-2 p-3 shadow-sm transition-shadow hover:shadow-md ${catalog.bgColor} ${
        isSelected ? "ring-2 ring-primary ring-offset-2" : ""
      }`}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: 200,
        minHeight: 64,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(node.id);
        onDragStart(node.id, e);
      }}
    >
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${catalog.color}`}>
          <Icon className="size-3.5" />
          {catalog.label}
        </div>
        <div className="flex gap-1">
          <button
            className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
            title="Connect to next node"
            onClick={(e) => {
              e.stopPropagation();
              onConnect(node.id);
            }}
          >
            <PlusIcon className="size-3" />
          </button>
          {node.type !== "trigger" && (
            <button
              className="rounded p-0.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
              title="Delete node"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
            >
              <TrashIcon className="size-3" />
            </button>
          )}
        </div>
      </div>
      {summary && (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {summary}
        </p>
      )}
    </div>
  );
}
