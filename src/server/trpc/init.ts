import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SELF_HOSTED = !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET;
const LOCAL_ADMIN_EMAIL = "admin@adpilot.local";

async function getOrCreateLocalAdmin() {
  let user = await prisma.user.findUnique({ where: { email: LOCAL_ADMIN_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: LOCAL_ADMIN_EMAIL,
        name: "Admin",
        role: "ADMIN",
        emailVerified: new Date(),
        onboarded: true,
      },
    });
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: "admin",
      plan: "agency",
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function createTRPCContext() {
  let session = await auth();

  // Self-hosted: auto-login as local admin if no session
  if (!session?.user && SELF_HOSTED) {
    session = await getOrCreateLocalAdmin();
  }

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
