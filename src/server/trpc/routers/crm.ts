import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  LeadSource,
  PipelineStage,
  ActivityType,
} from "@prisma/client";
import { router, workspaceProcedure } from "../init";
import {
  importContactsCsv,
  extractHeaders,
  autoDetectMapping,
  type ColumnMapping,
} from "@/server/services/crm/csv-import";
import {
  createSegment,
  updateSegment,
  deleteSegment,
  evaluateSegment,
  previewSegment,
  listSegments,
  refreshSegmentCount,
  type SegmentDefinition,
} from "@/server/services/crm/segmentation";
import {
  registerWebhook,
  updateWebhook,
  deleteWebhook,
  listWebhooks,
  getDeliveries,
  rotateSecret,
  type WebhookEvent,
} from "@/server/services/crm/webhook";

const segmentConditionSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const segmentDefinitionSchema = z.object({
  logic: z.enum(["AND", "OR"]),
  conditions: z.array(segmentConditionSchema),
});

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const crmRouter = router({
  // ─── List contacts (paginated, searchable, filterable, sortable) ───
  listContacts: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(25),
        search: z.string().optional(),
        stage: z.nativeEnum(PipelineStage).optional(),
        source: z.nativeEnum(LeadSource).optional(),
        tags: z.array(z.string()).optional(),
        sortBy: z
          .enum([
            "firstName",
            "email",
            "company",
            "stage",
            "score",
            "source",
            "createdAt",
          ])
          .default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ ctx, input }) => {
      const {
        workspaceId,
        page,
        perPage,
        search,
        stage,
        source,
        tags,
        sortBy,
        sortOrder,
      } = input;

      const where: NonNullable<Parameters<typeof ctx.prisma.contact.findMany>[0]>["where"] & Record<string, unknown> = {
        workspaceId,
      };

      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }

      if (stage) where.stage = stage;
      if (source) where.source = source;
      if (tags && tags.length > 0) where.tags = { hasSome: tags };

      const [contacts, total] = await Promise.all([
        ctx.prisma.contact.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        ctx.prisma.contact.count({ where }),
      ]);

      return {
        contacts,
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      };
    }),

  // ─── Get single contact with notes & recent activities ─────────────
  getContact: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
        include: {
          notes: { orderBy: { createdAt: "desc" } },
          activities: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });

      if (!contact || contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      return contact;
    }),

  // ─── Create contact ────────────────────────────────────────────────
  createContact: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        email: z.string().email(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        jobTitle: z.string().optional(),
        source: z.nativeEnum(LeadSource).optional(),
        stage: z.nativeEnum(PipelineStage).default("LEAD"),
        score: z.number().int().min(0).default(0),
        tags: z.array(z.string()).default([]),
        avatarUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, ...data } = input;

      const existing = await ctx.prisma.contact.findUnique({
        where: { email_workspaceId: { email: data.email, workspaceId } },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A contact with this email already exists in the workspace",
        });
      }

      return ctx.prisma.contact.create({
        data: { ...data, workspaceId },
      });
    }),

  // ─── Update contact ────────────────────────────────────────────────
  updateContact: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
        email: z.string().email().optional(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        jobTitle: z.string().optional(),
        source: z.nativeEnum(LeadSource).optional(),
        stage: z.nativeEnum(PipelineStage).optional(),
        score: z.number().int().min(0).optional(),
        tags: z.array(z.string()).optional(),
        avatarUrl: z.string().url().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, contactId, ...data } = input;

      const contact = await ctx.prisma.contact.findUnique({
        where: { id: contactId },
      });
      if (!contact || contact.workspaceId !== workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      // If stage changed, log a STAGE_CHANGE activity
      if (data.stage && data.stage !== contact.stage) {
        await ctx.prisma.activity.create({
          data: {
            type: "STAGE_CHANGE",
            description: `Stage changed from ${contact.stage} to ${data.stage}`,
            metadata: { from: contact.stage, to: data.stage },
            contactId,
          },
        });
      }

      return ctx.prisma.contact.update({
        where: { id: contactId },
        data,
      });
    }),

  // ─── Delete contact ────────────────────────────────────────────────
  deleteContact: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
      });
      if (!contact || contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      await ctx.prisma.contact.delete({ where: { id: input.contactId } });
      return { success: true };
    }),

  // ─── Bulk delete contacts ──────────────────────────────────────────
  bulkDelete: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.contact.deleteMany({
        where: {
          id: { in: input.contactIds },
          workspaceId: input.workspaceId,
        },
      });

      return { deleted: result.count };
    }),

  // ─── Add note ──────────────────────────────────────────────────────
  addNote: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
      });
      if (!contact || contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      const [note] = await Promise.all([
        ctx.prisma.contactNote.create({
          data: { content: input.content, contactId: input.contactId },
        }),
        ctx.prisma.activity.create({
          data: {
            type: "NOTE",
            description: input.content.slice(0, 200),
            contactId: input.contactId,
          },
        }),
      ]);

      return note;
    }),

  // ─── List notes for a contact ─────────────────────────────────────
  listNotes: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
        select: { workspaceId: true },
      });
      if (!contact || contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      return ctx.prisma.contactNote.findMany({
        where: { contactId: input.contactId },
        orderBy: { createdAt: "desc" },
      });
    }),

  // ─── Delete note ────────────────────────────────────────────────────
  deleteNote: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        noteId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.contactNote.findUnique({
        where: { id: input.noteId },
        include: { contact: { select: { workspaceId: true } } },
      });
      if (!note || note.contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      await ctx.prisma.contactNote.delete({ where: { id: input.noteId } });
      return { success: true };
    }),

  // ─── Log activity (alias for addActivity) ──────────────────────────
  logActivity: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
        type: z.nativeEnum(ActivityType),
        description: z.string().max(2000).optional(),
        metadata: z.record(z.string(), metadataValueSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
        select: { workspaceId: true },
      });
      if (!contact || contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      return ctx.prisma.activity.create({
        data: {
          type: input.type,
          description: input.description,
          metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
          contactId: input.contactId,
        },
      });
    }),

  // ─── Get timeline (paginated) ──────────────────────────────────────
  getTimeline: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
        select: { workspaceId: true },
      });
      if (!contact || contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      const activities = await ctx.prisma.activity.findMany({
        where: { contactId: input.contactId },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (activities.length > input.limit) {
        const next = activities.pop();
        nextCursor = next?.id;
      }

      return { activities, nextCursor };
    }),

  // ─── Add activity ──────────────────────────────────────────────────
  addActivity: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
        type: z.nativeEnum(ActivityType),
        description: z.string().max(2000).optional(),
        metadata: z.record(z.string(), metadataValueSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
        select: { workspaceId: true },
      });
      if (!contact || contact.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      return ctx.prisma.activity.create({
        data: {
          type: input.type,
          description: input.description,
          metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
          contactId: input.contactId,
        },
      });
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // CSV IMPORT
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Extract headers & auto-detect mapping ──────────────────────────
  importPreview: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        csvContent: z.string().min(1),
        delimiter: z.string().max(1).default(","),
      })
    )
    .mutation(async ({ input }) => {
      const headers = extractHeaders(input.csvContent, input.delimiter);
      if (headers.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No headers found in CSV" });
      }
      const suggestedMapping = autoDetectMapping(headers);
      return { headers, suggestedMapping };
    }),

  // ─── Import contacts from CSV ───────────────────────────────────────
  importContacts: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        csvContent: z.string().min(1),
        mapping: z.object({
          email: z.string(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          phone: z.string().optional(),
          company: z.string().optional(),
          jobTitle: z.string().optional(),
          source: z.string().optional(),
          stage: z.string().optional(),
          tags: z.string().optional(),
        }),
        delimiter: z.string().max(1).default(","),
        defaultTags: z.array(z.string()).default([]),
        defaultSource: z.nativeEnum(LeadSource).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const stats = await importContactsCsv({
        workspaceId: input.workspaceId,
        csvContent: input.csvContent,
        mapping: input.mapping as ColumnMapping,
        delimiter: input.delimiter,
        defaultTags: input.defaultTags,
        defaultSource: input.defaultSource,
      });

      return stats;
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // SEGMENTATION
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Zod schema for segment conditions (recursive) ──────────────────

  // ─── List segments ──────────────────────────────────────────────────
  listSegments: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ input }) => {
      return listSegments(input.workspaceId);
    }),

  // ─── Create segment ─────────────────────────────────────────────────
  createSegment: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        definition: segmentDefinitionSchema,
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await createSegment({
          name: input.name,
          description: input.description,
          definition: input.definition as SegmentDefinition,
          workspaceId: input.workspaceId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to create segment",
        });
      }
    }),

  // ─── Update segment ─────────────────────────────────────────────────
  updateSegment: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        segmentId: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        definition: segmentDefinitionSchema.optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await updateSegment({
          segmentId: input.segmentId,
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description,
          definition: input.definition as SegmentDefinition | undefined,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Segment not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Segment not found" });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to update segment",
        });
      }
    }),

  // ─── Delete segment ─────────────────────────────────────────────────
  deleteSegment: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        segmentId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await deleteSegment(input.segmentId, input.workspaceId);
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "Segment not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Segment not found" });
        }
        throw error;
      }
    }),

  // ─── Evaluate segment (get matching contacts) ──────────────────────
  evaluateSegment: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        segmentId: z.string(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ input }) => {
      try {
        return await evaluateSegment(input.segmentId, input.workspaceId, {
          page: input.page,
          perPage: input.perPage,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Segment not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Segment not found" });
        }
        throw error;
      }
    }),

  // ─── Preview segment (dry-run without saving) ─────────────────────
  previewSegment: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        definition: segmentDefinitionSchema,
        limit: z.number().int().min(1).max(50).default(10),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await previewSegment(
          input.definition as SegmentDefinition,
          input.workspaceId,
          input.limit,
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to preview segment",
        });
      }
    }),

  // ─── Refresh segment count ─────────────────────────────────────────
  refreshSegmentCount: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        segmentId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const count = await refreshSegmentCount(input.segmentId, input.workspaceId);
        return { count };
      } catch (error) {
        if (error instanceof Error && error.message === "Segment not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Segment not found" });
        }
        throw error;
      }
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // WEBHOOKS
  // ═══════════════════════════════════════════════════════════════════════

  // ─── List webhooks ──────────────────────────────────────────────────
  listWebhooks: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ input }) => {
      return listWebhooks(input.workspaceId);
    }),

  // ─── Register webhook ──────────────────────────────────────────────
  registerWebhook: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        url: z.string().url(),
        events: z.array(
          z.enum([
            "contact.created",
            "contact.updated",
            "contact.deleted",
            "deal.won",
            "deal.lost",
            "deal.created",
            "deal.updated",
            "note.created",
            "stage.changed",
            "score.updated",
            "import.completed",
          ])
        ).min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await registerWebhook({
          url: input.url,
          events: input.events as WebhookEvent[],
          workspaceId: input.workspaceId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to register webhook",
        });
      }
    }),

  // ─── Update webhook ─────────────────────────────────────────────────
  updateWebhook: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        webhookId: z.string(),
        url: z.string().url().optional(),
        events: z.array(
          z.enum([
            "contact.created",
            "contact.updated",
            "contact.deleted",
            "deal.won",
            "deal.lost",
            "deal.created",
            "deal.updated",
            "note.created",
            "stage.changed",
            "score.updated",
            "import.completed",
          ])
        ).min(1).optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await updateWebhook({
          webhookId: input.webhookId,
          workspaceId: input.workspaceId,
          url: input.url,
          events: input.events as WebhookEvent[] | undefined,
          active: input.active,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Webhook not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to update webhook",
        });
      }
    }),

  // ─── Delete webhook ─────────────────────────────────────────────────
  deleteWebhook: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        webhookId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await deleteWebhook(input.webhookId, input.workspaceId);
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "Webhook not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
        }
        throw error;
      }
    }),

  // ─── Get webhook deliveries ────────────────────────────────────────
  getWebhookDeliveries: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        webhookId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      try {
        return await getDeliveries(input.webhookId, input.workspaceId, input.limit);
      } catch (error) {
        if (error instanceof Error && error.message === "Webhook not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
        }
        throw error;
      }
    }),

  // ─── Rotate webhook secret ────────────────────────────────────────
  rotateWebhookSecret: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        webhookId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const secret = await rotateSecret(input.webhookId, input.workspaceId);
        return { secret };
      } catch (error) {
        if (error instanceof Error && error.message === "Webhook not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
        }
        throw error;
      }
    }),
});
