import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { AdsPlatform } from "@prisma/client";
import { router, workspaceProcedure } from "../init";
import { encrypt } from "@/lib/encryption";
import { analyticsSyncQueue } from "@/server/queue/queues";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const dateRangeInput = z.object({
  workspaceId: z.string(),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

const connectionInput = z.object({
  workspaceId: z.string(),
  platform: z.nativeEnum(AdsPlatform),
  accountId: z.string().min(1),
  accountName: z.string().optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenExpiresAt: z.coerce.date().optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const dashboardRouter = router({
  /**
   * List all AdsConnections for the workspace.
   * Tokens are redacted — only metadata is returned.
   */
  getConnections: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const connections = await ctx.prisma.adsConnection.findMany({
        where: { workspaceId: input.workspaceId },
        select: {
          id: true,
          platform: true,
          accountId: true,
          accountName: true,
          tokenExpiresAt: true,
          createdAt: true,
          _count: { select: { campaigns: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return connections;
    }),

  /**
   * Create a new AdsConnection. Tokens are encrypted before persistence.
   */
  addConnection: workspaceProcedure
    .input(connectionInput)
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate
      const existing = await ctx.prisma.adsConnection.findUnique({
        where: {
          accountId_workspaceId: {
            accountId: input.accountId,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `An ${input.platform} connection for account ${input.accountId} already exists`,
        });
      }

      const connection = await ctx.prisma.adsConnection.create({
        data: {
          platform: input.platform,
          accountId: input.accountId,
          accountName: input.accountName ?? null,
          accessToken: encrypt(input.accessToken),
          refreshToken: encrypt(input.refreshToken),
          tokenExpiresAt: input.tokenExpiresAt ?? null,
          workspaceId: input.workspaceId,
        },
        select: {
          id: true,
          platform: true,
          accountId: true,
          accountName: true,
          createdAt: true,
        },
      });

      return connection;
    }),

  /**
   * Remove an AdsConnection and cascade-delete its campaigns/metrics.
   */
  removeConnection: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        connectionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the connection belongs to this workspace
      const connection = await ctx.prisma.adsConnection.findUnique({
        where: { id: input.connectionId },
        select: { id: true, workspaceId: true },
      });

      if (!connection || connection.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Connection not found",
        });
      }

      // Cascade is handled by Prisma schema (onDelete: Cascade on Campaign
      // and CampaignMetric), so deleting the connection removes everything.
      await ctx.prisma.adsConnection.delete({
        where: { id: input.connectionId },
      });

      return { success: true };
    }),

  /**
   * Manually trigger an analytics sync for the workspace.
   * Adds a job to the BullMQ analyticsSyncQueue.
   */
  syncNow: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ input }) => {
      const job = await analyticsSyncQueue.add(
        "manual-sync",
        { workspaceId: input.workspaceId, trigger: "manual" },
        { jobId: `manual-sync-${input.workspaceId}-${Date.now()}` },
      );

      return { jobId: job.id, status: "queued" };
    }),

  /**
   * Aggregate KPIs across all campaigns for a date range,
   * with comparison to the previous period of equal length.
   */
  getOverviewKpis: workspaceProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const { from, to, workspaceId } = input;
      const periodMs = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - periodMs);
      const prevTo = new Date(from.getTime()); // exclusive boundary = start of current

      // Current period
      const current = await aggregateMetrics(ctx.prisma, workspaceId, from, to);
      // Previous period
      const previous = await aggregateMetrics(ctx.prisma, workspaceId, prevFrom, prevTo);

      return {
        current,
        previous,
        changes: computeChanges(current, previous),
      };
    }),

  /**
   * List all campaigns with their latest metrics.
   * Supports sorting and filtering by platform.
   */
  getCampaignList: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        platform: z.nativeEnum(AdsPlatform).optional(),
        sortBy: z
          .enum(["name", "spend", "impressions", "clicks", "conversions", "roas", "ctr", "cpc"])
          .default("spend"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, platform, limit, cursor } = input;

      const campaigns = await ctx.prisma.campaign.findMany({
        where: {
          workspaceId,
          ...(platform ? { platform } : {}),
        },
        include: {
          connection: {
            select: {
              accountId: true,
              accountName: true,
            },
          },
          metrics: {
            orderBy: { date: "desc" },
            take: 30, // last 30 days of metrics
          },
        },
        orderBy: { updatedAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      // Determine if there are more results
      let nextCursor: string | undefined;
      if (campaigns.length > limit) {
        const extra = campaigns.pop()!;
        nextCursor = extra.id;
      }

      // Aggregate metrics per campaign and build response
      const rows = campaigns.map((campaign) => {
        const totals = campaign.metrics.reduce(
          (acc, m) => ({
            impressions: acc.impressions + m.impressions,
            clicks: acc.clicks + m.clicks,
            conversions: acc.conversions + m.conversions,
            spend: acc.spend + m.spend,
          }),
          { impressions: 0, clicks: 0, conversions: 0, spend: 0 },
        );

        const avgCpc = totals.clicks > 0 ? totals.spend / totals.clicks : null;
        const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;
        const avgCpa = totals.conversions > 0 ? totals.spend / totals.conversions : null;

        // Compute ROAS: average of non-null daily roas values
        const roasValues = campaign.metrics
          .map((m) => m.roas)
          .filter((v): v is number => v !== null);
        const avgRoas = roasValues.length > 0
          ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
          : null;

        return {
          id: campaign.id,
          externalId: campaign.externalId,
          name: campaign.name,
          platform: campaign.platform,
          status: campaign.status,
          objective: campaign.objective,
          budget: campaign.budget,
          budgetType: campaign.budgetType,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          connectionAccountId: campaign.connection.accountId,
          connectionAccountName: campaign.connection.accountName,
          impressions: totals.impressions,
          clicks: totals.clicks,
          conversions: totals.conversions,
          spend: round2(totals.spend),
          cpc: avgCpc !== null ? round2(avgCpc) : null,
          ctr: avgCtr !== null ? round2(avgCtr) : null,
          cpa: avgCpa !== null ? round2(avgCpa) : null,
          roas: avgRoas !== null ? round2(avgRoas) : null,
        };
      });

      // Sort in memory (metrics are aggregated, so DB-level sort on metrics
      // fields isn't feasible without raw SQL).
      const sortKey = input.sortBy as keyof (typeof rows)[0];
      rows.sort((a, b) => {
        const aVal = (a[sortKey] as number | string | null) ?? 0;
        const bVal = (b[sortKey] as number | string | null) ?? 0;
        if (typeof aVal === "string" && typeof bVal === "string") {
          return input.sortOrder === "desc"
            ? bVal.localeCompare(aVal)
            : aVal.localeCompare(bVal);
        }
        return input.sortOrder === "desc"
          ? (bVal as number) - (aVal as number)
          : (aVal as number) - (bVal as number);
      });

      return { campaigns: rows, nextCursor };
    }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AggregatedKpis {
  totalSpend: number;
  totalConversions: number;
  totalImpressions: number;
  totalClicks: number;
  avgRoas: number | null;
  avgCpc: number | null;
  avgCtr: number | null;
}

type PrismaClient = Parameters<
  Parameters<typeof workspaceProcedure.query>[0]
> extends [infer Ctx, ...unknown[]]
  ? Ctx extends { ctx: { prisma: infer P } }
    ? P
    : never
  : never;

async function aggregateMetrics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient: any,
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<AggregatedKpis> {
  const metrics = await prismaClient.campaignMetric.findMany({
    where: {
      campaign: { workspaceId },
      date: { gte: from, lte: to },
    },
    select: {
      impressions: true,
      clicks: true,
      conversions: true,
      spend: true,
      roas: true,
    },
  });

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalSpend = 0;
  const roasValues: number[] = [];

  for (const m of metrics) {
    totalImpressions += m.impressions;
    totalClicks += m.clicks;
    totalConversions += m.conversions;
    totalSpend += m.spend;
    if (m.roas !== null) roasValues.push(m.roas);
  }

  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : null;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;
  const avgRoas =
    roasValues.length > 0
      ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
      : null;

  return {
    totalSpend: round2(totalSpend),
    totalConversions,
    totalImpressions,
    totalClicks,
    avgRoas: avgRoas !== null ? round2(avgRoas) : null,
    avgCpc: avgCpc !== null ? round2(avgCpc) : null,
    avgCtr: avgCtr !== null ? round2(avgCtr) : null,
  };
}

function computeChanges(
  current: AggregatedKpis,
  previous: AggregatedKpis,
): Record<keyof AggregatedKpis, number | null> {
  const keys = Object.keys(current) as (keyof AggregatedKpis)[];
  const changes = {} as Record<keyof AggregatedKpis, number | null>;

  for (const key of keys) {
    const cur = current[key];
    const prev = previous[key];

    if (cur === null || prev === null || prev === 0) {
      changes[key] = null;
    } else {
      changes[key] = round2(((cur - prev) / Math.abs(prev)) * 100);
    }
  }

  return changes;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
