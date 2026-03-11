import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    activity: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  calculateScore,
  getScoreBreakdown,
  recalculateAllScores,
  shouldPromoteStage,
} from "@/server/services/crm/lead-scoring";

const mockedPrisma = vi.mocked(prisma);

describe("lead-scoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.contact.update.mockResolvedValue({} as any);
  });

  // ---------------------------------------------------------------------------
  // getScoreBreakdown — activity weights
  // ---------------------------------------------------------------------------

  describe("getScoreBreakdown — activity weights", () => {
    it("should calculate score from activity types with correct weights", async () => {
      const now = new Date();
      mockedPrisma.activity.findMany.mockResolvedValue([
        { type: "EMAIL_OPENED", createdAt: now },
        { type: "EMAIL_OPENED", createdAt: now },
        { type: "AD_CLICK", createdAt: now },
        { type: "FORM_SUBMIT", createdAt: now },
      ] as any);

      const breakdown = await getScoreBreakdown("contact-1");

      // EMAIL_OPENED=5*2=10, AD_CLICK=10*1=10, FORM_SUBMIT=20*1=20
      expect(breakdown.activityTotal).toBe(40);
      expect(breakdown.activityScores).toHaveLength(3);
    });

    it("should return zero for contact with no activities", async () => {
      mockedPrisma.activity.findMany.mockResolvedValue([]);

      const breakdown = await getScoreBreakdown("contact-empty");

      expect(breakdown.activityTotal).toBe(0);
      expect(breakdown.totalScore).toBe(0);
      expect(breakdown.decayDays).toBe(0);
      expect(breakdown.decayPenalty).toBe(0);
    });

    it("should ignore activity types without defined weights", async () => {
      const now = new Date();
      mockedPrisma.activity.findMany.mockResolvedValue([
        { type: "STAGE_CHANGE", createdAt: now },
        { type: "NOTE", createdAt: now },
      ] as any);

      const breakdown = await getScoreBreakdown("contact-2");

      expect(breakdown.activityTotal).toBe(0);
      expect(breakdown.activityScores).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getScoreBreakdown — decay
  // ---------------------------------------------------------------------------

  describe("getScoreBreakdown — decay", () => {
    it("should apply -1 per day since last activity", async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mockedPrisma.activity.findMany.mockResolvedValue([
        { type: "FORM_SUBMIT", createdAt: tenDaysAgo },
      ] as any);

      const breakdown = await getScoreBreakdown("contact-3");

      // FORM_SUBMIT=20, decay ~10 days
      expect(breakdown.decayDays).toBeGreaterThanOrEqual(10);
      expect(breakdown.decayPenalty).toBeGreaterThanOrEqual(10);
      expect(breakdown.totalScore).toBeLessThanOrEqual(10);
    });

    it("should cap decay at MAX_DECAY (30)", async () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      mockedPrisma.activity.findMany.mockResolvedValue([
        { type: "FORM_SUBMIT", createdAt: sixtyDaysAgo },
        { type: "FORM_SUBMIT", createdAt: sixtyDaysAgo },
        { type: "FORM_SUBMIT", createdAt: sixtyDaysAgo },
      ] as any);

      const breakdown = await getScoreBreakdown("contact-4");

      // FORM_SUBMIT=20*3=60, decay capped at 30
      expect(breakdown.decayPenalty).toBe(30);
      expect(breakdown.totalScore).toBe(30); // 60 - 30
    });

    it("should not produce negative scores", async () => {
      const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      mockedPrisma.activity.findMany.mockResolvedValue([
        { type: "EMAIL_SENT", createdAt: hundredDaysAgo },
      ] as any);

      const breakdown = await getScoreBreakdown("contact-5");

      // EMAIL_SENT=2, decay capped at 30 but score floored at 0
      expect(breakdown.totalScore).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // calculateScore
  // ---------------------------------------------------------------------------

  describe("calculateScore", () => {
    it("should persist score to contact record", async () => {
      const now = new Date();
      mockedPrisma.activity.findMany.mockResolvedValue([
        { type: "AD_CLICK", createdAt: now },
      ] as any);

      const score = await calculateScore("contact-6");

      expect(score).toBe(10);
      expect(mockedPrisma.contact.update).toHaveBeenCalledWith({
        where: { id: "contact-6" },
        data: { score: 10 },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // recalculateAllScores
  // ---------------------------------------------------------------------------

  describe("recalculateAllScores", () => {
    it("should recalculate scores for all contacts in workspace", async () => {
      mockedPrisma.contact.findMany.mockResolvedValue([
        { id: "c1" },
        { id: "c2" },
        { id: "c3" },
      ] as any);

      const now = new Date();
      mockedPrisma.activity.findMany.mockResolvedValue([
        { type: "EMAIL_OPENED", createdAt: now },
      ] as any);

      const count = await recalculateAllScores("ws-1");

      expect(count).toBe(3);
      expect(mockedPrisma.contact.update).toHaveBeenCalledTimes(3);
    });
  });

  // ---------------------------------------------------------------------------
  // shouldPromoteStage
  // ---------------------------------------------------------------------------

  describe("shouldPromoteStage", () => {
    it("should suggest OPPORTUNITY for score >= 80 from LEAD", () => {
      const result = shouldPromoteStage({ score: 85, stage: "LEAD" });
      expect(result).toBe("OPPORTUNITY");
    });

    it("should suggest SQL for score >= 60 from LEAD", () => {
      const result = shouldPromoteStage({ score: 65, stage: "LEAD" });
      expect(result).toBe("SQL");
    });

    it("should suggest MQL for score >= 30 from LEAD", () => {
      const result = shouldPromoteStage({ score: 35, stage: "LEAD" });
      expect(result).toBe("MQL");
    });

    it("should return null when score is below all thresholds", () => {
      const result = shouldPromoteStage({ score: 10, stage: "LEAD" });
      expect(result).toBeNull();
    });

    it("should return null when already at or past suggested stage", () => {
      // Score >= 80 suggests OPPORTUNITY, but contact is already OPPORTUNITY
      const result = shouldPromoteStage({ score: 85, stage: "OPPORTUNITY" });
      expect(result).toBeNull();
    });

    it("should return null for CUSTOMER stage even with high score", () => {
      const result = shouldPromoteStage({ score: 100, stage: "CUSTOMER" });
      expect(result).toBeNull();
    });

    it("should suggest OPPORTUNITY when MQL has score >= 80", () => {
      const result = shouldPromoteStage({ score: 80, stage: "MQL" });
      expect(result).toBe("OPPORTUNITY");
    });

    it("should not suggest backward movement", () => {
      // Score=35 suggests MQL, but contact is already SQL
      const result = shouldPromoteStage({ score: 35, stage: "SQL" });
      expect(result).toBeNull();
    });
  });
});
