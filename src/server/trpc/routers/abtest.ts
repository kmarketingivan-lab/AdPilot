import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../init";
import {
  createSearchCampaign,
  createAdGroup,
  createResponsiveSearchAd,
  getAdPerformance as getGoogleAdPerformance,
} from "@/server/services/ads/google-ads-campaign";
import {
  createCampaign as createMetaCampaign,
  createAdSet,
  createMultipleAds,
  getAdPerformance as getMetaAdPerformance,
} from "@/server/services/ads/meta-ads-campaign";

// ---------- Helpers ----------

/**
 * Two-proportion z-test for statistical significance.
 * Compares conversion rates of two variants.
 * Returns the p-value for the two-tailed test.
 */
function calculateSignificance(
  clicksA: number,
  conversionsA: number,
  clicksB: number,
  conversionsB: number,
): { zScore: number; pValue: number; significant: boolean } {
  if (clicksA === 0 || clicksB === 0) {
    return { zScore: 0, pValue: 1, significant: false };
  }

  const rateA = conversionsA / clicksA;
  const rateB = conversionsB / clicksB;

  const pooledRate =
    (conversionsA + conversionsB) / (clicksA + clicksB);
  const pooledSE = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / clicksA + 1 / clicksB),
  );

  if (pooledSE === 0) {
    return { zScore: 0, pValue: 1, significant: false };
  }

  const zScore = (rateA - rateB) / pooledSE;

  // Approximate p-value from z-score (two-tailed)
  const absZ = Math.abs(zScore);
  // Using the rational approximation of the normal CDF
  const t = 1 / (1 + 0.2316419 * absZ);
  const d = 0.3989423 * Math.exp((-absZ * absZ) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const pValue = 2 * p; // two-tailed

  return {
    zScore: Math.round(zScore * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    significant: pValue < 0.05,
  };
}

// ---------- Router ----------

export const abtestRouter = router({
  /**
   * Create a Google Ads Responsive Search Ad with headline/description variants
   * for A/B testing. Google's own system rotates variants automatically.
   */
  createGoogleTest: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        connectionId: z.string(),
        campaignName: z.string().min(1),
        headlines: z.array(z.string().min(1).max(30)).min(3).max(15),
        descriptions: z.array(z.string().min(1).max(90)).min(2).max(4),
        finalUrl: z.string().url(),
        budgetAmountMicros: z.number().int().positive(),
        budgetType: z.enum(["DAILY", "LIFETIME"]).default("DAILY"),
        biddingStrategy: z
          .enum([
            "MAXIMIZE_CLICKS",
            "MAXIMIZE_CONVERSIONS",
            "TARGET_CPA",
            "TARGET_ROAS",
          ])
          .default("MAXIMIZE_CLICKS"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch the ads connection
      const connection = await ctx.prisma.adsConnection.findUnique({
        where: { id: input.connectionId },
      });

      if (!connection || connection.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ads connection not found",
        });
      }

      // 1. Create campaign
      const campaign = await createSearchCampaign(connection, {
        name: input.campaignName,
        budgetAmountMicros: input.budgetAmountMicros,
        budgetType: input.budgetType,
        biddingStrategy: input.biddingStrategy,
        status: "PAUSED",
      });

      // 2. Create ad group
      const adGroup = await createAdGroup(
        connection,
        campaign.campaignId,
        `${input.campaignName} - Ad Group`,
      );

      // 3. Create RSA with all headline/description variants
      const rsa = await createResponsiveSearchAd(
        connection,
        adGroup.adGroupId,
        input.headlines,
        input.descriptions,
        input.finalUrl,
      );

      // 4. Store in database
      const dbCampaign = await ctx.prisma.campaign.create({
        data: {
          externalId: campaign.campaignId,
          name: input.campaignName,
          platform: "GOOGLE_ADS",
          status: "DRAFT",
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
        },
      });

      // Create one AdCreative per headline variant for tracking
      const creatives = await Promise.all(
        input.headlines.map((headline, idx) =>
          ctx.prisma.adCreative.create({
            data: {
              headline,
              description: input.descriptions[idx % input.descriptions.length],
              ctaText: null,
              destinationUrl: input.finalUrl,
              aiGenerated: false,
              status: "DRAFT",
              campaignId: dbCampaign.id,
            },
          }),
        ),
      );

      return {
        campaignId: dbCampaign.id,
        externalCampaignId: campaign.campaignId,
        adGroupId: adGroup.adGroupId,
        adId: rsa.adId,
        creativeCount: creatives.length,
      };
    }),

  /**
   * Create a Meta Ads campaign with multiple ad creatives for A/B testing.
   * Each variant becomes a separate ad within the same ad set.
   */
  createMetaTest: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        connectionId: z.string(),
        campaignName: z.string().min(1),
        objective: z
          .enum([
            "OUTCOME_AWARENESS",
            "OUTCOME_ENGAGEMENT",
            "OUTCOME_LEADS",
            "OUTCOME_SALES",
            "OUTCOME_TRAFFIC",
            "OUTCOME_APP_PROMOTION",
          ])
          .default("OUTCOME_TRAFFIC"),
        variants: z
          .array(
            z.object({
              headline: z.string().min(1),
              description: z.string().min(1),
              body: z.string().min(1),
              ctaType: z.string().optional(),
              imageUrl: z.string().optional(),
              linkUrl: z.string().url(),
            }),
          )
          .min(2)
          .max(20),
        pageId: z.string().min(1),
        dailyBudget: z.number().int().positive(),
        targeting: z.object({
          countries: z.array(z.string()).optional(),
          ageMin: z.number().int().min(18).max(65).optional(),
          ageMax: z.number().int().min(18).max(65).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.prisma.adsConnection.findUnique({
        where: { id: input.connectionId },
      });

      if (!connection || connection.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ads connection not found",
        });
      }

      // 1. Create campaign
      const metaCampaign = await createMetaCampaign(connection, {
        name: input.campaignName,
        objective: input.objective,
        status: "PAUSED",
      });

      // 2. Create ad set
      const adSet = await createAdSet(connection, metaCampaign.id, {
        name: `${input.campaignName} - A/B Test`,
        dailyBudget: input.dailyBudget,
        targeting: {
          geoLocations: input.targeting.countries
            ? { countries: input.targeting.countries }
            : undefined,
          ageMin: input.targeting.ageMin,
          ageMax: input.targeting.ageMax,
        },
        status: "PAUSED",
      });

      // 3. Create multiple ads (one per variant)
      const creatives = input.variants.map((v, idx) => ({
        name: `${input.campaignName} - Variant ${idx + 1}`,
        headline: v.headline,
        description: v.description,
        body: v.body,
        ctaType: v.ctaType,
        imageUrl: v.imageUrl,
        linkUrl: v.linkUrl,
        pageId: input.pageId,
      }));

      const metaAds = await createMultipleAds(connection, adSet.id, creatives);

      // 4. Store in database
      const dbCampaign = await ctx.prisma.campaign.create({
        data: {
          externalId: metaCampaign.id,
          name: input.campaignName,
          platform: "META_ADS",
          status: "DRAFT",
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
        },
      });

      const dbCreatives = await Promise.all(
        input.variants.map((variant, idx) =>
          ctx.prisma.adCreative.create({
            data: {
              headline: variant.headline,
              description: variant.description,
              ctaText: variant.ctaType ?? null,
              imageUrl: variant.imageUrl ?? null,
              destinationUrl: variant.linkUrl,
              aiGenerated: false,
              status: "DRAFT",
              campaignId: dbCampaign.id,
            },
          }),
        ),
      );

      return {
        campaignId: dbCampaign.id,
        externalCampaignId: metaCampaign.id,
        adSetId: adSet.id,
        ads: metaAds,
        creativeCount: dbCreatives.length,
      };
    }),

  /**
   * Get A/B test results with per-variant metrics and statistical significance.
   */
  getTestResults: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        campaignId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findUnique({
        where: { id: input.campaignId },
        include: {
          connection: true,
          creatives: {
            include: {
              metrics: {
                orderBy: { date: "desc" },
              },
            },
          },
        },
      });

      if (!campaign || campaign.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }

      if (!campaign.externalId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Campaign has no external ID (not yet published)",
        });
      }

      // Fetch live performance from the platform
      let platformMetrics: Array<{
        adId: string;
        adName: string;
        impressions: number;
        clicks: number;
        conversions: number;
        spend: number;
      }> = [];

      try {
        if (campaign.platform === "GOOGLE_ADS") {
          const raw = await getGoogleAdPerformance(
            campaign.connection,
            campaign.externalId,
          );
          platformMetrics = raw.map((r) => ({
            adId: r.adId,
            adName: r.adName,
            impressions: r.impressions,
            clicks: r.clicks,
            conversions: r.conversions,
            spend: r.costMicros / 1_000_000,
          }));
        } else if (campaign.platform === "META_ADS") {
          const raw = await getMetaAdPerformance(
            campaign.connection,
            campaign.externalId,
          );
          platformMetrics = raw.map((r) => ({
            adId: r.adId,
            adName: r.adName,
            impressions: r.impressions,
            clicks: r.clicks,
            conversions: r.conversions,
            spend: r.spend,
          }));
        }
      } catch {
        // If API call fails, fall back to stored metrics
      }

      // Build variant results from stored creatives + metrics
      const variants = campaign.creatives.map((creative) => {
        const totalMetrics = creative.metrics.reduce(
          (acc, m) => ({
            impressions: acc.impressions + m.impressions,
            clicks: acc.clicks + m.clicks,
            conversions: acc.conversions + m.conversions,
            spend: acc.spend + m.spend,
          }),
          { impressions: 0, clicks: 0, conversions: 0, spend: 0 },
        );

        return {
          creativeId: creative.id,
          headline: creative.headline,
          description: creative.description,
          ctaText: creative.ctaText,
          status: creative.status,
          metrics: totalMetrics,
          ctr:
            totalMetrics.impressions > 0
              ? totalMetrics.clicks / totalMetrics.impressions
              : 0,
          conversionRate:
            totalMetrics.clicks > 0
              ? totalMetrics.conversions / totalMetrics.clicks
              : 0,
          cpa:
            totalMetrics.conversions > 0
              ? totalMetrics.spend / totalMetrics.conversions
              : null,
        };
      });

      // Calculate statistical significance between best and second-best
      const sorted = [...variants].sort(
        (a, b) => b.conversionRate - a.conversionRate,
      );

      let significance = null;
      if (sorted.length >= 2) {
        const best = sorted[0];
        const runner = sorted[1];
        significance = calculateSignificance(
          best.metrics.clicks,
          best.metrics.conversions,
          runner.metrics.clicks,
          runner.metrics.conversions,
        );
      }

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        platform: campaign.platform,
        status: campaign.status,
        variants,
        platformMetrics,
        significance,
        suggestedWinner:
          significance?.significant && sorted.length > 0
            ? sorted[0].creativeId
            : null,
      };
    }),

  /**
   * Declare a winner: mark the winning creative as WINNER, pause all losers.
   */
  declareWinner: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        campaignId: z.string(),
        winnerCreativeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findUnique({
        where: { id: input.campaignId },
        include: { creatives: true },
      });

      if (!campaign || campaign.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }

      const winner = campaign.creatives.find(
        (c) => c.id === input.winnerCreativeId,
      );
      if (!winner) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creative not found in this campaign",
        });
      }

      // Mark winner
      await ctx.prisma.adCreative.update({
        where: { id: input.winnerCreativeId },
        data: { status: "WINNER" },
      });

      // Mark all others as losers
      const loserIds = campaign.creatives
        .filter((c) => c.id !== input.winnerCreativeId)
        .map((c) => c.id);

      if (loserIds.length > 0) {
        await ctx.prisma.adCreative.updateMany({
          where: { id: { in: loserIds } },
          data: { status: "LOSER" },
        });
      }

      return {
        winnerId: input.winnerCreativeId,
        losersCount: loserIds.length,
      };
    }),
});
