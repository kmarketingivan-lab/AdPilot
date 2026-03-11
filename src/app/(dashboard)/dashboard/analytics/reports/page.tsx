"use client";

import { useState, useCallback } from "react";
import {
  FileDown,
  FileSpreadsheet,
  CalendarClock,
  Sparkles,
  Bell,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Loader2,
} from "lucide-react";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/analytics/date-range-picker";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function downloadBase64File(base64: string, filename: string, mime: string) {
  const byteChars = atob(base64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNums[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNums)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const INSIGHT_STYLES = {
  positive: {
    border: "border-green-500/30",
    bg: "bg-green-500/10",
    badge: "bg-green-500/20 text-green-400",
    icon: TrendingUp,
    iconColor: "text-green-400",
  },
  negative: {
    border: "border-red-500/30",
    bg: "bg-red-500/10",
    badge: "bg-red-500/20 text-red-400",
    icon: TrendingDown,
    iconColor: "text-red-400",
  },
  suggestion: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    badge: "bg-blue-500/20 text-blue-400",
    icon: Lightbulb,
    iconColor: "text-blue-400",
  },
} as const;

const METRIC_OPTIONS = [
  { value: "roas", label: "ROAS" },
  { value: "cpc", label: "CPC (€)" },
  { value: "ctr", label: "CTR (%)" },
  { value: "spend", label: "Spend (€)" },
  { value: "impressions", label: "Impressions" },
  { value: "conversions", label: "Conversions" },
] as const;

