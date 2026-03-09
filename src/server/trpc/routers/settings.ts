import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomBytes, createHash } from "crypto";
import { router, workspaceProcedure } from "../init";

export const settingsRouter = router({
  // ─── General Settings ───────────────────────────────────────────
  getGeneral: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx }) => {
      return {
        id: ctx.workspace.id,
        name: ctx.workspace.name,
        slug: ctx.workspace.slug,
        plan: ctx.workspace.plan,
        createdAt: ctx.workspace.createdAt,
      };
    }),

  updateGeneral: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(2).max(50).optional(),
        slug: z
          .string()
          .min(2)
          .max(50)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.membership.role !== "OWNER" &&
        ctx.membership.role !== "ADMIN"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (input.slug) {
        const existing = await ctx.prisma.workspace.findUnique({
          where: { slug: input.slug },
        });
        if (existing && existing.id !== ctx.workspace.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Slug already taken",
          });
        }
      }

      return ctx.prisma.workspace.update({
        where: { id: ctx.workspace.id },
        data: {
          ...(input.name && { name: input.name }),
          ...(input.slug && { slug: input.slug }),
        },
      });
    }),

  // ─── Team Management ───────────────────────────────────────────
  getMembers: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx }) => {
      return ctx.prisma.workspaceMember.findMany({
        where: { workspaceId: ctx.workspace.id },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      });
    }),

  updateMemberRole: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        memberId: z.string(),
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.membership.role !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const member = await ctx.prisma.workspaceMember.findUnique({
        where: { id: input.memberId },
      });
      if (!member || member.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (member.role === "OWNER") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change owner role",
        });
      }

      return ctx.prisma.workspaceMember.update({
        where: { id: input.memberId },
        data: { role: input.role },
      });
    }),

  // ─── Integrations Overview ─────────────────────────────────────
  getIntegrations: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx }) => {
      const [socialAccounts, adsConnections, heatmapSites] = await Promise.all([
        ctx.prisma.socialAccount.findMany({
          where: { workspaceId: ctx.workspace.id },
          select: {
            id: true,
            platform: true,
            accountName: true,
            createdAt: true,
          },
        }),
        ctx.prisma.adsConnection.findMany({
          where: { workspaceId: ctx.workspace.id },
          select: {
            id: true,
            platform: true,
            accountName: true,
            createdAt: true,
          },
        }),
        ctx.prisma.heatmapSite.findMany({
          where: { workspaceId: ctx.workspace.id },
          select: { id: true, domain: true, trackingId: true, createdAt: true },
        }),
      ]);

      return { socialAccounts, adsConnections, heatmapSites };
    }),

  // ─── API Keys ──────────────────────────────────────────────────
  listApiKeys: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx }) => {
      return ctx.prisma.apiKey.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  createApiKey: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(100),
        expiresInDays: z.number().min(1).max(365).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.membership.role !== "OWNER" &&
        ctx.membership.role !== "ADMIN"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Generate API key: ap_<random>
      const rawKey = `ap_${randomBytes(32).toString("hex")}`;
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 10);

      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400000)
        : null;

      await ctx.prisma.apiKey.create({
        data: {
          name: input.name,
          keyHash,
          keyPrefix,
          expiresAt,
          workspaceId: ctx.workspace.id,
          createdBy: ctx.user.id!,
        },
      });

      // Return the raw key only once — never stored
      return { key: rawKey, keyPrefix, expiresAt };
    }),

  revokeApiKey: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        keyId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.membership.role !== "OWNER" &&
        ctx.membership.role !== "ADMIN"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const key = await ctx.prisma.apiKey.findUnique({
        where: { id: input.keyId },
      });
      if (!key || key.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await ctx.prisma.apiKey.delete({ where: { id: input.keyId } });
      return { success: true };
    }),

  // ─── Delete workspace ─────────────────────────────────────────
  deleteWorkspace: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        confirmSlug: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.membership.role !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (input.confirmSlug !== ctx.workspace.slug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirmation slug does not match",
        });
      }

      await ctx.prisma.workspace.delete({
        where: { id: ctx.workspace.id },
      });
      return { success: true };
    }),
});
