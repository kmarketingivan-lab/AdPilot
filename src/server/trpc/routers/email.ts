import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../init";
import { emailSendQueue } from "@/server/queue/queues";
import { sendBulkEmail } from "@/server/services/email/ses-enhanced";

// ---------------------------------------------------------------------------
// Predefined email templates (stored in-memory, no DB model needed)
// ---------------------------------------------------------------------------

export interface EmailTemplateData {
  id: string;
  name: string;
  category: string;
  description: string;
  thumbnail: string;
  html: string;
}

const PREDEFINED_TEMPLATES: EmailTemplateData[] = [
  {
    id: "welcome",
    name: "Welcome",
    category: "onboarding",
    description: "Welcome new subscribers with a warm introduction.",
    thumbnail: "/templates/welcome.png",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:#2563eb;padding:40px 30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:28px;">Welcome aboard!</h1></td></tr><tr><td style="padding:30px;"><p style="font-size:16px;color:#333;line-height:1.6;">Hi {{firstName}},</p><p style="font-size:16px;color:#333;line-height:1.6;">Thanks for joining us! We're thrilled to have you.</p><table cellpadding="0" cellspacing="0" style="margin:30px auto;"><tr><td style="background:#2563eb;border-radius:6px;padding:12px 30px;"><a href="#" style="color:#fff;text-decoration:none;font-size:16px;font-weight:600;">Get Started</a></td></tr></table></td></tr><tr><td style="padding:20px 30px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">© {{company}} — All rights reserved</td></tr></table></td></tr></table></body></html>`,
  },
  {
    id: "newsletter",
    name: "Newsletter",
    category: "content",
    description: "Regular newsletter with featured content sections.",
    thumbnail: "/templates/newsletter.png",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:#1e293b;padding:30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;">📬 Monthly Newsletter</h1><p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">The latest from {{company}}</p></td></tr><tr><td style="padding:30px;"><h2 style="font-size:20px;color:#1e293b;margin:0 0 10px;">Featured Article</h2><p style="font-size:15px;color:#64748b;line-height:1.6;">Your featured content goes here. Share your latest insights and updates.</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"><h2 style="font-size:20px;color:#1e293b;margin:0 0 10px;">Quick Updates</h2><p style="font-size:15px;color:#64748b;line-height:1.6;">Additional news items and announcements.</p></td></tr><tr><td style="padding:20px 30px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">© {{company}}</td></tr></table></td></tr></table></body></html>`,
  },
  {
    id: "promo",
    name: "Promotional",
    category: "marketing",
    description: "Eye-catching promotional offer email.",
    thumbnail: "/templates/promo.png",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:50px 30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:32px;">🎉 Special Offer!</h1><p style="color:#e0e7ff;margin:10px 0 0;font-size:18px;">Limited time only</p></td></tr><tr><td style="padding:30px;text-align:center;"><p style="font-size:48px;font-weight:800;color:#7c3aed;margin:0;">50% OFF</p><p style="font-size:16px;color:#64748b;margin:10px 0 30px;">Hi {{firstName}}, don't miss out on this exclusive deal!</p><table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="background:#7c3aed;border-radius:6px;padding:14px 40px;"><a href="#" style="color:#fff;text-decoration:none;font-size:18px;font-weight:600;">Shop Now</a></td></tr></table></td></tr><tr><td style="padding:20px 30px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">© {{company}}</td></tr></table></td></tr></table></body></html>`,
  },
  {
    id: "announcement",
    name: "Announcement",
    category: "transactional",
    description: "Important company announcement or product update.",
    thumbnail: "/templates/announcement.png",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:#0f172a;padding:30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;">📢 Announcement</h1></td></tr><tr><td style="padding:30px;"><h2 style="font-size:22px;color:#0f172a;margin:0 0 15px;">Big News, {{firstName}}!</h2><p style="font-size:16px;color:#475569;line-height:1.6;">We have an exciting update to share with you. Stay tuned for more details.</p><table cellpadding="0" cellspacing="0" style="margin:25px auto;"><tr><td style="background:#0f172a;border-radius:6px;padding:12px 30px;"><a href="#" style="color:#fff;text-decoration:none;font-size:16px;font-weight:600;">Learn More</a></td></tr></table></td></tr><tr><td style="padding:20px 30px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">© {{company}}</td></tr></table></td></tr></table></body></html>`,
  },
  {
    id: "event-invite",
    name: "Event Invitation",
    category: "events",
    description: "Invite contacts to webinars, conferences, or events.",
    thumbnail: "/templates/event.png",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:#059669;padding:40px 30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:26px;">You're Invited!</h1><p style="color:#a7f3d0;margin:8px 0 0;font-size:16px;">Join us for an exclusive event</p></td></tr><tr><td style="padding:30px;"><p style="font-size:16px;color:#333;line-height:1.6;">Hi {{firstName}},</p><p style="font-size:16px;color:#333;line-height:1.6;">We'd love for you to join us! Check out the details below.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:20px;margin:20px 0;"><tr><td><p style="margin:0;font-size:14px;color:#065f46;"><strong>Date:</strong> TBD</p><p style="margin:5px 0 0;font-size:14px;color:#065f46;"><strong>Location:</strong> Online</p></td></tr></table><table cellpadding="0" cellspacing="0" style="margin:20px auto;"><tr><td style="background:#059669;border-radius:6px;padding:12px 30px;"><a href="#" style="color:#fff;text-decoration:none;font-size:16px;font-weight:600;">RSVP Now</a></td></tr></table></td></tr><tr><td style="padding:20px 30px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">© {{company}}</td></tr></table></td></tr></table></body></html>`,
  },
  {
    id: "product-launch",
    name: "Product Launch",
    category: "marketing",
    description: "Announce a new product or feature launch.",
    thumbnail: "/templates/product-launch.png",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:#dc2626;padding:40px 30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:30px;">🚀 New Product!</h1></td></tr><tr><td style="padding:30px;text-align:center;"><h2 style="font-size:22px;color:#1e293b;margin:0 0 10px;">Introducing Our Latest Innovation</h2><p style="font-size:16px;color:#64748b;line-height:1.6;">Hi {{firstName}}, we've been working on something special and we can't wait to show you.</p><table cellpadding="0" cellspacing="0" style="margin:25px auto;"><tr><td style="background:#dc2626;border-radius:6px;padding:14px 35px;"><a href="#" style="color:#fff;text-decoration:none;font-size:16px;font-weight:600;">Discover Now</a></td></tr></table></td></tr><tr><td style="padding:20px 30px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">© {{company}}</td></tr></table></td></tr></table></body></html>`,
  },
  {
    id: "feedback",
    name: "Feedback Request",
    category: "engagement",
    description: "Ask customers for feedback or reviews.",
    thumbnail: "/templates/feedback.png",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:#f59e0b;padding:35px 30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:26px;">We Value Your Feedback</h1></td></tr><tr><td style="padding:30px;"><p style="font-size:16px;color:#333;line-height:1.6;">Hi {{firstName}},</p><p style="font-size:16px;color:#333;line-height:1.6;">Your opinion matters to us. Please take a moment to share your thoughts.</p><table cellpadding="0" cellspacing="0" style="margin:25px auto;"><tr><td style="background:#f59e0b;border-radius:6px;padding:12px 30px;"><a href="#" style="color:#fff;text-decoration:none;font-size:16px;font-weight:600;">Share Feedback</a></td></tr></table></td></tr><tr><td style="padding:20px 30px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">© {{company}}</td></tr></table></td></tr></table></body></html>`,
  },
  {
    id: "re-engagement",
    name: "Re-engagement",
    category: "retention",
    description: "Win back inactive subscribers.",
    thumbnail: "/templates/re-engagement.png",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:#6366f1;padding:40px 30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:26px;">We Miss You!</h1><p style="color:#c7d2fe;margin:8px 0 0;font-size:16px;">It's been a while, {{firstName}}</p></td></tr><tr><td style="padding:30px;text-align:center;"><p style="font-size:16px;color:#64748b;line-height:1.6;">We noticed you haven't visited in a while. Here's what you've been missing.</p><table cellpadding="0" cellspacing="0" style="margin:25px auto;"><tr><td style="background:#6366f1;border-radius:6px;padding:14px 35px;"><a href="#" style="color:#fff;text-decoration:none;font-size:16px;font-weight:600;">Come Back</a></td></tr></table></td></tr><tr><td style="padding:20px 30px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">© {{company}}</td></tr></table></td></tr></table></body></html>`,
  },
];

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------

