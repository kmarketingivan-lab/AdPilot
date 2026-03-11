import { prisma } from "@/lib/prisma";
import type { ActivityType, PipelineStage, Contact } from "@prisma/client";

// ---------------------------------------------------------------------------
// Score weights per activity type
// ---------------------------------------------------------------------------

const ACTIVITY_SCORES: Partial<Record<ActivityType, number>> = {
  EMAIL_OPENED: 5,
  EMAIL_SENT: 2,
  PAGE_VIEW: 3,
  AD_CLICK: 10,
  FORM_SUBMIT: 20,
  MEETING: 15,
  CALL: 10,
};

/** Maximum points that can be subtracted due to inactivity */
const MAX_DECAY = 30;

// ---------------------------------------------------------------------------
// Stage promotion thresholds
// ---------------------------------------------------------------------------

const PROMOTION_THRESHOLDS: { minScore: number; stage: PipelineStage }[] = [
  { minScore: 80, stage: "OPPORTUNITY" },
  { minScore: 60, stage: "SQL" },
  { minScore: 30, stage: "MQL" },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  activityScores: { type: ActivityType; count: number; points: number }[];
  activityTotal: number;
  decayDays: number;
  decayPenalty: number;
  totalScore: number;
}

/**
 * Calculate and persist the lead score for a single contact based on their
 * activity history. Returns the new score.
 */
export async function calculateScore(contactId: string): Promise<number> {
  const breakdown = await getScoreBreakdown(contactId);

  await prisma.contact.update({
    where: { id: contactId },
    data: { score: breakdown.totalScore },
  });

  return breakdown.totalScore;
}

/**
 * Batch-recalculate scores for every contact in a workspace.
 * Returns the number of contacts updated.
 */
export async function recalculateAllScores(
  workspaceId: string,
): Promise<number> {
  const contacts = await prisma.contact.findMany({
    where: { workspaceId },
    select: { id: true },
  });

  for (const contact of contacts) {
    await calculateScore(contact.id);
  }

  return contacts.length;
}

/**
 * Return a detailed breakdown of how the score was computed.
 */
export async function getScoreBreakdown(
  contactId: string,
): Promise<ScoreBreakdown> {
  const activities = await prisma.activity.findMany({
    where: { contactId },
    select: { type: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  // Aggregate points per activity type
  const typeCounts = new Map<ActivityType, number>();
  for (const a of activities) {
    typeCounts.set(a.type, (typeCounts.get(a.type) ?? 0) + 1);
  }

  const activityScores: ScoreBreakdown["activityScores"] = [];
  let activityTotal = 0;

  for (const [type, count] of typeCounts) {
    const weight = ACTIVITY_SCORES[type] ?? 0;
    if (weight === 0) continue;
    const points = weight * count;
    activityTotal += points;
    activityScores.push({ type, count, points });
  }

  // Decay: -1 per day since last activity (max -MAX_DECAY)
  let decayDays = 0;
  let decayPenalty = 0;

  if (activities.length > 0) {
    const lastActivity = activities[0].createdAt;
    decayDays = Math.floor(
      (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24),
    );
    decayPenalty = Math.min(decayDays, MAX_DECAY);
  }

  const totalScore = Math.max(0, activityTotal - decayPenalty);

  return {
    activityScores,
    activityTotal,
    decayDays,
    decayPenalty,
    totalScore,
  };
}

/**
 * Based on the contact's current score, suggest whether they should be
 * promoted to a higher pipeline stage. Returns `null` if no promotion is
 * warranted or if the contact is already at or past the suggested stage.
 */
export function shouldPromoteStage(
  contact: Pick<Contact, "score" | "stage">,
): PipelineStage | null {
  const stageOrder: PipelineStage[] = [
    "LEAD",
    "MQL",
    "SQL",
    "OPPORTUNITY",
    "CUSTOMER",
    "LOST",
  ];

  const currentIdx = stageOrder.indexOf(contact.stage);

  for (const { minScore, stage } of PROMOTION_THRESHOLDS) {
    if (contact.score >= minScore) {
      const suggestedIdx = stageOrder.indexOf(stage);
      // Only suggest if the contact would move forward
      if (suggestedIdx > currentIdx) {
        return stage;
      }
      return null;
    }
  }

  return null;
}
