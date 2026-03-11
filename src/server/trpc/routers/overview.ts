import { z } from "zod";
import { router, workspaceProcedure } from "../init";

export const overviewRouter = router({
  /**
   * Cross-module widget data for the main dashboard.
   * Task 6.1: Aggregates stats from social, ads, CRM, email, heatmap.
   */
  getWidgets: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx }) => {
      const wid = ctx.workspace.id;

      const [
        scheduledPosts,
        publishedPosts,
        failedPosts,
        totalContacts,
        activeCampaigns,
        totalEmailsSent,
        heatmapSessions,
        socialAccounts,
        recentPosts,
        recentContacts,
      ] = await Promise.all([
        ctx.prisma.post.count({
          where: { workspaceId: wid, status: "SCHEDULED" },
        }),
        ctx.prisma.post.count({
          where: { workspaceId: wid, status: "PUBLISHED" },
        }),
        ctx.prisma.post.count({
          where: { workspaceId: wid, status: "FAILED" },
        }),
        ctx.prisma.contact.count({ where: { workspaceId: wid } }),
        ctx.prisma.campaign.count({
          where: { workspaceId: wid, status: "ACTIVE" },
        }),
        ctx.prisma.emailEvent.count({
          where: {
            type: "SENT",
            campaign: { list: { workspaceId: wid } },
          },
        }),
        ctx.prisma.heatmapSession.count({
          where: { site: { workspaceId: wid } },
        }),
        ctx.prisma.socialAccount.count({ where: { workspaceId: wid } }),
        // Recent posts (last 5)
        ctx.prisma.post.findMany({
          where: { workspaceId: wid },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            content: true,
            status: true,
            scheduledAt: true,
            publishedAt: true,
            createdAt: true,
          },
        }),
        // Recent contacts (last 5)
        ctx.prisma.contact.findMany({
          where: { workspaceId: wid },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            stage: true,
            createdAt: true,
          },
        }),
      ]);

      return {
        stats: {
          scheduledPosts,
          publishedPosts,
          failedPosts,
          totalContacts,
          activeCampaigns,
          totalEmailsSent,
          heatmapSessions,
          socialAccounts,
        },
        recentPosts,
        recentContacts,
      };
    }),

  /**
   * Task 6.2: Contact 360 profile — cross-module timeline.
   */
  getContactProfile: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        contactId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findFirst({
        where: {
          id: input.contactId,
          workspaceId: ctx.workspace.id,
        },
        include: {
          activities: {
            orderBy: { createdAt: "desc" },
            take: 50,
          },
          emailEvents: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              campaign: {
                select: { name: true, subject: true },
              },
            },
          },
          notes: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });

      if (!contact) {
        return null;
      }

      // Build unified timeline from all sources
      type TimelineEvent = {
        id: string;
        type: string;
        module: "social" | "ads" | "email" | "crm" | "heatmap";
        title: string;
        description: string | null;
        metadata: unknown;
        createdAt: Date;
      };

      const timeline: TimelineEvent[] = [];

      // Activities
      for (const a of contact.activities) {
        timeline.push({
          id: a.id,
          type: a.type,
          module:
            a.type === "EMAIL_SENT" || a.type === "EMAIL_OPENED"
              ? "email"
              : a.type === "AD_CLICK"
              ? "ads"
              : a.type === "PAGE_VIEW"
              ? "heatmap"
              : "crm",
          title: formatActivityType(a.type),
          description: a.description,
          metadata: a.metadata,
          createdAt: a.createdAt,
        });
      }

      // Email events
      for (const e of contact.emailEvents) {
        timeline.push({
          id: e.id,
          type: `EMAIL_${e.type}`,
          module: "email",
          title: `Email ${e.type.toLowerCase()}`,
          description: e.campaign
            ? `Campagna: ${e.campaign.name} — "${e.campaign.subject}"`
            : null,
          metadata: e.metadata,
          createdAt: e.createdAt,
        });
      }

      // Sort by date desc
      timeline.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );

      return {
        contact: {
          id: contact.id,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          company: contact.company,
          jobTitle: contact.jobTitle,
          stage: contact.stage,
          score: contact.score,
          tags: contact.tags,
          source: contact.source,
          avatarUrl: contact.avatarUrl,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        },
        timeline,
        notes: contact.notes,
      };
    }),
});

function formatActivityType(type: string): string {
  const map: Record<string, string> = {
    EMAIL_SENT: "Email inviata",
    EMAIL_OPENED: "Email aperta",
    PAGE_VIEW: "Pagina visitata",
    AD_CLICK: "Click su annuncio",
    FORM_SUBMIT: "Form compilato",
    NOTE: "Nota aggiunta",
    CALL: "Chiamata",
    MEETING: "Riunione",
    STAGE_CHANGE: "Cambio fase pipeline",
  };
  return map[type] ?? type;
}
