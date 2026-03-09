import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PipelineStage } from "@prisma/client";
import { router, workspaceProcedure } from "../init";
import {
  calculateScore,
  getScoreBreakdown,
  recalculateAllScores,
} from "@/server/services/crm/lead-scoring";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const pipelineStageEnum = z.nativeEnum(PipelineStage);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const pipelineRouter = router({
  /**
   * Get all contacts for a workspace, grouped by pipeline stage.
   */
  getByStage: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const contacts = await ctx.prisma.contact.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          _count: { select: { activities: true } },
        },
        orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      });

      const grouped: Record<PipelineStage, typeof contacts> = {
        LEAD: [],
        MQL: [],
        SQL: [],
        OPPORTUNITY: [],
        CUSTOMER: [],
        LOST: [],
      };

      for (const contact of contacts) {
        grouped[contact.stage].push(contact);
      }

      return grouped;
    }),

  /**
   * Move a contact to a different pipeline stage (drag & drop).
   * Logs a STAGE_CHANGE activity.
   */
  moveContact: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
        newStage: pipelineStageEnum,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
        select: { id: true, workspaceId: true, stage: true },
      });

      if (!contact || contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      if (contact.stage === input.newStage) {
        return contact;
      }

      const [updated] = await ctx.prisma.$transaction([
        ctx.prisma.contact.update({
          where: { id: input.contactId },
          data: { stage: input.newStage },
        }),
        ctx.prisma.activity.create({
          data: {
            type: "STAGE_CHANGE",
            description: `Moved from ${contact.stage} to ${input.newStage}`,
            contactId: input.contactId,
            metadata: {
              previousStage: contact.stage,
              newStage: input.newStage,
            },
          },
        }),
      ]);

      return updated;
    }),

  /**
   * Get score breakdown for a specific contact.
   */
  getScoreBreakdown: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
        select: { id: true, workspaceId: true },
      });

      if (!contact || contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      return getScoreBreakdown(input.contactId);
    }),

  /**
   * Trigger batch recalculation of lead scores for all contacts in a workspace.
   */
  recalculateScores: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ input }) => {
      const count = await recalculateAllScores(input.workspaceId);

      // Re-score can be expensive; after it finishes we simply return the count.
      return { recalculated: count };
    }),
});
