"use client";

import { PostStatus, WorkspaceRole } from "@prisma/client";
import {
  Send,
  CheckCircle2,
  XCircle,
  Calendar,
  Rocket,
  Ban,
  Clock,
  FileEdit,
  Eye,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: typeof Clock;
  description: string;
}

const STATUS_CONFIG: Record<PostStatus, StatusConfig> = {
  DRAFT: {
    label: "Draft",
    variant: "secondary",
    icon: FileEdit,
    description: "Post is being drafted. Submit for review when ready.",
  },
  REVIEW: {
    label: "In Review",
    variant: "outline",
    icon: Eye,
    description: "Waiting for approval from an admin or owner.",
  },
  APPROVED: {
    label: "Approved",
    variant: "default",
    icon: CheckCircle2,
    description: "Post is approved. Schedule it or publish immediately.",
  },
  SCHEDULED: {
    label: "Scheduled",
    variant: "default",
    icon: Calendar,
    description: "Post is scheduled for automatic publishing.",
  },
  PUBLISHING: {
    label: "Publishing",
    variant: "outline",
    icon: Loader2,
    description: "Post is being published to platforms.",
  },
  PUBLISHED: {
    label: "Published",
    variant: "default",
    icon: Rocket,
    description: "Post has been published successfully.",
  },
  FAILED: {
    label: "Failed",
    variant: "destructive",
    icon: AlertCircle,
    description: "Publishing failed. An admin can retry.",
  },
};

// ---------------------------------------------------------------------------
// Action config
// ---------------------------------------------------------------------------

interface ActionDef {
  targetStatus: PostStatus;
  label: string;
  icon: typeof Send;
  variant: "default" | "outline" | "secondary" | "destructive" | "ghost";
  minRole: WorkspaceRole;
}

const ACTIONS_BY_STATUS: Record<PostStatus, ActionDef[]> = {
  DRAFT: [
    {
      targetStatus: "REVIEW",
      label: "Submit for Review",
      icon: Send,
      variant: "default",
      minRole: "MEMBER",
    },
  ],
  REVIEW: [
    {
      targetStatus: "APPROVED",
      label: "Approve",
      icon: CheckCircle2,
      variant: "default",
      minRole: "ADMIN",
    },
    {
      targetStatus: "DRAFT",
      label: "Request Changes",
      icon: XCircle,
      variant: "outline",
      minRole: "ADMIN",
    },
  ],
  APPROVED: [
    {
      targetStatus: "SCHEDULED",
      label: "Schedule",
      icon: Calendar,
      variant: "outline",
      minRole: "ADMIN",
    },
    {
      targetStatus: "PUBLISHING",
      label: "Publish Now",
      icon: Rocket,
      variant: "default",
      minRole: "ADMIN",
    },
  ],
  SCHEDULED: [
    {
      targetStatus: "APPROVED",
      label: "Cancel Schedule",
      icon: Ban,
      variant: "destructive",
      minRole: "ADMIN",
    },
  ],
  PUBLISHING: [],
  PUBLISHED: [],
  FAILED: [
    {
      targetStatus: "DRAFT",
      label: "Move to Draft",
      icon: FileEdit,
      variant: "outline",
      minRole: "ADMIN",
    },
  ],
};

// ---------------------------------------------------------------------------
// Role hierarchy check
// ---------------------------------------------------------------------------

const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

function hasMinRole(
  userRole: WorkspaceRole,
  requiredRole: WorkspaceRole
): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ApprovalWorkflowProps {
  postId: string;
  currentStatus: PostStatus;
  onStatusChange?: (newStatus: PostStatus) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalWorkflow({
  postId,
  currentStatus,
  onStatusChange,
}: ApprovalWorkflowProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const userRole = workspace?.role ?? "VIEWER";
  const utils = trpc.useUtils();

  const updateStatus = trpc.analytics.updatePostStatus.useMutation({
    onSuccess: (data) => {
      utils.analytics.getPostMetrics.invalidate({ workspaceId });
      onStatusChange?.(data.status);
    },
  });

  const statusConfig = STATUS_CONFIG[currentStatus];
  const StatusIcon = statusConfig.icon;
  const availableActions = ACTIONS_BY_STATUS[currentStatus];

  // Filter actions based on user role
  const visibleActions = availableActions.filter((action) =>
    hasMinRole(userRole, action.minRole)
  );

  function handleAction(targetStatus: PostStatus) {
    if (!workspaceId || !postId) return;
    updateStatus.mutate({
      workspaceId,
      postId,
      newStatus: targetStatus,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Approval Workflow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current status */}
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <StatusIcon
              className={`size-5 ${
                currentStatus === "PUBLISHING"
                  ? "animate-spin text-muted-foreground"
                  : currentStatus === "FAILED"
                    ? "text-destructive"
                    : currentStatus === "PUBLISHED"
                      ? "text-green-500"
                      : "text-muted-foreground"
              }`}
            />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {statusConfig.description}
            </p>
          </div>
        </div>

        {/* Actions */}
        {visibleActions.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {visibleActions.map((action) => {
                const ActionIcon = action.icon;
                const isLoading =
                  updateStatus.isPending &&
                  updateStatus.variables?.newStatus === action.targetStatus;

                return (
                  <Button
                    key={action.targetStatus}
                    variant={action.variant}
                    size="sm"
                    disabled={updateStatus.isPending}
                    onClick={() => handleAction(action.targetStatus)}
                  >
                    {isLoading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ActionIcon className="size-3.5" />
                    )}
                    {action.label}
                  </Button>
                );
              })}
            </div>
          </>
        )}

        {/* Viewer notice */}
        {userRole === "VIEWER" && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground">
              You have view-only access. Contact an admin to change the post
              status.
            </p>
          </>
        )}

        {/* Error feedback */}
        {updateStatus.isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {updateStatus.error.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