const OPERATOR_OPTIONS = [
  { value: "lt", label: "<" },
  { value: "gt", label: ">" },
  { value: "lte", label: "<=" },
  { value: "gte", label: ">=" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  // Date range state
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    start: startOfDay(subDays(new Date(), 29)),
    end: endOfDay(new Date()),
  });

  // Scheduled reports toggle
  const [isScheduled, setIsScheduled] = useState(false);

  // Alert dialog state
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [newAlertMetric, setNewAlertMetric] = useState("roas");
  const [newAlertOperator, setNewAlertOperator] = useState("lt");
  const [newAlertThreshold, setNewAlertThreshold] = useState("");

  // tRPC utils for refetching
  const utils = trpc.useUtils();

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const generatePdf = trpc.reports.generatePdf.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename, data.mimeType);
    },
  });

  const generateExcel = trpc.reports.generateExcel.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename, data.mimeType);
    },
  });

  const scheduleReport = trpc.reports.scheduleWeeklyReport.useMutation({
    onSuccess: () => setIsScheduled(true),
  });

  const cancelReport = trpc.reports.cancelScheduledReport.useMutation({
    onSuccess: () => setIsScheduled(false),
  });

  const createAlert = trpc.reports.createAlert.useMutation({
    onSuccess: () => {
      setAlertDialogOpen(false);
      setNewAlertThreshold("");
      utils.reports.getAlerts.invalidate();
    },
  });

  const deleteAlert = trpc.reports.deleteAlert.useMutation({
    onSuccess: () => {
      utils.reports.getAlerts.invalidate();
    },
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const insightsQuery = trpc.reports.getInsights.useQuery(
    {
      workspaceId,
      dateRange: { start: dateRange.start, end: dateRange.end },
    },
    { enabled: !!workspaceId },
  );

  const alertsQuery = trpc.reports.getAlerts.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleGeneratePdf = useCallback(() => {
    if (!workspaceId) return;
    generatePdf.mutate({
      workspaceId,
      dateRange: { start: dateRange.start, end: dateRange.end },
    });
  }, [workspaceId, dateRange, generatePdf]);

  const handleGenerateExcel = useCallback(() => {
    if (!workspaceId) return;
    generateExcel.mutate({
      workspaceId,
      dateRange: { start: dateRange.start, end: dateRange.end },
    });
  }, [workspaceId, dateRange, generateExcel]);

  const handleScheduleToggle = useCallback(
    (checked: boolean) => {
      if (!workspaceId) return;
      if (checked) {
        scheduleReport.mutate({ workspaceId });
      } else {
        cancelReport.mutate({ workspaceId });
      }
    },
    [workspaceId, scheduleReport, cancelReport],
  );

  const handleCreateAlert = useCallback(() => {
    if (!workspaceId || !newAlertThreshold) return;
    createAlert.mutate({
      workspaceId,
      metric: newAlertMetric as "roas" | "cpc" | "ctr" | "spend" | "impressions" | "conversions",
      operator: newAlertOperator as "lt" | "gt" | "lte" | "gte",
      threshold: parseFloat(newAlertThreshold),
    });
  }, [workspaceId, newAlertMetric, newAlertOperator, newAlertThreshold, createAlert]);

  const handleDeleteAlert = useCallback(
    (alertId: string) => {
      if (!workspaceId) return;
      deleteAlert.mutate({ workspaceId, alertId });
    },
    [workspaceId, deleteAlert],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Reports & Insights</h1>
        <p className="text-sm text-muted-foreground">
          Genera report, configura alert e scopri insight sulle tue campagne.
        </p>
      </div>

      {/* ---- Generate Report ---- */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileDown className="size-5 text-blue-400" />
            Generate Report
          </CardTitle>
          <CardDescription>
            Scarica un report PDF o Excel per il periodo selezionato.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker
              value={dateRange}
              onRangeChange={setDateRange}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleGeneratePdf}
                disabled={generatePdf.isPending || !workspaceId}
              >
                {generatePdf.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 size-4" />
                )}
                PDF
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerateExcel}
                disabled={generateExcel.isPending || !workspaceId}
              >
                {generateExcel.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 size-4" />
                )}
                Excel
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(dateRange.start, "dd MMM yyyy")} —{" "}
            {format(dateRange.end, "dd MMM yyyy")}
          </p>
        </CardContent>
      </Card>

      {/* ---- Scheduled Reports ---- */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="size-5 text-purple-400" />
            Scheduled Reports
          </CardTitle>
          <CardDescription>
            Ricevi automaticamente un report settimanale via email ogni lunedi
            alle 9:00.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3">
            <Switch
              checked={isScheduled}
              onCheckedChange={handleScheduleToggle}
              disabled={
                scheduleReport.isPending ||
                cancelReport.isPending ||
                !workspaceId
              }
            />
            <span className="text-sm">
              {isScheduled
                ? "Report settimanale attivo"
                : "Report settimanale disattivo"}
            </span>
            {isScheduled && (
              <Badge variant="secondary" className="ml-2">
                Ogni lunedi, 09:00
              </Badge>
            )}
          </label>
        </CardContent>
      </Card>

      {/* ---- AI Insights ---- */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-5 text-yellow-400" />
            AI Insights
          </CardTitle>
          <CardDescription>
            Analisi automatica delle performance delle tue campagne.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {insightsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Analisi in corso...
            </div>
          )}

          {insightsQuery.data && insightsQuery.data.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {insightsQuery.data.map((insight, i) => {
                const style = INSIGHT_STYLES[insight.type];
                const Icon = style.icon;
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-4 ${style.border} ${style.bg}`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Icon className={`size-4 ${style.iconColor}`} />
                      <span className="text-sm font-semibold">
                        {insight.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {insight.description}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {insightsQuery.data && insightsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nessun insight disponibile per il periodo selezionato.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---- Alerts ---- */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="size-5 text-orange-400" />
              Alerts
            </CardTitle>
            <CardDescription>
              Ricevi notifiche quando una metrica supera la soglia configurata.
            </CardDescription>
          </div>
          <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
            <DialogTrigger
              render={
                <Button size="sm" variant="outline" disabled={!workspaceId} />
              }
            >
              <Plus className="mr-1 size-4" />
              Add Alert
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Alert Rule</DialogTitle>
                <DialogDescription>
                  Configura una regola di alert su una metrica delle campagne.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Metric</label>
                  <Select
                    value={newAlertMetric}
                    onValueChange={(v) => v && setNewAlertMetric(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METRIC_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Condition</label>
                  <Select
                    value={newAlertOperator}
                    onValueChange={(v) => v && setNewAlertOperator(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATOR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Threshold</label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="e.g. 2"
                    value={newAlertThreshold}
                    onChange={(e) => setNewAlertThreshold(e.target.value)}
                  />
                </div>

                <Separator />

                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setAlertDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateAlert}
                    disabled={
                      createAlert.isPending || !newAlertThreshold
                    }
                  >
                    {createAlert.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Create Alert
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {alertsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading alerts...
            </div>
          )}

          {alertsQuery.data && alertsQuery.data.length > 0 && (
            <div className="space-y-2">
              {alertsQuery.data.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Bell className="size-4 text-orange-400" />
                    <div>
                      <p className="text-sm font-medium">{alert.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.metric.toUpperCase()} {alert.operator === "lt" ? "<" : alert.operator === "gt" ? ">" : alert.operator === "lte" ? "<=" : ">="}{" "}
                        {alert.threshold}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteAlert(alert.id)}
                    disabled={deleteAlert.isPending}
                  >
                    <Trash2 className="size-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {alertsQuery.data && alertsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nessun alert configurato. Clicca "Add Alert" per crearne uno.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
