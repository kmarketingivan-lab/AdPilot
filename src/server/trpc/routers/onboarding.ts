import { z } from "zod";
import { router, protectedProcedure } from "../init";

export const onboardingRouter = router({
  // Get onboarding status
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id! },
      select: { onboarded: true },
    });

    // Check what steps are completed
    const workspaces = await ctx.prisma.workspaceMember.findMany({
      where: { userId: ctx.user.id! },
      include: {
        workspace: {
          include: {
            _count: {
              select: {
                socialAccounts: true,
                members: true,
                posts: true,
              },
            },
          },
        },
      },
    });

    const firstWorkspace = workspaces[0]?.workspace;

    return {
      onboarded: user.onboarded,
      steps: {
        workspaceCreated: workspaces.length > 0,
        socialConnected: (firstWorkspace?._count.socialAccounts ?? 0) > 0,
        teamInvited: (firstWorkspace?._count.members ?? 0) > 1,
        firstPostCreated: (firstWorkspace?._count.posts ?? 0) > 0,
      },
      workspaceId: firstWorkspace?.id ?? null,
    };
  }),

  // Complete onboarding
  complete: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id! },
      data: { onboarded: true },
    });
    return { success: true };
  }),

  // Create workspace during onboarding
  createWorkspace: protectedProcedure
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
        // If user already owns it, return it
        const membership = await ctx.prisma.workspaceMember.findUnique({
          where: {
            userId_workspaceId: {
              userId: ctx.user.id!,
              workspaceId: existing.id,
            },
          },
        });
        if (membership) return existing;

        throw new Error("Slug already taken");
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
            create: { userId: ctx.user.id!, role: "OWNER" },
          },
        },
      });
    }),

  // Skip onboarding
  skip: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id! },
      data: { onboarded: true },
    });
    return { success: true };
  }),
});