const workspaceInput = z.object({ workspaceId: z.string() });

const templateCreateSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  description: z.string().max(300).optional(),
  html: z.string().min(1),
});

const templateUpdateSchema = z.object({
  workspaceId: z.string(),
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  category: z.string().min(1).max(50).optional(),
  description: z.string().max(300).optional(),
  html: z.string().min(1).optional(),
});

const listCreateSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
});

const listUpdateSchema = z.object({
  workspaceId: z.string(),
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
});

const subscribersSchema = z.object({
  workspaceId: z.string(),
  listId: z.string(),
  emails: z.array(z.string().email()).min(1).max(1000),
});

const campaignCreateSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(200),
  preheader: z.string().max(200).optional(),
  htmlContent: z.string().min(1),
  listId: z.string(),
});

const campaignUpdateSchema = z.object({
  workspaceId: z.string(),
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  subject: z.string().min(1).max(200).optional(),
  preheader: z.string().max(200).optional(),
  htmlContent: z.string().min(1).optional(),
  listId: z.string().optional(),
});

const campaignScheduleSchema = z.object({
  workspaceId: z.string(),
  id: z.string(),
  scheduledAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Email Router
// ---------------------------------------------------------------------------

export const emailRouter = router({
  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATES (in-memory predefined + custom stored as JSON in campaigns)
  // ═══════════════════════════════════════════════════════════════════════════

  "templates.listPredefined": workspaceProcedure
    .input(workspaceInput)
    .query(() => {
      return PREDEFINED_TEMPLATES.map(({ html, ...rest }) => rest);
    }),

  "templates.getPredefined": workspaceProcedure
    .input(z.object({ workspaceId: z.string(), id: z.string() }))
    .query(({ input }) => {
      const template = PREDEFINED_TEMPLATES.find((t) => t.id === input.id);
      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }
      return template;
    }),

  // Custom templates are stored as EmailCampaign with status DRAFT and a
  // special naming convention (name prefixed with "[TEMPLATE]")
  "templates.listCustom": workspaceProcedure
    .input(workspaceInput)
    .query(async ({ ctx, input }) => {
      // Custom templates are stored as campaigns where name starts with [TEMPLATE]
      const templates = await ctx.prisma.emailCampaign.findMany({
        where: {
          list: { workspaceId: input.workspaceId },
          name: { startsWith: "[TEMPLATE]" },
          status: "DRAFT",
        },
        orderBy: { createdAt: "desc" },
      });

      return templates.map((t) => ({
        id: t.id,
        name: t.name.replace("[TEMPLATE] ", ""),
        subject: t.subject,
        htmlContent: t.htmlContent,
        createdAt: t.createdAt,
      }));
    }),

  "templates.saveCustom": workspaceProcedure
    .input(templateCreateSchema)
    .mutation(async ({ ctx, input }) => {
      // Need a list to associate with — use the first list or create a placeholder
      const lists = await ctx.prisma.emailList.findMany({
        where: { workspaceId: input.workspaceId },
        take: 1,
      });

      let listId: string;
      if (lists.length > 0) {
        listId = lists[0].id;
      } else {
        const defaultList = await ctx.prisma.emailList.create({
          data: {
            name: "Default",
            workspaceId: input.workspaceId,
          },
        });
        listId = defaultList.id;
      }

      const template = await ctx.prisma.emailCampaign.create({
        data: {
          name: `[TEMPLATE] ${input.name}`,
          subject: input.name,
          htmlContent: input.html,
          listId,
          status: "DRAFT",
        },
      });

      return {
        id: template.id,
        name: input.name,
        htmlContent: template.htmlContent,
      };
    }),

  "templates.deleteCustom": workspaceProcedure
    .input(z.object({ workspaceId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.emailCampaign.findUnique({
        where: { id: input.id },
        include: { list: true },
      });

      if (!template || template.list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!template.name.startsWith("[TEMPLATE]")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a template" });
      }

      await ctx.prisma.emailCampaign.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTS
  // ═══════════════════════════════════════════════════════════════════════════

  "lists.list": workspaceProcedure
    .input(workspaceInput)
    .query(async ({ ctx, input }) => {
      const lists = await ctx.prisma.emailList.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          _count: { select: { subscribers: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return lists.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        subscriberCount: l._count.subscribers,
        createdAt: l.createdAt,
      }));
    }),

  "lists.create": workspaceProcedure
    .input(listCreateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.emailList.create({
        data: {
          name: input.name,
          description: input.description,
          workspaceId: input.workspaceId,
        },
      });
    }),

  "lists.update": workspaceProcedure
    .input(listUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.prisma.emailList.findUnique({
        where: { id: input.id },
      });

      if (!list || list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.prisma.emailList.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
        },
      });
    }),

  "lists.delete": workspaceProcedure
    .input(z.object({ workspaceId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.prisma.emailList.findUnique({
        where: { id: input.id },
      });

      if (!list || list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await ctx.prisma.emailList.delete({ where: { id: input.id } });
      return { success: true };
    }),

  "lists.addSubscribers": workspaceProcedure
    .input(subscribersSchema)
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.prisma.emailList.findUnique({
        where: { id: input.listId },
      });

      if (!list || list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Use createMany with skipDuplicates to handle existing subscribers
      const result = await ctx.prisma.emailSubscriber.createMany({
        data: input.emails.map((email) => ({
          email,
          listId: input.listId,
          status: "ACTIVE" as const,
        })),
        skipDuplicates: true,
      });

      return { added: result.count };
    }),

  "lists.removeSubscribers": workspaceProcedure
    .input(subscribersSchema)
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.prisma.emailList.findUnique({
        where: { id: input.listId },
      });

      if (!list || list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const result = await ctx.prisma.emailSubscriber.deleteMany({
        where: {
          listId: input.listId,
          email: { in: input.emails },
        },
      });

      return { removed: result.count };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMPAIGNS
  // ═══════════════════════════════════════════════════════════════════════════

  "campaigns.list": workspaceProcedure
    .input(workspaceInput)
    .query(async ({ ctx, input }) => {
      const campaigns = await ctx.prisma.emailCampaign.findMany({
        where: {
          list: { workspaceId: input.workspaceId },
          NOT: { name: { startsWith: "[TEMPLATE]" } },
        },
        include: {
          list: { select: { name: true } },
          _count: { select: { events: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        status: c.status,
        listName: c.list.name,
        listId: c.listId,
        scheduledAt: c.scheduledAt,
        sentAt: c.sentAt,
        eventCount: c._count.events,
        createdAt: c.createdAt,
      }));
    }),

  "campaigns.get": workspaceProcedure
    .input(z.object({ workspaceId: z.string(), id: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.emailCampaign.findUnique({
        where: { id: input.id },
        include: {
          list: {
            select: {
              name: true,
              workspaceId: true,
              _count: { select: { subscribers: true } },
            },
          },
        },
      });

      if (!campaign || campaign.list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return {
        ...campaign,
        listName: campaign.list.name,
        subscriberCount: campaign.list._count.subscribers,
      };
    }),

  "campaigns.create": workspaceProcedure
    .input(campaignCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.prisma.emailList.findUnique({
        where: { id: input.listId },
      });

      if (!list || list.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Email list not found",
        });
      }

      return ctx.prisma.emailCampaign.create({
        data: {
          name: input.name,
          subject: input.subject,
          preheader: input.preheader,
          htmlContent: input.htmlContent,
          listId: input.listId,
        },
      });
    }),

  "campaigns.update": workspaceProcedure
    .input(campaignUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.emailCampaign.findUnique({
        where: { id: input.id },
        include: { list: true },
      });

      if (!campaign || campaign.list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (campaign.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft campaigns can be updated",
        });
      }

      // If changing list, verify new list belongs to workspace
      if (input.listId && input.listId !== campaign.listId) {
        const newList = await ctx.prisma.emailList.findUnique({
          where: { id: input.listId },
        });
        if (!newList || newList.workspaceId !== input.workspaceId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
        }
      }

      return ctx.prisma.emailCampaign.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.subject !== undefined && { subject: input.subject }),
          ...(input.preheader !== undefined && { preheader: input.preheader }),
          ...(input.htmlContent !== undefined && {
            htmlContent: input.htmlContent,
          }),
          ...(input.listId !== undefined && { listId: input.listId }),
        },
      });
    }),

  "campaigns.send": workspaceProcedure
    .input(z.object({ workspaceId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.emailCampaign.findUnique({
        where: { id: input.id },
        include: {
          list: {
            select: {
              workspaceId: true,
              subscribers: {
                where: { status: "ACTIVE" },
                select: { email: true },
              },
            },
          },
        },
      });

      if (!campaign || campaign.list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Campaign must be in DRAFT or SCHEDULED status to send",
        });
      }

      if (campaign.list.subscribers.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active subscribers in the selected list",
        });
      }

      // Update status to SENDING
      await ctx.prisma.emailCampaign.update({
        where: { id: input.id },
        data: { status: "SENDING" },
      });

      // Enqueue the bulk send job via BullMQ
      await emailSendQueue.add("bulk-send", {
        campaignId: campaign.id,
        subject: campaign.subject,
        html: campaign.htmlContent,
        recipients: campaign.list.subscribers.map((s) => ({
          email: s.email,
        })),
      });

      return { status: "SENDING", recipientCount: campaign.list.subscribers.length };
    }),

  "campaigns.schedule": workspaceProcedure
    .input(campaignScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.emailCampaign.findUnique({
        where: { id: input.id },
        include: { list: true },
      });

      if (!campaign || campaign.list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (campaign.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft campaigns can be scheduled",
        });
      }

      const scheduledAt = new Date(input.scheduledAt);
      if (scheduledAt <= new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Scheduled time must be in the future",
        });
      }

      await ctx.prisma.emailCampaign.update({
        where: { id: input.id },
        data: {
          status: "SCHEDULED",
          scheduledAt,
        },
      });

      // Schedule the BullMQ job with a delay
      const delay = scheduledAt.getTime() - Date.now();
      await emailSendQueue.add(
        "scheduled-send",
        { campaignId: campaign.id },
        { delay }
      );

      return { status: "SCHEDULED", scheduledAt };
    }),

  "campaigns.getStats": workspaceProcedure
    .input(z.object({ workspaceId: z.string(), id: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.emailCampaign.findUnique({
        where: { id: input.id },
        include: { list: true },
      });

      if (!campaign || campaign.list.workspaceId !== input.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Aggregate event counts by type
      const events = await ctx.prisma.emailEvent.groupBy({
        by: ["type"],
        where: { campaignId: input.id },
        _count: true,
      });

      const stats = {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
        complained: 0,
      };

      for (const event of events) {
        const key = event.type.toLowerCase() as keyof typeof stats;
        if (key in stats) {
          stats[key] = event._count;
        }
      }

      const openRate = stats.delivered > 0
        ? (stats.opened / stats.delivered) * 100
        : 0;
      const clickRate = stats.delivered > 0
        ? (stats.clicked / stats.delivered) * 100
        : 0;
      const bounceRate = stats.sent > 0
        ? (stats.bounced / stats.sent) * 100
        : 0;

      return {
        ...stats,
        openRate: Math.round(openRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100,
        bounceRate: Math.round(bounceRate * 100) / 100,
      };
    }),
});
