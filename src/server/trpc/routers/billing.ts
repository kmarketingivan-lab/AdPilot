import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../init";
import {
  PLANS,
  createCheckoutSession,
  createBillingPortalSession,
  getSubscription,
  checkUsageLimit,
} from "@/server/services/billing/stripe";
import type { Plan } from "@prisma/client";

export const billingRouter = router({
  // Get current plan and usage
  getStatus: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx }) => {
      const plan = ctx.workspace.plan;
      const config = PLANS[plan];
      const subscription = ctx.workspace.stripeSubId
        ? await getSubscription(ctx.workspace.id)
        : null;

      // Gather usage counts
      const [posts, contacts, socialAccounts, teamMembers, heatmapSites] =
        await Promise.all([
          ctx.prisma.post.count({ where: { workspaceId: ctx.workspace.id } }),
          ctx.prisma.contact.count({
            where: { workspaceId: ctx.workspace.id },
          }),
          ctx.prisma.socialAccount.count({
            where: { workspaceId: ctx.workspace.id },
          }),
          ctx.prisma.workspaceMember.count({
            where: { workspaceId: ctx.workspace.id },
          }),
          ctx.prisma.heatmapSite.count({
            where: { workspaceId: ctx.workspace.id },
          }),
        ]);

      return {
        plan,
        planName: config.name,
        price: config.price,
        limits: config.limits,
        usage: { posts, contacts, socialAccounts, teamMembers, heatmapSites },
        subscription: subscription
          ? {
              status: subscription.status,
              currentPeriodEnd: (subscription as unknown as { current_period_end?: number }).current_period_end ?? 0,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            }
          : null,
      };
    }),

  // Get all available plans
  getPlans: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(() => {
      return (Object.entries(PLANS) as [Plan, (typeof PLANS)[Plan]][]).map(
        ([key, config]) => ({
          id: key,
          name: config.name,
          price: config.price,
          limits: config.limits,
        })
      );
    }),

  // Create checkout session to upgrade
  createCheckout: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        plan: z.enum(["STARTER", "PRO", "AGENCY"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.membership.role !== "OWNER" &&
        ctx.membership.role !== "ADMIN"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const session = await createCheckoutSession(
        input.workspaceId,
        input.plan,
        `${baseUrl}/dashboard/settings/billing?success=true`,
        `${baseUrl}/dashboard/settings/billing?canceled=true`
      );

      return { url: session.url };
    }),

  // Create billing portal session
  createPortalSession: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx }) => {
      if (
        ctx.membership.role !== "OWNER" &&
        ctx.membership.role !== "ADMIN"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const session = await createBillingPortalSession(
        ctx.workspace.id,
        `${baseUrl}/dashboard/settings/billing`
      );

      return { url: session.url };
    }),

  // Check a specific usage limit
  checkLimit: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        resource: z.enum([
          "posts",
          "contacts",
          "socialAccounts",
          "emailsPerMonth",
          "teamMembers",
          "heatmapSites",
        ]),
      })
    )
    .query(async ({ input }) => {
      return checkUsageLimit(input.workspaceId, input.resource);
    }),
});
