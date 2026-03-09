"use client";

import { useState } from "react";
import {
  ShieldIcon,
  TrashIcon,
  DownloadIcon,
  CheckCircleIcon,
} from "lucide-react";

import { trpc } from "@/lib/trpc/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// ── Types ────────────────────────────────────────────────────────────────────

interface PrivacySettingsProps {
  workspaceId: string;
}

const RETENTION_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function PrivacySettings({ workspaceId }: PrivacySettingsProps) {
  const [retentionDays, setRetentionDays] = useState("90");
  const [exportEmail, setExportEmail] = useState("");
  const [deleteResult, setDeleteResult] = useState<number | null>(null);

  const deleteMutation = trpc.heatmap.deleteExpiredSessions.useMutation({
    onSuccess: (data) => {
      setDeleteResult(data.deleted);
    },
  });

  const exportQuery = trpc.heatmap.exportUserData.useQuery(
    { workspaceId, email: exportEmail },
    { enabled: false }
  );

  const handleApplyRetention = () => {
    const days = parseInt(retentionDays, 10);
    if (!isNaN(days) && days >= 1) {
      setDeleteResult(null);
      deleteMutation.mutate({ workspaceId, retentionDays: days });
    }
  };

  const handleExport = async () => {
    if (!exportEmail) return;
    const result = await exportQuery.refetch();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `heatmap-export-${exportEmail}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Data retention */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldIcon className="size-4 text-muted-foreground" />
            Data Retention Policy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Automatically delete heatmap sessions older than the configured
            retention period. This helps comply with GDPR data minimization
            requirements.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="retention-period" className="text-sm">
                Retention period
              </Label>
              <Select
                value={retentionDays}
                onValueChange={(v) => {
                  if (v) {
                    setRetentionDays(v);
                    setDeleteResult(null);
                  }
                }}
              >
                <SelectTrigger id="retention-period" className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyRetention}
              disabled={deleteMutation.isPending}
            >
              <TrashIcon className="size-3.5" />
              {deleteMutation.isPending
                ? "Deleting..."
                : "Apply & Delete Expired"}
            </Button>

            {deleteResult !== null && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircleIcon className="size-3.5" />
                {deleteResult} session{deleteResult !== 1 ? "s" : ""} deleted
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* GDPR Export */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DownloadIcon className="size-4 text-muted-foreground" />
            GDPR Data Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Export all heatmap tracking data associated with a specific email
            address. Use this to fulfill GDPR data portability requests
            (Article 20).
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-email" className="text-sm">
                Email address
              </Label>
              <Input
                id="export-email"
                type="email"
                value={exportEmail}
                onChange={(e) => setExportEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-[280px]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!exportEmail || exportQuery.isFetching}
            >
              <DownloadIcon className="size-3.5" />
              {exportQuery.isFetching ? "Exporting..." : "Export Data"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cookie-free info */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldIcon className="size-4 text-muted-foreground" />
            Cookie-Free Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The heatmap tracking script uses <code className="rounded bg-muted px-1 py-0.5 text-xs">sessionStorage</code> exclusively
            for visitor identification. No cookies are set, and all client-side
            data is discarded when the browser tab is closed. This approach
            complies with the ePrivacy Directive and does not require cookie
            consent banners for tracking functionality.
          </p>
          <div className="mt-3 text-xs text-muted-foreground">
            <strong>Auto-masked elements:</strong> Password inputs, credit card
            fields, and any element with the{" "}
            <code className="rounded bg-muted px-1 py-0.5">data-hm-mask</code>{" "}
            attribute are automatically excluded from recording.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
