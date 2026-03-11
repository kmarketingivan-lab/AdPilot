import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PostStatus } from "@prisma/client";
import { router, workspaceProcedure } from "../init";
import { socialPublishQueue } from "@/server/queue/queues";

export const scheduleRouter = router({
  /**
   * Get posts for a date range (calendar month view), grouped by date key (YYYY-MM-DD).
   */
  getCalendarPosts: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        start: z.date(),
        end: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const posts = await ctx.prisma.post.findMany({
        where: {
          workspaceId: input.workspaceId,
          OR: [
            {
              scheduledAt: {
                gte: input.start,
                lte: input.end,
              },
            },
            {
              publishedAt: {
                gte: input.start,
                lte: input.end,
              },
            },
          ],
        },
        include: {
          platforms: {
            select: {
              id: true,
              platform: true,
              status: true,
            },
          },
        },
        orderBy: { scheduledAt: "asc" },
      });

      // Group posts by date key (YYYY-MM-DD)
      const grouped: Record<
        string,
        typeof posts
      > = {};

      for (const post of posts) {
        const dateKey = (post.scheduledAt ?? post.publishedAt ?? post.createdAt)
          .toISOString()
          .slice(0, 10);

        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(post);
      }

      return grouped;
    }),

  /**
   * Schedule a post: sets scheduledAt, updates status, and enqueues a delayed BullMQ job.
   */
  schedulePost: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        postId: z.string(),
        scheduledAt: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.prisma.post.findUnique({
        where: { id: input.postId },
      });

      if (!post || post.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Post not found in this workspace",
        });
      }

      const now = new Date();
      if (input.scheduledAt <= now) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Scheduled time must be in the future",
        });
      }

      const delay = input.scheduledAt.getTime() - now.getTime();

      // Update the post
      const updated = await ctx.prisma.post.update({
        where: { id: input.postId },
        data: {
          scheduledAt: input.scheduledAt,
          status: PostStatus.SCHEDULED,
        },
        include: {
          platforms: {
            select: { id: true, platform: true, status: true },
          },
        },
      });

      // Also update platform statuses
      await ctx.prisma.postPlatform.updateMany({
        where: {
          postId: input.postId,
          status: { in: [PostStatus.DRAFT, PostStatus.APPROVED, PostStatus.REVIEW] },
        },
        data: { status: PostStatus.SCHEDULED },
      });

      // Add delayed job to BullMQ
      await socialPublishQueue.add(
        "publish-post",
        {
          postId: input.postId,
          workspaceId: input.workspaceId,
        },
        {
          delay,
          jobId: `post-${input.postId}`,
          removeOnComplete: true,
        }
      );

      return updated;
    }),

  /**
   * Reschedule a post: update scheduledAt, remove old job, add new delayed job.
   */
  reschedulePost: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        postId: z.string(),
        scheduledAt: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.prisma.post.findUnique({
        where: { id: input.postId },
      });

      if (!post || post.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Post not found in this workspace",
        });
      }

      if (
        post.status !== PostStatus.SCHEDULED &&
        post.status !== PostStatus.APPROVED
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only scheduled or approved posts can be rescheduled",
        });
      }

      const now = new Date();
      if (input.scheduledAt <= now) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Scheduled time must be in the future",
        });
      }

      // Remove old job
      const existingJob = await socialPublishQueue.getJob(`post-${input.postId}`);
      if (existingJob) {
        await existingJob.remove();
      }

      const delay = input.scheduledAt.getTime() - now.getTime();

      // Update the post
      const updated = await ctx.prisma.post.update({
        where: { id: input.postId },
        data: {
          scheduledAt: input.scheduledAt,
          status: PostStatus.SCHEDULED,
        },
        include: {
          platforms: {
            select: { id: true, platform: true, status: true },
          },
        },
      });

      // Add new delayed job
      await socialPublishQueue.add(
        "publish-post",
        {
          postId: input.postId,
          workspaceId: input.workspaceId,
        },
        {
          delay,
          jobId: `post-${input.postId}`,
          removeOnComplete: true,
        }
      );

      return updated;
    }),

  /**
   * Cancel a scheduled post: remove BullMQ job, set status back to DRAFT.
   */
  cancelSchedule: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        postId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.prisma.post.findUnique({
        where: { id: input.postId },
      });

      if (!post || post.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Post not found in this workspace",
        });
      }

      if (post.status !== PostStatus.SCHEDULED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only scheduled posts can be cancelled",
        });
      }

      // Remove BullMQ job
      const existingJob = await socialPublishQueue.getJob(`post-${input.postId}`);
      if (existingJob) {
        await existingJob.remove();
      }

      // Update post status back to DRAFT
      const updated = await ctx.prisma.post.update({
        where: { id: input.postId },
        data: {
          status: PostStatus.DRAFT,
          scheduledAt: null,
        },
        include: {
          platforms: {
            select: { id: true, platform: true, status: true },
          },
        },
      });

      // Reset platform statuses
      await ctx.prisma.postPlatform.updateMany({
        where: {
          postId: input.postId,
          status: PostStatus.SCHEDULED,
        },
        data: { status: PostStatus.DRAFT },
      });

      return updated;
    }),

  /**
   * Get the next 10 upcoming scheduled posts.
   */
  getUpcoming: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.post.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: PostStatus.SCHEDULED,
          scheduledAt: { gt: new Date() },
        },
        include: {
          platforms: {
            select: {
              id: true,
              platform: true,
              status: true,
            },
          },
        },
        orderBy: { scheduledAt: "asc" },
        take: 10,
      });
    }),
});
