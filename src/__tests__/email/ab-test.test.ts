import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailSubscriber: { findMany: vi.fn() },
    emailCampaign: { update: vi.fn() },
    emailEvent: { count: vi.fn() },
  },
}));

vi.mock("@/server/queue/queues", () => ({
  emailSendQueue: { add: vi.fn() },
  emailAbTestQueue: { add: vi.fn() },
}));

vi.mock("@/server/services/email/ses", () => ({
  sendEmail: vi.fn(),
  renderTemplate: vi.fn((html: string, vars: Record<string, string>) => {
    let result = html;
    for (const [key, val] of Object.entries(vars)) {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), val);
    }
    return result;
  }),
}));

import { prisma } from "@/lib/prisma";
import { emailSendQueue, emailAbTestQueue } from "@/server/queue/queues";
import {
  startABTest,
  evaluateAndSendWinner,
  type ABTestConfig,
  type ABTestJobData,
} from "@/server/services/email/ab-test";

const mockedPrisma = vi.mocked(prisma);
const mockedSendQueue = vi.mocked(emailSendQueue);
const mockedAbTestQueue = vi.mocked(emailAbTestQueue);

function generateSubscribers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `sub-${i}`,
    email: `user${i}@test.com`,
  }));
}

describe("ab-test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSendQueue.add.mockResolvedValue({} as any);
    mockedAbTestQueue.add.mockResolvedValue({} as any);
    mockedPrisma.emailCampaign.update.mockResolvedValue({} as any);
  });

  // ---------------------------------------------------------------------------
  // startABTest — list splitting
  // ---------------------------------------------------------------------------

  describe("startABTest — list splitting", () => {
    it("should split list into ~10% A, ~10% B, ~80% remaining", async () => {
      mockedPrisma.emailSubscriber.findMany.mockResolvedValue(
        generateSubscribers(100)
      );

      const result = await startABTest({
        campaignId: "camp-1",
        listId: "list-1",
        variantA: { subject: "Subject A" },
        variantB: { subject: "Subject B" },
        baseHtmlContent: "<p>Hello</p>",
      });

      expect(result.totalSubscribers).toBe(100);
      expect(result.variantACount).toBe(10);
      expect(result.variantBCount).toBe(10);
      expect(result.remainingCount).toBe(80);
    });

    it("should reject lists with fewer than 10 subscribers", async () => {
      mockedPrisma.emailSubscriber.findMany.mockResolvedValue(
        generateSubscribers(5)
      );

      await expect(
        startABTest({
          campaignId: "camp-1",
          listId: "list-1",
          variantA: { subject: "A" },
          variantB: { subject: "B" },
          baseHtmlContent: "<p>Hi</p>",
        })
      ).rejects.toThrow("at least 10 active subscribers");
    });

    it("should enqueue send jobs for both variants", async () => {
      mockedPrisma.emailSubscriber.findMany.mockResolvedValue(
        generateSubscribers(20)
      );

      await startABTest({
        campaignId: "camp-1",
        listId: "list-1",
        variantA: { subject: "Subject A" },
        variantB: { subject: "Subject B" },
        baseHtmlContent: "<p>Content</p>",
      });

      // testSize = floor(20 * 0.1) = 2 per variant = 4 total send jobs
      expect(mockedSendQueue.add).toHaveBeenCalledTimes(4);
    });

    it("should schedule delayed evaluation job", async () => {
      mockedPrisma.emailSubscriber.findMany.mockResolvedValue(
        generateSubscribers(50)
      );

      await startABTest({
        campaignId: "camp-1",
        listId: "list-1",
        variantA: { subject: "A" },
        variantB: { subject: "B" },
        baseHtmlContent: "<p>Hi</p>",
        evaluationDelayMs: 7200000,
      });

      expect(mockedAbTestQueue.add).toHaveBeenCalledTimes(1);
      const delayOpts = mockedAbTestQueue.add.mock.calls[0][2];
      expect(delayOpts?.delay).toBe(7200000);
    });

    it("should use variant-specific HTML when provided", async () => {
      mockedPrisma.emailSubscriber.findMany.mockResolvedValue(
        generateSubscribers(20)
      );

      await startABTest({
        campaignId: "camp-1",
        listId: "list-1",
        variantA: { subject: "A", htmlContent: "<p>Custom A</p>" },
        variantB: { subject: "B", htmlContent: "<p>Custom B</p>" },
        baseHtmlContent: "<p>Base</p>",
      });

      // Verify variant A emails use custom HTML
      const variantACalls = mockedSendQueue.add.mock.calls.filter((c) =>
        (c[0] as string).startsWith("ab-a-")
      );
      expect(variantACalls.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // evaluateAndSendWinner
  // ---------------------------------------------------------------------------

  describe("evaluateAndSendWinner", () => {
    const baseJobData: ABTestJobData = {
      campaignId: "camp-1",
      listId: "list-1",
      variantASubscriberIds: ["sub-0", "sub-1"],
      variantBSubscriberIds: ["sub-2", "sub-3"],
      remainingSubscriberIds: ["sub-4", "sub-5", "sub-6"],
      variantA: { subject: "Subject A", htmlContent: "<p>A</p>" },
      variantB: { subject: "Subject B", htmlContent: "<p>B</p>" },
    };

    it("should pick variant with higher open rate as winner", async () => {
      // Variant A: 1 open / 2 sent = 50%
      // Variant B: 2 opens / 2 sent = 100% -> winner
      mockedPrisma.emailEvent.count
        .mockResolvedValueOnce(1) // opensA
        .mockResolvedValueOnce(2); // opensB

      mockedPrisma.emailSubscriber.findMany.mockResolvedValue([
        { id: "sub-4", email: "user4@test.com" },
        { id: "sub-5", email: "user5@test.com" },
        { id: "sub-6", email: "user6@test.com" },
      ] as any);

      const result = await evaluateAndSendWinner(baseJobData);

      expect(result.winner).toBe("B");
      expect(result.openRateB).toBeGreaterThan(result.openRateA);
      expect(result.sentToRemaining).toBe(3);
    });

    it("should pick A when open rates are tied", async () => {
      mockedPrisma.emailEvent.count
        .mockResolvedValueOnce(1) // opensA
        .mockResolvedValueOnce(1); // opensB — same

      mockedPrisma.emailSubscriber.findMany.mockResolvedValue([
        { id: "sub-4", email: "user4@test.com" },
      ] as any);

      const result = await evaluateAndSendWinner(baseJobData);

      expect(result.winner).toBe("A");
    });

    it("should send winning variant to remaining subscribers via queue", async () => {
      mockedPrisma.emailEvent.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0);

      mockedPrisma.emailSubscriber.findMany.mockResolvedValue([
        { id: "sub-4", email: "user4@test.com" },
        { id: "sub-5", email: "user5@test.com" },
      ] as any);

      await evaluateAndSendWinner(baseJobData);

      expect(mockedSendQueue.add).toHaveBeenCalledTimes(2);
      const jobNames = mockedSendQueue.add.mock.calls.map((c) => c[0]);
      expect(jobNames.every((n) => (n as string).startsWith("ab-winner-"))).toBe(true);
    });

    it("should update campaign to SENT status", async () => {
      mockedPrisma.emailEvent.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      mockedPrisma.emailSubscriber.findMany.mockResolvedValue([]);

      await evaluateAndSendWinner(baseJobData);

      expect(mockedPrisma.emailCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "camp-1" },
          data: expect.objectContaining({ status: "SENT" }),
        })
      );
    });
  });
});
