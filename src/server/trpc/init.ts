import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createTRPCContext() {
  const session = await auth();

  return {
    session,
    prisma,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// Auth middleware — requires authenticated user
const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      session: ctx.session,
      user: ctx.session.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);

// Workspace middleware — requires workspace context
const enforceWorkspace = t.middleware(async ({ ctx, next, input }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const workspaceId = (input as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "workspaceId is required",
    });
  }

  const membership = await ctx.prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: ctx.session.user.id!,
        workspaceId,
      },
    },
    include: { workspace: true },
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a member of this workspace",
    });
  }

  return next({
    ctx: {
      session: ctx.session,
      user: ctx.session.user,
      workspace: membership.workspace,
      membership,
    },
  });
});

export const workspaceProcedure = t.procedure.use(enforceWorkspace);
