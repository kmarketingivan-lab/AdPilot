import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../init";
import type { Platform, PostStatus } from "@prisma/client";

const platformEnum = z.enum([
  "FACEBOOK",
  "INSTAGRAM",
  "LINKEDIN",
  "TWITTER",
  "TIKTOK",
  "YOUTUBE",
]);

const postStatusEnum = z.enum([
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
]);

export const postRouter = router({
  // Create a new post
  create: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        content: z.string().min(1, "Content is required").max(63206),
        hashtags: z.array(z.string()).default([]),
        platforms: z.array(platformEnum).min(1, "Select at least one platform"),
        scheduledAt: z.string().datetime().optional(),
        status: postStatusEnum.default("DRAFT"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate that social accounts exist for selected platforms
      const socialAccounts = await ctx.prisma.socialAccount.findMany({
        where: {
          workspaceId: input.workspaceId,
          platform: { in: input.platforms as Platform[] },
        },
      });

      const connectedPlatforms = new Set(socialAccounts.map((a) => a.platform));
      const missingPlatforms = input.platforms.filter(
        (p) => !connectedPlatforms.has(p as Platform)
      );

      if (missingPlatforms.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No connected accounts for: ${missingPlatforms.join(", ")}. Connect them in Settings first.`,
        });
      }

      const scheduledAt = input.scheduledAt
        ? new Date(input.scheduledAt)
        : undefined;
      const status: PostStatus =
        scheduledAt && input.status === "DRAFT" ? "SCHEDULED" : input.status;

      const post = await ctx.prisma.post.create({
        data: {
          content: input.content,
          hashtags: input.hashtags,
          scheduledAt,
          status,
          workspaceId: input.workspaceId,
          platforms: {
            create: input.platforms.map((platform) => {
              const account = socialAccounts.find(
                (a) => a.platform === platform
              )!;
              return {
                platform: platform as Platform,
                status,
                socialAccountId: account.id,
              };
            }),
          },
        },
        include: {
          platforms: { include: { socialAccount: true } },
          mediaFiles: true,
        },
      });

      return post;
    }),

  // Update an existing post
  update: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        postId: z.string(),
        content: z.string().min(1).max(63206).optional(),
        hashtags: z.array(z.string()).optional(),
        platforms: z.array(platformEnum).min(1).optional(),
        scheduledAt: z.string().datetime().nullish(),
        status: postStatusEnum.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.post.findUnique({
        where: { id: input.postId },
        include: { platforms: true },
      });

      if (!existing || existing.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      // Cannot edit published or currently publishing posts
      if (existing.status === "PUBLISHED" || existing.status === "PUBLISHING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit a published or publishing post",
        });
      }

      const scheduledAt =
        input.scheduledAt === null
          ? null
          : input.scheduledAt
            ? new Date(input.scheduledAt)
            : undefined;

      // If platforms changed, rebuild PostPlatform records
      if (input.platforms) {
        const socialAccounts = await ctx.prisma.socialAccount.findMany({
          where: {
            workspaceId: input.workspaceId,
            platform: { in: input.platforms as Platform[] },
          },
        });

        const connectedPlatforms = new Set(
          socialAccounts.map((a) => a.platform)
        );
        const missingPlatforms = input.platforms.filter(
          (p) => !connectedPlatforms.has(p as Platform)
        );

        if (missingPlatforms.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `No connected accounts for: ${missingPlatforms.join(", ")}`,
          });
        }

        // Delete old platform records and create new ones
        await ctx.prisma.postPlatform.deleteMany({
          where: { postId: input.postId },
        });

        await ctx.prisma.postPlatform.createMany({
          data: input.platforms.map((platform) => {
            const account = socialAccounts.find(
              (a) => a.platform === platform
            )!;
            return {
              platform: platform as Platform,
              status: input.status ?? existing.status,
              postId: input.postId,
              socialAccountId: account.id,
            };
          }),
        });
      }

      const post = await ctx.prisma.post.update({
        where: { id: input.postId },
        data: {
          ...(input.content !== undefined && { content: input.content }),
          ...(input.hashtags !== undefined && { hashtags: input.hashtags }),
          ...(scheduledAt !== undefined && { scheduledAt }),
          ...(input.status !== undefined && { status: input.status }),
        },
        include: {
          platforms: { include: { socialAccount: true } },
          mediaFiles: true,
        },
      });

      return post;
    }),

  // Delete a post
  delete: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        postId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.post.findUnique({
        where: { id: input.postId },
      });

      if (!existing || existing.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (existing.status === "PUBLISHING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete a post that is currently publishing",
        });
      }

      await ctx.prisma.post.delete({ where: { id: input.postId } });

      return { success: true };
    }),

  // Get a single post by ID
  get: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        postId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const post = await ctx.prisma.post.findUnique({
        where: { id: input.postId },
        include: {
          platforms: {
            include: {
              socialAccount: {
                select: {
                  id: true,
                  platform: true,
                  accountName: true,
                },
              },
            },
          },
          mediaFiles: {
            include: { media: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      if (!post || post.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      return post;
    }),

  // List posts for a workspace with filters and pagination
  list: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        status: postStatusEnum.optional(),
        platform: platformEnum.optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        workspaceId: input.workspaceId,
      };

      if (input.status) {
        where.status = input.status;
      }

      if (input.platform) {
        where.platforms = {
          some: { platform: input.platform },
        };
      }

      if (input.dateFrom || input.dateTo) {
        where.createdAt = {
          ...(input.dateFrom && { gte: new Date(input.dateFrom) }),
          ...(input.dateTo && { lte: new Date(input.dateTo) }),
        };
      }

      const posts = await ctx.prisma.post.findMany({
        where,
        include: {
          platforms: {
            include: {
              socialAccount: {
                select: {
                  id: true,
                  platform: true,
                  accountName: true,
                },
              },
            },
          },
          _count: { select: { mediaFiles: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (posts.length > input.limit) {
        const next = posts.pop();
        nextCursor = next?.id;
      }

      return { posts, nextCursor };
    }),

  // AI Caption Generator (placeholder — returns mock caption)
  generateCaption: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        platform: platformEnum,
        topic: z.string().min(1, "Provide a topic or description").max(500),
        tone: z
          .enum(["professional", "casual", "humorous", "inspirational"])
          .default("professional"),
        language: z.enum(["it", "en", "es", "fr", "de"]).default("it"),
      })
    )
    .mutation(async ({ input }) => {
      // Placeholder: In production, this will call an LLM API (e.g. OpenAI, Anthropic)
      const mockCaptions: Record<string, string> = {
        professional: `${input.topic} — Scopri come possiamo aiutarti a raggiungere i tuoi obiettivi. La qualita e l'innovazione sono al centro di tutto cio che facciamo.\n\n#${input.topic.replace(/\s+/g, "")} #Business #Innovation`,
        casual: `Hey! Parliamo di ${input.topic} 🎯\nAbbiamo qualcosa di speciale per te, vieni a scoprirlo!\n\n#${input.topic.replace(/\s+/g, "")} #LifeStyle`,
        humorous: `Se ${input.topic} fosse una persona, sarebbe la piu interessante alla festa 🎉\nScherzi a parte, ecco perche dovresti darci un'occhiata!\n\n#${input.topic.replace(/\s+/g, "")} #Fun`,
        inspirational: `Ogni grande traguardo inizia con un singolo passo. ${input.topic} e il tuo prossimo passo verso il successo.\n\n#${input.topic.replace(/\s+/g, "")} #Motivation #Success`,
      };

      const caption = mockCaptions[input.tone] ?? mockCaptions.professional;

      return {
        caption,
        platform: input.platform,
        tone: input.tone,
        language: input.language,
        aiGenerated: true,
      };
    }),
});
