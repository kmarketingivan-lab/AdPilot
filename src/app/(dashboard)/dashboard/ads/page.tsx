"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SparklesIcon,
  BookOpenIcon,
  MegaphoneIcon,
  PlusIcon,
  CircleDotIcon,
  PauseCircleIcon,
  CheckCircle2Icon,
  ArchiveIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdPlatform } from "@/components/ads/copy-variant-card";

// ---------- Types ----------

type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

interface AdCampaign {
  id: string;
  name: string;
  platform: AdPlatform;
  status: CampaignStatus;
  budget: number | null;
  currency: string;
  copyCount: number;
  createdAt: Date | string;
}

// ---------- Status metadata ----------

const STATUS_CONFIG: Record<
  CampaignStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  DRAFT: {
    label: "Draft",
    icon: CircleDotIcon,
    className: "bg-muted text-muted-foreground",
  },
  ACTIVE: {
    label: "Active",
    icon: CircleDotIcon,
    className: "bg-green-500/10 text-green-700 dark:text-green-400",
  },
  PAUSED: {
    label: "Paused",
    icon: PauseCircleIcon,
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  },
  COMPLETED: {
    label: "Completed",
    icon: CheckCircle2Icon,
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  ARCHIVED: {
    label: "Archived",
    icon: ArchiveIcon,
    className: "bg-muted text-muted-foreground",
  },
};

const PLATFORM_LABELS: Record<AdPlatform, string> = {
  GOOGLE_SEARCH: "Google Search",
  META_FEED: "Meta Feed",
  LINKEDIN: "LinkedIn",
};

const PLATFORM_COLORS: Record<AdPlatform, string> = {
  GOOGLE_SEARCH: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  META_FEED: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  LINKEDIN: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

const STATUS_OPTIONS: { value: CampaignStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

function formatBudget(amount: number | null, currency: string): string {
  if (amount == null) return "No budget";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------- Page Component ----------

export default function AdsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "ALL">("ALL");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = (trpc as any).ads.listCampaigns.useQuery(
    {
      workspaceId,
      ...(statusFilter !== "ALL" && { status: statusFilter }),
    },
    { enabled: !!workspaceId },
  ) as { data: AdCampaign[] | undefined; isLoading: boolean };

  const campaigns = data ?? [];

  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ad Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your advertising campaigns and creative assets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/ads/library">
            <Button variant="outline">
              <BookOpenIcon data-icon="inline-start" />
              Copy Library
            </Button>
          </Link>
          <Link href="/dashboard/ads/generate">
            <Button>
              <SparklesIcon data-icon="inline-start" />
              Generate New Copy
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(val) => setStatusFilter(val as CampaignStatus | "ALL")}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && campaigns.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed py-16">
          <MegaphoneIcon className="mb-4 size-12 text-muted-foreground/50" />
          <h3 className="mb-1 text-lg font-medium">No campaigns yet</h3>
          <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
            {statusFilter !== "ALL"
              ? "No campaigns match the selected filter. Try a different status."
              : "Get started by generating AI ad copy or creating your first campaign."}
          </p>
          {statusFilter === "ALL" && (
            <div className="flex items-center gap-2">
              <Link href="/dashboard/ads/generate">
                <Button>
                  <SparklesIcon data-icon="inline-start" />
                  Generate Ad Copy
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Campaign grid */}
      {!isLoading && campaigns.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const statusCfg = STATUS_CONFIG[campaign.status];
            const StatusIcon = statusCfg.icon;

            return (
              <Card
                key={campaign.id}
                className="transition-shadow hover:ring-2 hover:ring-primary/20"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {campaign.name}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        "border-0 font-medium",
                        PLATFORM_COLORS[campaign.platform],
                      )}
                    >
                      {PLATFORM_LABELS[campaign.platform]}
                    </Badge>
                    <Badge
                      className={cn("gap-1 border-0 font-medium", statusCfg.className)}
                    >
                      <StatusIcon className="size-3" />
                      {statusCfg.label}
                    </Badge>
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Budget</span>
                    <span className="font-medium text-foreground">
                      {formatBudget(campaign.budget, campaign.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Creatives</span>
                    <span className="font-medium text-foreground">
                      {campaign.copyCount}
                    </span>
                  </div>
                </CardContent>

                <CardFooter>
                  <Link href={`/dashboard/ads/${campaign.id}`} className="w-full">
                    <Button variant="outline" size="sm" className="w-full">
                      View Campaign
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}

          {/* New campaign card */}
          <Link href="/dashboard/ads/generate">
            <Card className="flex h-full cursor-pointer items-center justify-center border-2 border-dashed transition-colors hover:border-primary/30 hover:bg-muted/30">
              <CardContent className="flex flex-col items-center gap-2 py-12">
                <PlusIcon className="size-8 text-muted-foreground/50" />
                <span className="text-sm font-medium text-muted-foreground">
                  Create Campaign
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
