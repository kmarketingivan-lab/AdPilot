import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PostStatus, Platform } from "@prisma/client";
import { router, workspaceProcedure } from "../init";

// Valid status transitions and which roles can perform them
const STATUS_TRANSITIONS: Record<
  PostStatus,
  { to: PostStatus; roles: string[] }[]
> = {
  DRAFT: [{ to: "REVIEW", roles: ["OWNER", "ADMIN", "MEMBER"] }],
  REVIEW: [
    { to: "APPROVED", roles: ["OWNER", "ADMIN"] },
    { to: "DRAFT", roles: ["OWNER", "ADMIN"] }, // request changes → back to draft
  ],
  APPROVED: [
    { to: "SCHEDULED", roles: ["OWNER", "ADMIN"] },
    { to: "PUBLISHING", roles: ["OWNER", "ADMIN"] }, // publish now
  ],
  SCHEDULED: [{ to: "APPROVED", roles: ["OWNER", "ADMIN"] }], // cancel schedule
  PUBLISHING: [], // system-only transition to PUBLISHED/FAILED
  PUBLISHED: [],
  FAILED: [{ to: "DRAFT", roles: ["OWNER", "ADMIN"] }], // retry → back to draft
};

export const analyticsRouter = router({
  // Get metrics for all published posts in workspace
  getPostMetrics: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        sortBy: z
          .enum([
            "publishedAt",
            "impressions",
            "clicks",
            "likes",
            "comments",
            "shares",
            "reach",
            "engagement",
          ])
          .default("publishedAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
        platform: z.nativeEnum(Platform).optional(),
        dateRange: z.enum(["7d", "30d", "90d"]).default("30d"),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const daysMap = { "7d": 7, "30d": 30, "90d": 90 } as const;
      const since = new Date(
        now.getTime() - daysMap[input.dateRange] * 24 * 60 * 60 * 1000
      );

      const posts = await ctx.prisma.post.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: "PUBLISHED",
          publishedAt: { gte: since },
        },
        include: {
          platforms: {
            where: input.platform ? { platform: input.platform } : undefined,
            select: {
              id: true,
              platform: true,
              impressions: true,
              clicks: true,
              likes: true,
              comments: true,
              shares: true,
              reach: true,
            },
          },
        },
        orderBy:
          input.sortBy === "publishedAt"
            ? { publishedAt: input.sortOrder }
            : undefined,
      });

      // Flatten: one row per post-platform combination
      const rows = posts.flatMap((post) =>
        post.platforms.map((pp) => {
          const engagement =
            pp.impressions > 0
              ? ((pp.likes + pp.comments + pp.shares) / pp.impressions) * 100
              : 0;

          return {
            postId: post.id,
            postPlatformId: pp.id,
            content: post.content,
            platform: pp.platform,
            publishedAt: post.publishedAt,
            impressions: pp.impressions,
            clicks: pp.clicks,
            likes: pp.likes,
            comments: pp.comments,
            shares: pp.shares,
            reach: pp.reach,
            engagement: Math.round(engagement * 100) / 100,
          };
        })
      );

      // Sort by metric if needed
      if (input.sortBy !== "publishedAt") {
        const key = input.sortBy as keyof (typeof rows)[0];
        rows.sort((a, b) => {
          const aVal = (a[key] as number) ?? 0;
          const bVal = (b[key] as number) ?? 0;
          return input.sortOrder === "desc" ? bVal - aVal : aVal - bVal;
        });
      }

      return rows;
    }),

  // Aggregate KPI data
  getKpiSummary: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        dateRange: z.enum(["7d", "30d", "90d"]).default("30d"),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const daysMap = { "7d": 7, "30d": 30, "90d": 90 } as const;
      const since = new Date(
        now.getTime() - daysMap[input.dateRange] * 24 * 60 * 60 * 1000
      );

      const posts = await ctx.prisma.post.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: "PUBLISHED",
          publishedAt: { gte: since },
        },
        include: {
          platforms: {
            select: {
              impressions: true,
              clicks: true,
              likes: true,
              comments: true,
              shares: true,
            },
          },
        },
      });

      let totalImpressions = 0;
      let totalClicks = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;
      let platformCount = 0;

      for (const post of posts) {
        for (const pp of post.platforms) {
          totalImpressions += pp.impressions;
          totalClicks += pp.clicks;
          totalLikes += pp.likes;
          totalComments += pp.comments;
          totalShares += pp.shares;
          platformCount++;
        }
      }

      const avgEngagement =
        totalImpressions > 0
          ? ((totalLikes + totalComments + totalShares) / totalImpressions) *
            100
          : 0;

      return {
        totalImpressions,
        totalClicks,
        avgEngagement: Math.round(avgEngagement * 100) / 100,
        totalPosts: posts.length,
      };
    }),

  // Top 5 posts by engagement rate
  getTopPosts: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        dateRange: z.enum(["7d", "30d", "90d"]).default("30d"),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const daysMap = { "7d": 7, "30d": 30, "90d": 90 } as const;
      const since = new Date(
        now.getTime() - daysMap[input.dateRange] * 24 * 60 * 60 * 1000
      );

      const posts = await ctx.prisma.post.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: "PUBLISHED",
          publishedAt: { gte: since },
        },
        include: {
          platforms: {
            select: {
              platform: true,
              impressions: true,
              clicks: true,
              likes: true,
              comments: true,
              shares: true,
              reach: true,
            },
          },
        },
      });

      // Aggregate metrics per post
      const scored = posts.map((post) => {
        let impressions = 0;
        let likes = 0;
        let comments = 0;
        let shares = 0;
        let reach = 0;
        const platformList: Platform[] = [];

        for (const pp of post.platforms) {
          impressions += pp.impressions;
          likes += pp.likes;
          comments += pp.comments;
          shares += pp.shares;
          reach += pp.reach;
          platformList.push(pp.platform);
        }

        const engagement =
          impressions > 0
            ? ((likes + comments + shares) / impressions) * 100
            : 0;

        return {
          postId: post.id,
          content: post.content,
          publishedAt: post.publishedAt,
          platforms: platformList,
          impressions,
          likes,
          comments,
          shares,
          reach,
          engagement: Math.round(engagement * 100) / 100,
        };
      });

      scored.sort((a, b) => b.engagement - a.engagement);
      return scored.slice(0, 5);
    }),

  // Update post status with role validation
  updatePostStatus: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        postId: z.string(),
        newStatus: z.nativeEnum(PostStatus),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.prisma.post.findUnique({
        where: { id: input.postId },
      });

      if (!post || post.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Post not found",
        });
      }

      const currentStatus = post.status;
      const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
      const transition = allowedTransitions.find(
        (t) => t.to === input.newStatus
      );

      if (!transition) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from ${currentStatus} to ${input.newStatus}`,
        });
      }

      if (!transition.roles.includes(ctx.membership.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Role ${ctx.membership.role} cannot perform this status transition`,
        });
      }

      const updateData: { status: PostStatus; publishedAt?: Date | null; scheduledAt?: Date | null } = {
        status: input.newStatus,
      };

      // Clear scheduledAt when cancelling schedule
      if (currentStatus === "SCHEDULED" && input.newStatus === "APPROVED") {
        updateData.scheduledAt = null;
      }

      return ctx.prisma.post.update({
        where: { id: input.postId },
        data: updateData,
      });
    }),
});
