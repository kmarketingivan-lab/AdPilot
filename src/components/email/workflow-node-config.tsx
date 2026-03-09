import { SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { WorkflowNode } from "./workflow-editor";
import { getCatalogEntry } from "./workflow-editor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WorkflowNodeConfigProps {
  node: WorkflowNode;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Node config panel
// ---------------------------------------------------------------------------

export function WorkflowNodeConfig({ node, onUpdate }: WorkflowNodeConfigProps) {
  const catalog = getCatalogEntry(node.type);
  const Icon = catalog.icon;

  return (
    <Card className="w-72 shrink-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <SettingsIcon className="size-4" />
          Configure {catalog.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {node.type === "trigger" && (
          <>
            <label className="text-xs font-medium">Trigger Type</label>
            <select
              aria-label="Trigger type"
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              value={String(node.data.type ?? "contactCreated")}
              onChange={(e) =>
                onUpdate(node.id, { ...node.data, type: e.target.value })
              }
            >
              <option value="contactCreated">Contact Created</option>
              <option value="formSubmitted">Form Submitted</option>
              <option value="tagAdded">Tag Added</option>
              <option value="stageChanged">Stage Changed</option>
              <option value="emailOpened">Email Opened</option>
            </select>
            {node.data.type === "tagAdded" && (
              <>
                <label className="text-xs font-medium">Tag</label>
                <Input
                  value={String(node.data.tag ?? "")}
                  onChange={(e) =>
                    onUpdate(node.id, { ...node.data, tag: e.target.value })
                  }
                  placeholder="e.g. newsletter"
                />
              </>
            )}
            {node.data.type === "stageChanged" && (
              <>
                <label className="text-xs font-medium">Stage</label>
                <select
                  aria-label="Trigger stage"
                  className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                  value={String(node.data.stage ?? "")}
                  onChange={(e) =>
                    onUpdate(node.id, { ...node.data, stage: e.target.value })
                  }
                >
                  <option value="">Any</option>
                  <option value="LEAD">Lead</option>
                  <option value="MQL">MQL</option>
                  <option value="SQL">SQL</option>
                  <option value="OPPORTUNITY">Opportunity</option>
                  <option value="CUSTOMER">Customer</option>
                </select>
              </>
            )}
          </>
        )}

        {node.type === "sendEmail" && (
          <>
            <label className="text-xs font-medium">Subject</label>
            <Input
              value={String(node.data.subject ?? "")}
              onChange={(e) =>
                onUpdate(node.id, { ...node.data, subject: e.target.value })
              }
              placeholder="Email subject line"
            />
            <label className="text-xs font-medium">HTML Content</label>
            <textarea
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              rows={4}
              value={String(node.data.htmlContent ?? "")}
              onChange={(e) =>
                onUpdate(node.id, {
                  ...node.data,
                  htmlContent: e.target.value,
                })
              }
              placeholder="<p>Hello {{firstName}}!</p>"
            />
          </>
        )}

        {node.type === "wait" && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium">Amount</label>
              <Input
                type="number"
                min={1}
                value={Number(node.data.amount ?? 1)}
                onChange={(e) =>
                  onUpdate(node.id, {
                    ...node.data,
                    amount: parseInt(e.target.value) || 1,
                  })
                }
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium">Unit</label>
              <select
                aria-label="Wait unit"
                className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                value={String(node.data.unit ?? "hours")}
                onChange={(e) =>
                  onUpdate(node.id, { ...node.data, unit: e.target.value })
                }
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </div>
        )}

        {node.type === "condition" && (
          <>
            <label className="text-xs font-medium">Field</label>
            <select
              aria-label="Condition field"
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              value={String(node.data.field ?? "")}
              onChange={(e) =>
                onUpdate(node.id, { ...node.data, field: e.target.value })
              }
            >
              <option value="">Select field...</option>
              <option value="tags">Tags</option>
              <option value="stage">Stage</option>
              <option value="score">Score</option>
              <option value="source">Source</option>
              <option value="company">Company</option>
            </select>
            <label className="text-xs font-medium">Operator</label>
            <select
              aria-label="Condition operator"
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              value={String(node.data.operator ?? "equals")}
              onChange={(e) =>
                onUpdate(node.id, { ...node.data, operator: e.target.value })
              }
            >
              <option value="equals">Equals</option>
              <option value="not_equals">Not Equals</option>
              <option value="contains">Contains</option>
              <option value="not_contains">Not Contains</option>
              <option value="greater_than">Greater Than</option>
              <option value="less_than">Less Than</option>
              <option value="is_set">Is Set</option>
              <option value="is_not_set">Is Not Set</option>
            </select>
            <label className="text-xs font-medium">Value</label>
            <Input
              value={String(node.data.value ?? "")}
              onChange={(e) =>
                onUpdate(node.id, { ...node.data, value: e.target.value })
              }
              placeholder="Value to compare"
            />
          </>
        )}

        {node.type === "addTag" && (
          <>
            <label className="text-xs font-medium">Tag Name</label>
            <Input
              value={String(node.data.tag ?? "")}
              onChange={(e) =>
                onUpdate(node.id, { ...node.data, tag: e.target.value })
              }
              placeholder="e.g. engaged"
            />
          </>
        )}

        {node.type === "changeStage" && (
          <>
            <label className="text-xs font-medium">New Stage</label>
            <select
              aria-label="New stage"
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              value={String(node.data.stage ?? "MQL")}
              onChange={(e) =>
                onUpdate(node.id, { ...node.data, stage: e.target.value })
              }
            >
              <option value="LEAD">Lead</option>
              <option value="MQL">MQL</option>
              <option value="SQL">SQL</option>
              <option value="OPPORTUNITY">Opportunity</option>
              <option value="CUSTOMER">Customer</option>
              <option value="LOST">Lost</option>
            </select>
          </>
        )}

        {node.type === "webhook" && (
          <>
            <label className="text-xs font-medium">URL</label>
            <Input
              value={String(node.data.url ?? "")}
              onChange={(e) =>
                onUpdate(node.id, { ...node.data, url: e.target.value })
              }
              placeholder="https://..."
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
