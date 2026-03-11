"use client";

import { useMemo } from "react";
import {
  Megaphone,
  Activity,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  CampaignsTable,
  type CampaignRow,
} from "@/components/analytics/campaigns-table";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Summary card skeleton
// ---------------------------------------------------------------------------

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="size-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-20" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const campaignList = trpc.dashboard.getCampaignList.useQuery(
    {
      workspaceId,
      limit: 100,
      sortBy: "spend",
      sortOrder: "desc",
    },
    { enabled: !!workspaceId }
  );

  const campaigns: CampaignRow[] = useMemo(() => {
    if (!campaignList.data?.campaigns) return [];
    return campaignList.data.campaigns.map((c) => ({
      ...c,
      startDate: c.startDate ? new Date(c.startDate) : null,
      endDate: c.endDate ? new Date(c.endDate) : null,
    }));
  }, [campaignList.data]);

  // Compute summary KPIs
  const summary = useMemo(() => {
    if (campaigns.length === 0) {
      return {
        totalCampaigns: 0,
        activeCampaigns: 0,
        totalSpend: 0,
        avgRoas: null as number | null,
      };
    }

    const active = campaigns.filter((c) => c.status === "ACTIVE").length;
    const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);

    const roasValues = campaigns
      .map((c) => c.roas)
      .filter((v): v is number => v !== null);
    const avgRoas =
      roasValues.length > 0
        ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
        : null;

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: active,
      totalSpend,
      avgRoas,
    };
  }, [campaigns]);

  const isLoading = campaignList.isLoading;

  const summaryCards = [
    {
      label: "Total Campaigns",
      value: isLoading ? null : summary.totalCampaigns.toString(),
      icon: Megaphone,
      color: "text-blue-400",
    },
    {
      label: "Active",
      value: isLoading ? null : summary.activeCampaigns.toString(),
      icon: Activity,
      color: "text-green-400",
    },
    {
      label: "Total Spend",
      value: isLoading ? null : formatCurrency(summary.totalSpend),
      icon: DollarSign,
      color: "text-orange-400",
    },
    {
      label: "Avg ROAS",
      value: isLoading
        ? null
        : summary.avgRoas !== null
          ? `${summary.avgRoas.toFixed(2)}x`
          : "-",
      icon: TrendingUp,
      color: "text-purple-400",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unified view of all Google Ads and Meta Ads campaigns with
          aggregated metrics.
        </p>
      </div>

      {/* Summary bar */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) =>
          isLoading ? (
            <SummaryCardSkeleton key={card.label} />
          ) : (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <card.icon className={`size-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{card.value ?? "-"}</p>
              </CardContent>
            </Card>
          )
        )}
      </div>

      <Separator className="mb-8" />

      {/* Campaigns table */}
      <CampaignsTable data={campaigns} isLoading={isLoading} />
    </div>
  );
}
