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

      return ctx.prisma.workspace.create({
        data: {
          name: input.name,
          slug: input.slug,
          members: {
            create: {
              userId: ctx.user.id!,
              role: "OWNER",
            },
          },
        },
      });
    }),
});
