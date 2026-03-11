import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Platform } from "@prisma/client";
import { router, workspaceProcedure } from "../init";

const OAUTH_URLS: Record<string, string> = {
  FACEBOOK: "https://www.facebook.com/v19.0/dialog/oauth",
  INSTAGRAM: "https://www.facebook.com/v19.0/dialog/oauth",
  LINKEDIN: "https://www.linkedin.com/oauth/v2/authorization",
  TWITTER: "https://twitter.com/i/oauth2/authorize",
  TIKTOK: "https://www.tiktok.com/v2/auth/authorize",
  YOUTUBE: "https://accounts.google.com/o/oauth2/v2/auth",
};

export const socialRouter = router({
  // List all social accounts for a workspace
  list: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.socialAccount.findMany({
        where: { workspaceId: input.workspaceId },
        select: {
          id: true,
          platform: true,
          accountName: true,
          accountId: true,
          tokenExpiresAt: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  // Disconnect (delete) a social account
  disconnect: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        accountId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.socialAccount.findUnique({
        where: { id: input.accountId },
      });

      if (!account || account.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Social account not found",
        });
      }

      await ctx.prisma.socialAccount.delete({
        where: { id: input.accountId },
      });

      return { success: true };
    }),

  // Generate OAuth URL for a given platform (placeholder)
  getAuthUrl: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        platform: z.nativeEnum(Platform),
      })
    )
    .query(({ input }) => {
      const baseUrl = OAUTH_URLS[input.platform];
      if (!baseUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `OAuth not supported for ${input.platform}`,
        });
      }

      // Placeholder: in production, add client_id, redirect_uri, scopes, state etc.
      const params = new URLSearchParams({
        response_type: "code",
        client_id: "PLACEHOLDER_CLIENT_ID",
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/social/callback/${input.platform.toLowerCase()}`,
        state: input.workspaceId,
      });

      return { url: `${baseUrl}?${params.toString()}` };
    }),
});
