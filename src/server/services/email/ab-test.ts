import { prisma } from "@/lib/prisma";
import { emailSendQueue, emailAbTestQueue } from "@/server/queue/queues";
import { sendEmail, renderTemplate } from "./ses";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ABTestConfig {
  campaignId: string;
  listId: string;
  /** Variant A subject + optional HTML override */
  variantA: {
    subject: string;
    htmlContent?: string;
  };
  /** Variant B subject + optional HTML override */
  variantB: {
    subject: string;
    htmlContent?: string;
  };
  /** Base HTML content (used when variant doesn't override) */
  baseHtmlContent: string;
  /** Fraction of the list sent to each test group (default 0.10 = 10%) */
  testFraction?: number;
  /** Delay in ms before picking a winner (default 4 hours) */
  evaluationDelayMs?: number;
}

export interface ABTestJobData {
  campaignId: string;
  listId: string;
  variantASubscriberIds: string[];
  variantBSubscriberIds: string[];
  remainingSubscriberIds: string[];
  variantA: { subject: string; htmlContent: string };
  variantB: { subject: string; htmlContent: string };
}

const DEFAULT_TEST_FRACTION = 0.1; // 10% each
const DEFAULT_EVALUATION_DELAY_MS = 4 * 60 * 60 * 1000; // 4 hours

// ---------------------------------------------------------------------------
// Split list and enqueue jobs
// ---------------------------------------------------------------------------

/**
 * Start an A/B test for an email campaign.
 *
 * Flow:
 * 1. Fetch all active subscribers from the list.
 * 2. Randomly split: 10% variant A, 10% variant B, 80% remaining.
 * 3. Send variant A and B immediately.
 * 4. Schedule a delayed BullMQ job to evaluate the winner after `evaluationDelayMs`.
 */
export async function startABTest(config: ABTestConfig) {
  const {
    campaignId,
    listId,
    variantA,
    variantB,
    baseHtmlContent,
    testFraction = DEFAULT_TEST_FRACTION,
    evaluationDelayMs = DEFAULT_EVALUATION_DELAY_MS,
  } = config;

  // 1. Fetch all active subscribers
  const subscribers = await prisma.emailSubscriber.findMany({
    where: { listId, status: "ACTIVE" },
    select: { id: true, email: true },
  });

  if (subscribers.length < 10) {
    throw new Error(
      "A/B test requires at least 10 active subscribers in the list.",
    );
  }

  // 2. Shuffle and split
  const shuffled = shuffleArray([...subscribers]);
  const testSize = Math.max(1, Math.floor(shuffled.length * testFraction));
  const groupA = shuffled.slice(0, testSize);
  const groupB = shuffled.slice(testSize, testSize * 2);
  const remaining = shuffled.slice(testSize * 2);

  const htmlA = variantA.htmlContent ?? baseHtmlContent;
  const htmlB = variantB.htmlContent ?? baseHtmlContent;

  // 3. Send variant A
  for (const sub of groupA) {
    await emailSendQueue.add(`ab-a-${sub.id}`, {
      to: sub.email,
      subject: variantA.subject,
      html: renderTemplate(htmlA, { email: sub.email }),
      campaignId,
      subscriberId: sub.id,
      variant: "A",
    });
  }

  // Send variant B
  for (const sub of groupB) {
    await emailSendQueue.add(`ab-b-${sub.id}`, {
      to: sub.email,
      subject: variantB.subject,
      html: renderTemplate(htmlB, { email: sub.email }),
      campaignId,
      subscriberId: sub.id,
      variant: "B",
    });
  }

  // 4. Schedule winner evaluation as a delayed job
  const jobData: ABTestJobData = {
    campaignId,
    listId,
    variantASubscriberIds: groupA.map((s) => s.id),
    variantBSubscriberIds: groupB.map((s) => s.id),
    remainingSubscriberIds: remaining.map((s) => s.id),
    variantA: { subject: variantA.subject, htmlContent: htmlA },
    variantB: { subject: variantB.subject, htmlContent: htmlB },
  };

  await emailAbTestQueue.add(`evaluate-${campaignId}`, jobData, {
    delay: evaluationDelayMs,
  });

  // Update campaign status
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: "SENDING" },
  });

  return {
    totalSubscribers: subscribers.length,
    variantACount: groupA.length,
    variantBCount: groupB.length,
    remainingCount: remaining.length,
    evaluationDelayMs,
  };
}

// ---------------------------------------------------------------------------
// Evaluate winner and send to remaining subscribers
// ---------------------------------------------------------------------------

/**
 * Called by the BullMQ worker after the evaluation delay.
 * Picks the variant with higher open rate and sends it to the remaining 80%.
 */
export async function evaluateAndSendWinner(data: ABTestJobData) {
  const { campaignId, variantASubscriberIds, variantBSubscriberIds } = data;

  // Count opens for each variant
  const [opensA, opensB] = await Promise.all([
    prisma.emailEvent.count({
      where: {
        campaignId,
        type: "OPENED",
        contactId: { not: null },
        metadata: {
          path: ["variant"],
          equals: "A",
        },
      },
    }),
    prisma.emailEvent.count({
      where: {
        campaignId,
        type: "OPENED",
        contactId: { not: null },
        metadata: {
          path: ["variant"],
          equals: "B",
        },
      },
    }),
  ]);

  const openRateA =
    variantASubscriberIds.length > 0
      ? opensA / variantASubscriberIds.length
      : 0;
  const openRateB =
    variantBSubscriberIds.length > 0
      ? opensB / variantBSubscriberIds.length
      : 0;

  // Pick winner (A wins ties)
  const winner = openRateB > openRateA ? "B" : "A";
  const winningVariant = winner === "A" ? data.variantA : data.variantB;

  // Fetch remaining subscribers' emails
  const remainingSubs = await prisma.emailSubscriber.findMany({
    where: {
      id: { in: data.remainingSubscriberIds },
      status: "ACTIVE",
    },
    select: { id: true, email: true },
  });

  // Send winning variant to remaining 80%
  for (const sub of remainingSubs) {
    await emailSendQueue.add(`ab-winner-${sub.id}`, {
      to: sub.email,
      subject: winningVariant.subject,
      html: renderTemplate(winningVariant.htmlContent, { email: sub.email }),
      campaignId,
      subscriberId: sub.id,
      variant: `WINNER_${winner}`,
    });
  }

  // Update campaign subject to winning variant
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      subject: winningVariant.subject,
      htmlContent: winningVariant.htmlContent,
      status: "SENT",
      sentAt: new Date(),
    },
  });

  return {
    winner,
    openRateA,
    openRateB,
    opensA,
    opensB,
    sentToRemaining: remainingSubs.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fisher-Yates shuffle */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
