import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../init";
import {
  generateLandingPage,
  deployLandingPage,
  WebbyServiceError,
} from "@/server/services/integrations/webby";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const generateLandingInput = z.object({
  workspaceId: z.string(),
  prompt: z.string().min(10, "Il prompt deve essere di almeno 10 caratteri"),
});

const deployLandingInput = z.object({
  workspaceId: z.string(),
  pageId: z.string(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const integrationsRouter = router({
  /**
   * Generate a landing page via Webby from a prompt.
   */
  generateLanding: workspaceProcedure
    .input(generateLandingInput)
    .mutation(async ({ input }) => {
      try {
        const result = await generateLandingPage(
          input.prompt,
          input.workspaceId,
        );
        return result;
      } catch (err) {
        if (err instanceof WebbyServiceError) {
          throw new TRPCError({
            code:
              err.statusCode >= 500
                ? "INTERNAL_SERVER_ERROR"
                : "BAD_REQUEST",
            message: err.message,
            cause: err,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to reach Webby service",
        });
      }
    }),

  /**
   * Deploy a generated landing page (injects tracking script automatically).
   */
  deployLanding: workspaceProcedure
    .input(deployLandingInput)
    .mutation(async ({ input }) => {
      try {
        const result = await deployLandingPage(input.pageId);
        return result;
      } catch (err) {
        if (err instanceof WebbyServiceError) {
          throw new TRPCError({
            code:
              err.statusCode >= 500
                ? "INTERNAL_SERVER_ERROR"
                : "BAD_REQUEST",
            message: err.message,
            cause: err,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to reach Webby service",
        });
      }
    }),
});
