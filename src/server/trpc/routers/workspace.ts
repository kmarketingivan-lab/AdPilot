import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, workspaceProcedure } from "../init";

export const workspaceRouter = router({
  // List workspaces for authenticated user
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.prisma.workspaceMember.findMany({
      where: { userId: ctx.user.id! },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    return memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
      memberCount: m.workspace._count.members,
    }));
  }),

  // Get single workspace by ID
  get: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx }) => {
      return ctx.workspace;
    }),

  // Create new workspace
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(50),
        slug: z
          .string()
          .min(2)
          .max(50)
          .regex(/^[a-z0-9-]+$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.workspace.findUnique({
        where: { slug: input.slug },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Slug already taken",
        });
      }

      // Self-hosted: default to AGENCY (unlimited). SaaS: default to FREE.
      const isSelfHosted = !process.env.STRIPE_SECRET_KEY;
      const defaultPlan = isSelfHosted ? "AGENCY" : "FREE";

      return ctx.prisma.workspace.create({
        data: {
          name: input.name,
          slug: input.slug,
          plan: defaultPlan,
          members: {
            create: {
              userId: ctx.user.id!,
              role: "OWNER",
            },
          },
        },
      });
    }),

  // Update workspace
  update: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(2).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.membership.role !== "OWNER" && ctx.membership.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.prisma.workspace.update({
        where: { id: input.workspaceId },
        data: { ...(input.name && { name: input.name }) },
      });
    }),

  // List members
  members: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workspaceMember.findMany({
        where: { workspaceId: input.workspaceId },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { joinedAt: "asc" },
      });
    }),

  // Invite member by email
  invite: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        email: z.string().email(),
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.membership.role !== "OWNER" && ctx.membership.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found. They must sign up first.",
        });
      }

      const existing = await ctx.prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: user.id,
            workspaceId: input.workspaceId,
          },
        },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User is already a member",
        });
      }

      return ctx.prisma.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: input.workspaceId,
          role: input.role,
        },
      });
    }),

  // Remove member
  removeMember: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        memberId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.membership.role !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const member = await ctx.prisma.workspaceMember.findUnique({
        where: { id: input.memberId },
      });
      if (!member || member.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (member.role === "OWNER") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot remove workspace owner",
        });
      }

      return ctx.prisma.workspaceMember.delete({
        where: { id: input.memberId },
      });
    }),
});
