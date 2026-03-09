import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../init";
import {
  generateAdCopy,
  generateVariants,
  analyzeCompetitor,
  type AdPlatform,
} from "@/server/services/ai/copy-generator";
import { ClaudeApiError } from "@/server/services/ai/claude";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const adPlatformEnum = z.enum(["GOOGLE_SEARCH", "META_FEED", "LINKEDIN"]);

const briefSchema = z.object({
  product: z.string().min(1, "Product name is required").max(500),
  targetAudience: z.string().min(1, "Target audience is required").max(1000),
  usp: z.string().min(1, "USP is required").max(500),
  tone: z
    .enum(["professional", "casual", "humorous", "inspirational", "urgent", "empathetic"])
    .default("professional"),
  objective: z
    .enum(["awareness", "traffic", "conversions", "leads", "engagement"])
    .default("conversions"),
  platform: adPlatformEnum,
  language: z.enum(["it", "en", "es", "fr", "de"]).default("it"),
  charLimits: z
    .object({
      headline: z.number().optional(),
      description: z.number().optional(),
      primary: z.number().optional(),
      intro: z.number().optional(),
    })
    .optional(),
});

const adsPlatformDbEnum = z.enum(["GOOGLE_ADS", "META_ADS"]);

const creativeStatusEnum = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "WINNER",
  "LOSER",
]);

// Map our generation platforms to DB AdsPlatform
function toDbPlatform(platform: AdPlatform): "GOOGLE_ADS" | "META_ADS" {
  switch (platform) {
    case "GOOGLE_SEARCH":
      return "GOOGLE_ADS";
    case "META_FEED":
      return "META_ADS";
    case "LINKEDIN":
      // LinkedIn ads stored under META_ADS for now (no separate enum in schema)
      return "META_ADS";
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const adsRouter = router({
  // -------------------------------------------------------------------------
  // Generate ad copy from brief
  // -------------------------------------------------------------------------
  generateCopy: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        brief: briefSchema,
      })
    )
    .mutation(async ({ input }) => {
      try {
        const variants = await generateAdCopy(input.brief);
        return { variants, brief: input.brief };
      } catch (error) {
        if (error instanceof ClaudeApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `AI generation failed: ${error.message}`,
            cause: error,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate ad copy",
          cause: error,
        });
      }
    }),

  // -------------------------------------------------------------------------
  // Save a generated copy to AdCreative in DB
  // -------------------------------------------------------------------------
  saveCopy: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        campaignId: z.string(),
        headline: z.string().min(1),
        description: z.string().min(1),
        ctaText: z.string().optional(),
        destinationUrl: z.string().url().optional(),
        platform: adPlatformEnum,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify campaign belongs to workspace
      const campaign = await ctx.prisma.campaign.findUnique({
        where: { id: input.campaignId },
      });

      if (!campaign || campaign.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }

      const creative = await ctx.prisma.adCreative.create({
        data: {
          headline: input.headline,
          description: input.description,
          ctaText: input.ctaText,
          destinationUrl: input.destinationUrl,
          aiGenerated: true,
          status: "DRAFT",
          campaignId: input.campaignId,
        },
      });

      return creative;
    }),

  // -------------------------------------------------------------------------
  // List saved ad copies for workspace
  // -------------------------------------------------------------------------
  listCopies: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const creatives = await ctx.prisma.adCreative.findMany({
        where: {
          campaign: {
            workspaceId: input.workspaceId,
          },
        },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              platform: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (creatives.length > input.limit) {
        const next = creatives.pop();
        nextCursor = next?.id;
      }

      return { creatives, nextCursor };
    }),

  // -------------------------------------------------------------------------
  // Delete a saved copy
  // -------------------------------------------------------------------------
  deleteCopy: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        creativeId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const creative = await ctx.prisma.adCreative.findUnique({
        where: { id: input.creativeId },
        include: {
          campaign: { select: { workspaceId: true } },
        },
      });

      if (!creative || creative.campaign.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creative not found",
        });
      }

      await ctx.prisma.adCreative.delete({
        where: { id: input.creativeId },
      });

      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // Copy library with filters
  // -------------------------------------------------------------------------
  getCopyLibrary: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        platform: adsPlatformDbEnum.optional(),
        status: creativeStatusEnum.optional(),
        aiGeneratedOnly: z.boolean().optional(),
        search: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        campaign: {
          workspaceId: input.workspaceId,
          ...(input.platform && { platform: input.platform }),
        },
      };

      if (input.status) {
        where.status = input.status;
      }

      if (input.aiGeneratedOnly) {
        where.aiGenerated = true;
      }

      if (input.search) {
        where.OR = [
          { headline: { contains: input.search, mode: "insensitive" } },
          { description: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const creatives = await ctx.prisma.adCreative.findMany({
        where,
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              platform: true,
            },
          },
          metrics: {
            orderBy: { date: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (creatives.length > input.limit) {
        const next = creatives.pop();
        nextCursor = next?.id;
      }

      return { creatives, nextCursor };
    }),

  // -------------------------------------------------------------------------
  // Generate text variants
  // -------------------------------------------------------------------------
  generateVariants: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        baseText: z.string().min(1).max(500),
        count: z.number().min(1).max(20).default(5),
        tone: z
          .enum(["professional", "casual", "humorous", "inspirational", "urgent", "empathetic"])
          .default("professional"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const variants = await generateVariants(
          input.baseText,
          input.count,
          input.tone
        );
        return { variants };
      } catch (error) {
        if (error instanceof ClaudeApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `AI generation failed: ${error.message}`,
            cause: error,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate variants",
          cause: error,
        });
      }
    }),

  // -------------------------------------------------------------------------
  // Analyze competitor (placeholder)
  // -------------------------------------------------------------------------
  analyzeCompetitor: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        url: z.string().url("Provide a valid URL"),
      })
    )
    .mutation(async ({ input }) => {
      const analysis = await analyzeCompetitor(input.url);
      return analysis;
    }),
});
