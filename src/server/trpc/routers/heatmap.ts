import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../init";
import {
  linkSessionToContact,
  getContactSessions,
} from "@/server/services/heatmap/crm-link";
import {
  deleteExpiredSessions,
  exportUserData,
} from "@/server/services/heatmap/privacy";

export const heatmapRouter = router({
  // ── Get setup / tracking config for workspace ────────────────────────────

  getSetup: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sites = await ctx.prisma.heatmapSite.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          domain: true,
          trackingId: true,
          createdAt: true,
          _count: { select: { sessions: true } },
        },
      });

      return sites.map((s) => ({
        id: s.id,
        domain: s.domain,
        trackingId: s.trackingId,
        createdAt: s.createdAt,
        sessionCount: s._count.sessions,
      }));
    }),

  // ── Add a new tracked domain ──────────────────────────────────────────────

  addSite: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        domain: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const site = await ctx.prisma.heatmapSite.create({
        data: {
          domain: input.domain,
          workspaceId: input.workspaceId,
        },
      });

      return {
        id: site.id,
        domain: site.domain,
        trackingId: site.trackingId,
      };
    }),

  // ── Verify installation — check if events received in last 5 minutes ────

  verifyInstallation: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        siteId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const site = await ctx.prisma.heatmapSite.findFirst({
        where: { id: input.siteId, workspaceId: input.workspaceId },
      });

      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const recentSession = await ctx.prisma.heatmapSession.findFirst({
        where: {
          siteId: site.id,
          startedAt: { gte: fiveMinutesAgo },
        },
        select: { id: true, startedAt: true, pageUrl: true },
        orderBy: { startedAt: "desc" },
      });

      return {
        verified: !!recentSession,
        lastEvent: recentSession
          ? {
              sessionId: recentSession.id,
              at: recentSession.startedAt,
              pageUrl: recentSession.pageUrl,
            }
          : null,
      };
    }),

  // ── List sessions with filters ────────────────────────────────────────────

  getSessions: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        siteId: z.string(),
        pageUrl: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify site belongs to workspace
      const site = await ctx.prisma.heatmapSite.findFirst({
        where: { id: input.siteId, workspaceId: input.workspaceId },
      });
      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const where = {
        siteId: input.siteId,
        ...(input.pageUrl && { pageUrl: { contains: input.pageUrl } }),
        ...(input.startDate &&
          input.endDate && {
            startedAt: { gte: input.startDate, lte: input.endDate },
          }),
      };

      const [sessions, total] = await Promise.all([
        ctx.prisma.heatmapSession.findMany({
          where,
          orderBy: { startedAt: "desc" },
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          select: {
            id: true,
            visitorId: true,
            userAgent: true,
            screenWidth: true,
            screenHeight: true,
            pageUrl: true,
            duration: true,
            startedAt: true,
            _count: { select: { events: true } },
          },
        }),
        ctx.prisma.heatmapSession.count({ where }),
      ]);

      return {
        sessions: sessions.map((s) => ({
          ...s,
          eventCount: s._count.events,
        })),
        total,
        totalPages: Math.ceil(total / input.perPage),
      };
    }),

  // ── Get aggregated click positions for heatmap ────────────────────────────

  getClickData: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        siteId: z.string(),
        pageUrl: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const site = await ctx.prisma.heatmapSite.findFirst({
        where: { id: input.siteId, workspaceId: input.workspaceId },
      });
      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const events = await ctx.prisma.heatmapEvent.findMany({
        where: {
          type: { in: ["CLICK", "RAGE_CLICK"] },
          session: {
            siteId: input.siteId,
            ...(input.pageUrl && { pageUrl: { contains: input.pageUrl } }),
          },
          ...(input.startDate &&
            input.endDate && {
              timestamp: { gte: input.startDate, lte: input.endDate },
            }),
        },
        select: {
          x: true,
          y: true,
          type: true,
          element: true,
          session: {
            select: { screenWidth: true, screenHeight: true },
          },
        },
      });

      // Normalize coordinates to percentages (relative to viewport)
      const points = events.map((e) => ({
        x: e.session.screenWidth > 0
          ? Math.round((e.x / e.session.screenWidth) * 10000) / 100
          : 0,
        y: e.session.screenHeight > 0
          ? Math.round((e.y / e.session.screenHeight) * 10000) / 100
          : 0,
        isRage: e.type === "RAGE_CLICK",
        element: e.element,
      }));

      return {
        points,
        totalClicks: points.length,
        rageClicks: points.filter((p) => p.isRage).length,
      };
    }),

  // ── Get scroll depth distribution ─────────────────────────────────────────

  getScrollData: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        siteId: z.string(),
        pageUrl: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const site = await ctx.prisma.heatmapSite.findFirst({
        where: { id: input.siteId, workspaceId: input.workspaceId },
      });
      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const events = await ctx.prisma.heatmapEvent.findMany({
        where: {
          type: "SCROLL",
          scrollDepth: { not: null },
          session: {
            siteId: input.siteId,
            ...(input.pageUrl && { pageUrl: { contains: input.pageUrl } }),
          },
          ...(input.startDate &&
            input.endDate && {
              timestamp: { gte: input.startDate, lte: input.endDate },
            }),
        },
        select: {
          scrollDepth: true,
          sessionId: true,
        },
      });

      // Get max scroll depth per session
      const sessionMaxScroll = new Map<string, number>();
      for (const e of events) {
        const current = sessionMaxScroll.get(e.sessionId) ?? 0;
        if ((e.scrollDepth ?? 0) > current) {
          sessionMaxScroll.set(e.sessionId, e.scrollDepth ?? 0);
        }
      }

      const totalSessions = sessionMaxScroll.size;
      if (totalSessions === 0) {
        return { distribution: [], averageDepth: 0, totalSessions: 0 };
      }

      // Build distribution in 10% buckets
      const buckets = Array.from({ length: 10 }, (_, i) => {
        const threshold = (i + 1) * 10;
        let reached = 0;
        for (const maxDepth of sessionMaxScroll.values()) {
          if (maxDepth >= threshold) reached++;
        }
        return {
          depth: threshold,
          percentage: Math.round((reached / totalSessions) * 10000) / 100,
          sessions: reached,
        };
      });

      // Average scroll depth
      let sum = 0;
      for (const d of sessionMaxScroll.values()) sum += d;
      const averageDepth = Math.round((sum / totalSessions) * 100) / 100;

      return { distribution: buckets, averageDepth, totalSessions };
    }),

  // ── Get mouse movement data ───────────────────────────────────────────────

  getMoveData: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        siteId: z.string(),
        pageUrl: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().int().min(1).max(10000).default(5000),
      })
    )
    .query(async ({ ctx, input }) => {
      const site = await ctx.prisma.heatmapSite.findFirst({
        where: { id: input.siteId, workspaceId: input.workspaceId },
      });
      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const events = await ctx.prisma.heatmapEvent.findMany({
        where: {
          type: "MOUSEMOVE",
          session: {
            siteId: input.siteId,
            ...(input.pageUrl && { pageUrl: { contains: input.pageUrl } }),
          },
          ...(input.startDate &&
            input.endDate && {
              timestamp: { gte: input.startDate, lte: input.endDate },
            }),
        },
        select: {
          x: true,
          y: true,
          session: {
            select: { screenWidth: true, screenHeight: true },
          },
        },
        take: input.limit,
        orderBy: { timestamp: "desc" },
      });

      const points = events.map((e) => ({
        x: e.session.screenWidth > 0
          ? Math.round((e.x / e.session.screenWidth) * 10000) / 100
          : 0,
        y: e.session.screenHeight > 0
          ? Math.round((e.y / e.session.screenHeight) * 10000) / 100
          : 0,
      }));

      return { points, totalMoves: points.length };
    }),

  // ── Get tracked pages for a site ──────────────────────────────────────────

  getPages: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        siteId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const site = await ctx.prisma.heatmapSite.findFirst({
        where: { id: input.siteId, workspaceId: input.workspaceId },
      });
      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const sessions = await ctx.prisma.heatmapSession.findMany({
        where: { siteId: input.siteId },
        select: { pageUrl: true },
        distinct: ["pageUrl"],
        orderBy: { startedAt: "desc" },
        take: 100,
      });

      return sessions.map((s) => s.pageUrl);
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // RAGE & DEAD CLICK DETECTION (Task 5.11)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Get rage clicks aggregated by page + element ──────────────────────────

  getRageClicks: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        siteId: z.string(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const site = await ctx.prisma.heatmapSite.findFirst({
        where: { id: input.siteId, workspaceId: input.workspaceId },
      });
      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const events = await ctx.prisma.heatmapEvent.findMany({
        where: {
          type: "RAGE_CLICK",
          session: {
            siteId: input.siteId,
          },
          ...(input.startDate &&
            input.endDate && {
              timestamp: { gte: input.startDate, lte: input.endDate },
            }),
        },
        select: {
          element: true,
          timestamp: true,
          session: {
            select: { pageUrl: true },
          },
        },
        orderBy: { timestamp: "desc" },
      });

      // Aggregate by page + element
      const aggregation = new Map<
        string,
        { pageUrl: string; element: string; count: number; lastSeen: Date }
      >();

      for (const e of events) {
        const key = `${e.session.pageUrl}::${e.element ?? "unknown"}`;
        const existing = aggregation.get(key);
        if (existing) {
          existing.count++;
          if (e.timestamp > existing.lastSeen) {
            existing.lastSeen = e.timestamp;
          }
        } else {
          aggregation.set(key, {
            pageUrl: e.session.pageUrl,
            element: e.element ?? "unknown",
            count: 1,
            lastSeen: e.timestamp,
          });
        }
      }

      // Sort by count descending
      const sorted = Array.from(aggregation.values()).sort(
        (a, b) => b.count - a.count
      );

      const total = sorted.length;
      const start = (input.page - 1) * input.perPage;
      const paginated = sorted.slice(start, start + input.perPage).map((r) => ({
        pageUrl: r.pageUrl,
        element: r.element,
        clickCount: r.count,
        type: "rage" as const,
        lastSeen: r.lastSeen,
      }));

      return {
        items: paginated,
        total,
        totalPages: Math.ceil(total / input.perPage),
      };
    }),

  // ── Get dead clicks aggregated by page + element ──────────────────────────

  getDeadClicks: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        siteId: z.string(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const site = await ctx.prisma.heatmapSite.findFirst({
        where: { id: input.siteId, workspaceId: input.workspaceId },
      });
      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const events = await ctx.prisma.heatmapEvent.findMany({
        where: {
          type: "DEAD_CLICK",
          session: {
            siteId: input.siteId,
          },
          ...(input.startDate &&
            input.endDate && {
              timestamp: { gte: input.startDate, lte: input.endDate },
            }),
        },
        select: {
          element: true,
          timestamp: true,
          session: {
            select: { pageUrl: true },
          },
        },
        orderBy: { timestamp: "desc" },
      });

      // Aggregate by page + element
      const aggregation = new Map<
        string,
        { pageUrl: string; element: string; count: number; lastSeen: Date }
      >();

      for (const e of events) {
        const key = `${e.session.pageUrl}::${e.element ?? "unknown"}`;
        const existing = aggregation.get(key);
        if (existing) {
          existing.count++;
          if (e.timestamp > existing.lastSeen) {
            existing.lastSeen = e.timestamp;
          }
        } else {
          aggregation.set(key, {
            pageUrl: e.session.pageUrl,
            element: e.element ?? "unknown",
            count: 1,
            lastSeen: e.timestamp,
          });
        }
      }

      const sorted = Array.from(aggregation.values()).sort(
        (a, b) => b.count - a.count
      );

      const total = sorted.length;
      const start = (input.page - 1) * input.perPage;
      const paginated = sorted.slice(start, start + input.perPage).map((r) => ({
        pageUrl: r.pageUrl,
        element: r.element,
        clickCount: r.count,
        type: "dead" as const,
        lastSeen: r.lastSeen,
      }));

      return {
        items: paginated,
        total,
        totalPages: Math.ceil(total / input.perPage),
      };
    }),

  // ── Get rage click alerts (pages exceeding threshold) ─────────────────────

  getRageClickAlerts: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        siteId: z.string(),
        threshold: z.number().int().min(1).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const site = await ctx.prisma.heatmapSite.findFirst({
        where: { id: input.siteId, workspaceId: input.workspaceId },
      });
      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      // Get rage clicks from the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const events = await ctx.prisma.heatmapEvent.findMany({
        where: {
          type: "RAGE_CLICK",
          timestamp: { gte: oneDayAgo },
          session: {
            siteId: input.siteId,
          },
        },
        select: {
          session: { select: { pageUrl: true } },
          timestamp: true,
        },
      });

      // Aggregate by page
      const pageCounts = new Map<
        string,
        { count: number; lastSeen: Date }
      >();

      for (const e of events) {
        const existing = pageCounts.get(e.session.pageUrl);
        if (existing) {
          existing.count++;
          if (e.timestamp > existing.lastSeen) {
            existing.lastSeen = e.timestamp;
          }
        } else {
          pageCounts.set(e.session.pageUrl, {
            count: 1,
            lastSeen: e.timestamp,
          });
        }
      }

      // Filter pages exceeding threshold
      const alerts = Array.from(pageCounts.entries())
        .filter(([, v]) => v.count >= input.threshold)
        .map(([pageUrl, v]) => ({
          pageUrl,
          rageClickCount: v.count,
          lastSeen: v.lastSeen,
          threshold: input.threshold,
        }))
        .sort((a, b) => b.rageClickCount - a.rageClickCount);

      return { alerts, threshold: input.threshold };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // LINK TO CRM (Task 5.12)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Link a heatmap session to a CRM contact by email ──────────────────────

  linkSession: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        sessionId: z.string(),
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await linkSessionToContact(
          input.sessionId,
          input.email,
          input.workspaceId
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Session not found"
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to link session",
        });
      }
    }),

  // ── Get all heatmap sessions linked to a contact ──────────────────────────

  getContactSessions: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        return await getContactSessions(
          input.contactId,
          input.workspaceId
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Contact not found"
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Contact not found",
          });
        }
        throw error;
      }
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVACY & GDPR (Task 5.13)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Delete expired sessions based on retention policy ─────────────────────

  deleteExpiredSessions: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        retentionDays: z.number().int().min(1).max(365),
      })
    )
    .mutation(async ({ input }) => {
      const deleted = await deleteExpiredSessions(
        input.workspaceId,
        input.retentionDays
      );
      return { deleted };
    }),

  // ── Export all tracking data for a user (GDPR) ────────────────────────────

  exportUserData: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        email: z.string().email(),
      })
    )
    .query(async ({ input }) => {
      return await exportUserData(input.email);
    }),
});
