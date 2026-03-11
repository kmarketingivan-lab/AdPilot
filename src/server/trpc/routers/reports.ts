import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../init";
import {
  generatePdfReport,
  generateExcelReport,
} from "@/server/services/analytics/report-generator";
import { generateInsights } from "@/server/services/analytics/insights";
import { reportGenerateQueue } from "@/server/queue/queues";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const dateRangeSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

const alertMetricSchema = z.enum([
  "roas",
  "cpc",
  "ctr",
  "spend",
  "impressions",
  "conversions",
]);

const alertOperatorSchema = z.enum(["lt", "gt", "lte", "gte"]);

// ---------------------------------------------------------------------------
// In-memory alert store (placeholder — replace with a Prisma model later)
// ---------------------------------------------------------------------------

interface AlertRule {
  id: string;
  workspaceId: string;
  metric: z.infer<typeof alertMetricSchema>;
  operator: z.infer<typeof alertOperatorSchema>;
  threshold: number;
  label: string;
  createdAt: Date;
}

const alertStore = new Map<string, AlertRule>();

function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function operatorLabel(op: z.infer<typeof alertOperatorSchema>): string {
  const map: Record<string, string> = {
    lt: "<",
    gt: ">",
    lte: "<=",
    gte: ">=",
  };
  return map[op] ?? op;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const reportsRouter = router({
  // -----------------------------------------------------------------------
  // Generate PDF report (returns base64)
  // -----------------------------------------------------------------------
  generatePdf: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        dateRange: dateRangeSchema,
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const buffer = await generatePdfReport(input.workspaceId, {
          start: input.dateRange.start,
          end: input.dateRange.end,
        });

        return {
          base64: buffer.toString("base64"),
          filename: `adpilot-report-${input.dateRange.start.toISOString().split("T")[0]}.pdf`,
          mimeType: "application/pdf",
        };
      } catch (err) {
        console.error("[reports] PDF generation failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate PDF report",
        });
      }
    }),

  // -----------------------------------------------------------------------
  // Generate Excel report (returns base64)
  // -----------------------------------------------------------------------
  generateExcel: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        dateRange: dateRangeSchema,
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const buffer = await generateExcelReport(input.workspaceId, {
          start: input.dateRange.start,
          end: input.dateRange.end,
        });

        return {
          base64: buffer.toString("base64"),
          filename: `adpilot-report-${input.dateRange.start.toISOString().split("T")[0]}.xlsx`,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
      } catch (err) {
        console.error("[reports] Excel generation failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate Excel report",
        });
      }
    }),

  // -----------------------------------------------------------------------
  // Schedule weekly report (Monday 9:00 AM)
  // -----------------------------------------------------------------------
  scheduleWeeklyReport: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const jobKey = `weekly-report:${input.workspaceId}`;

      // Remove any existing repeatable job for this workspace first
      const repeatableJobs = await reportGenerateQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.key.includes(jobKey)) {
          await reportGenerateQueue.removeRepeatableByKey(job.key);
        }
      }

      await reportGenerateQueue.add(
        jobKey,
        {
          workspaceId: input.workspaceId,
          userId: ctx.user.id,
          type: "weekly",
        },
        {
          repeat: {
            pattern: "0 9 * * 1", // Every Monday at 09:00
          },
          jobId: jobKey,
        },
      );

      return { scheduled: true, cron: "0 9 * * 1" };
    }),

  // -----------------------------------------------------------------------
  // Cancel scheduled report
  // -----------------------------------------------------------------------
  cancelScheduledReport: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const jobKey = `weekly-report:${input.workspaceId}`;

      const repeatableJobs = await reportGenerateQueue.getRepeatableJobs();
      let removed = false;
      for (const job of repeatableJobs) {
        if (job.key.includes(jobKey)) {
          await reportGenerateQueue.removeRepeatableByKey(job.key);
          removed = true;
        }
      }

      return { cancelled: removed };
    }),

  // -----------------------------------------------------------------------
  // Get AI insights
  // -----------------------------------------------------------------------
  getInsights: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        dateRange: dateRangeSchema,
      }),
    )
    .query(async ({ input }) => {
      const insights = await generateInsights(input.workspaceId, {
        start: input.dateRange.start,
        end: input.dateRange.end,
      });
      return insights;
    }),

  // -----------------------------------------------------------------------
  // List active alerts for workspace
  // -----------------------------------------------------------------------
  getAlerts: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      }),
    )
    .query(({ input }) => {
      const alerts: AlertRule[] = [];
      for (const alert of alertStore.values()) {
        if (alert.workspaceId === input.workspaceId) {
          alerts.push(alert);
        }
      }
      return alerts.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }),

  // -----------------------------------------------------------------------
  // Create alert rule
  // -----------------------------------------------------------------------
  createAlert: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        metric: alertMetricSchema,
        operator: alertOperatorSchema,
        threshold: z.number(),
      }),
    )
    .mutation(({ input }) => {
      const id = generateAlertId();
      const label = `Notify when ${input.metric} ${operatorLabel(input.operator)} ${input.threshold}`;

      const alert: AlertRule = {
        id,
        workspaceId: input.workspaceId,
        metric: input.metric,
        operator: input.operator,
        threshold: input.threshold,
        label,
        createdAt: new Date(),
      };

      alertStore.set(id, alert);
      return alert;
    }),

  // -----------------------------------------------------------------------
  // Delete alert rule
  // -----------------------------------------------------------------------
  deleteAlert: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        alertId: z.string(),
      }),
    )
    .mutation(({ input }) => {
      const alert = alertStore.get(input.alertId);
      if (!alert || alert.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Alert not found",
        });
      }
      alertStore.delete(input.alertId);
      return { deleted: true };
    }),
});
