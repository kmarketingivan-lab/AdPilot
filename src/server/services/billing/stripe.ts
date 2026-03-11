import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _stripe;
}
/** @deprecated Use getStripe() instead */
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ─── Plan configuration ─────────────────────────────────────────
export const PLANS = {
  FREE: {
    name: "Free",
    price: 0,
    stripePriceId: null,
    limits: {
      posts: 10,
      contacts: 100,
      socialAccounts: 2,
      emailsPerMonth: 500,
      teamMembers: 1,
      heatmapSites: 1,
    },
  },
  STARTER: {
    name: "Starter",
    price: 19,
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID!,
    limits: {
      posts: 100,
      contacts: 1_000,
      socialAccounts: 5,
      emailsPerMonth: 5_000,
      teamMembers: 3,
      heatmapSites: 3,
    },
  },
  PRO: {
    name: "Pro",
    price: 49,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID!,
    limits: {
      posts: 500,
      contacts: 10_000,
      socialAccounts: 15,
      emailsPerMonth: 25_000,
      teamMembers: 10,
      heatmapSites: 10,
    },
  },
  AGENCY: {
    name: "Agency",
    price: 99,
    stripePriceId: process.env.STRIPE_AGENCY_PRICE_ID!,
    limits: {
      posts: -1, // unlimited
      contacts: -1,
      socialAccounts: -1,
      emailsPerMonth: 100_000,
      teamMembers: -1,
      heatmapSites: -1,
    },
  },
} as const satisfies Record<Plan, PlanConfig>;

export interface PlanConfig {
  name: string;
  price: number;
  stripePriceId: string | null;
  limits: {
    posts: number;
    contacts: number;
    socialAccounts: number;
    emailsPerMonth: number;
    teamMembers: number;
    heatmapSites: number;
  };
}

// ─── Customer management ────────────────────────────────────────
export async function getOrCreateCustomer(workspaceId: string) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: {
      members: {
        where: { role: "OWNER" },
        include: { user: true },
        take: 1,
      },
    },
  });

  if (workspace.stripeCustomerId) {
    return workspace.stripeCustomerId;
  }

  const owner = workspace.members[0]?.user;
  const customer = await stripe.customers.create({
    email: owner?.email ?? undefined,
    name: workspace.name,
    metadata: { workspaceId },
  });

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

// ─── Checkout session ───────────────────────────────────────────
export async function createCheckoutSession(
  workspaceId: string,
  plan: Exclude<Plan, "FREE">,
  successUrl: string,
  cancelUrl: string
) {
  const customerId = await getOrCreateCustomer(workspaceId);
  const priceId = PLANS[plan].stripePriceId;

  if (!priceId) {
    throw new Error(`No Stripe price configured for plan: ${plan}`);
  }

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { workspaceId, plan },
  });
}

// ─── Billing portal ─────────────────────────────────────────────
export async function createBillingPortalSession(
  workspaceId: string,
  returnUrl: string
) {
  const customerId = await getOrCreateCustomer(workspaceId);

  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

// ─── Subscription status ────────────────────────────────────────
export async function getSubscription(workspaceId: string) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  if (!workspace.stripeSubId) return null;

  return stripe.subscriptions.retrieve(workspace.stripeSubId);
}

// ─── Webhook handlers ───────────────────────────────────────────
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  const workspaceId = session.metadata?.workspaceId;
  const plan = session.metadata?.plan as Plan | undefined;

  if (!workspaceId || !plan) return;

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      plan,
      stripeSubId: session.subscription as string,
      stripeCustomerId: session.customer as string,
    },
  });
}

export async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price?.id;
  if (!priceId) return;

  const plan = (Object.entries(PLANS) as [Plan, PlanConfig][]).find(
    ([, cfg]) => cfg.stripePriceId === priceId
  )?.[0];

  if (!plan) return;

  // Find workspace by stripe customer id
  const workspace = await prisma.workspace.findFirst({
    where: { stripeCustomerId: sub.customer as string },
  });
  if (!workspace) return;

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { plan, stripeSubId: sub.id },
  });
}

export async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const workspace = await prisma.workspace.findFirst({
    where: { stripeCustomerId: sub.customer as string },
  });
  if (!workspace) return;

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { plan: "FREE", stripeSubId: null },
  });
}

// ─── Usage check ────────────────────────────────────────────────
export function getPlanLimits(plan: Plan) {
  return PLANS[plan].limits;
}

export async function checkUsageLimit(
  workspaceId: string,
  resource: keyof PlanConfig["limits"]
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  const limits = getPlanLimits(workspace.plan);
  const limit = limits[resource];

  // -1 = unlimited
  if (limit === -1) return { allowed: true, current: 0, limit: -1 };

  let current = 0;
  switch (resource) {
    case "posts":
      current = await prisma.post.count({ where: { workspaceId } });
      break;
    case "contacts":
      current = await prisma.contact.count({ where: { workspaceId } });
      break;
    case "socialAccounts":
      current = await prisma.socialAccount.count({ where: { workspaceId } });
      break;
    case "teamMembers":
      current = await prisma.workspaceMember.count({ where: { workspaceId } });
      break;
    case "heatmapSites":
      current = await prisma.heatmapSite.count({ where: { workspaceId } });
      break;
    default:
      break;
  }

  return { allowed: current < limit, current, limit };
}
