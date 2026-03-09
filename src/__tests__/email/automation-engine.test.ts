import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailAutomation: { findMany: vi.fn(), findUnique: vi.fn() },
    contact: { findUnique: vi.fn(), update: vi.fn() },
    activity: { create: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/server/queue/queues", () => ({
  emailSendQueue: { add: vi.fn() },
  emailAutomationQueue: { add: vi.fn() },
}));

vi.mock("@/server/services/email/ses", () => ({
  renderTemplate: vi.fn((html: string) => html),
}));

// Mock global fetch for webhook node
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { prisma } from "@/lib/prisma";
import { emailAutomationQueue, emailSendQueue } from "@/server/queue/queues";
import {
  processTrigger,
  executeNode,
  type WorkflowDefinition,
  type AutomationJobData,
} from "@/server/services/email/automation-engine";

const mockedPrisma = vi.mocked(prisma);
const mockedAutoQueue = vi.mocked(emailAutomationQueue);
const mockedSendQueue = vi.mocked(emailSendQueue);

const sampleWorkflow: WorkflowDefinition = {
  entryNodeId: "trigger-1",
  nodes: [
    {
      id: "trigger-1",
      type: "trigger",
      data: { type: "contactCreated" },
      nextNodes: ["send-email-1"],
      position: { x: 0, y: 0 },
    },
    {
      id: "send-email-1",
      type: "sendEmail",
      data: { subject: "Welcome!", htmlContent: "<p>Welcome {{firstName}}</p>" },
      nextNodes: ["condition-1"],
      position: { x: 0, y: 100 },
    },
    {
      id: "condition-1",
      type: "condition",
      data: { field: "stage", operator: "equals", value: "MQL" },
      nextNodes: ["add-tag-1"],
      falseNode: "wait-1",
      position: { x: 0, y: 200 },
    },
    {
      id: "add-tag-1",
      type: "addTag",
      data: { tag: "engaged" },
      nextNodes: [],
      position: { x: -100, y: 300 },
    },
    {
      id: "wait-1",
      type: "wait",
      data: { amount: 2, unit: "hours" },
      nextNodes: ["change-stage-1"],
      position: { x: 100, y: 300 },
    },
    {
      id: "change-stage-1",
      type: "changeStage",
      data: { stage: "MQL" },
      nextNodes: [],
      position: { x: 100, y: 400 },
    },
  ],
};

describe("automation-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAutoQueue.add.mockResolvedValue({} as any);
    mockedSendQueue.add.mockResolvedValue({} as any);
    mockedPrisma.activity.create.mockResolvedValue({} as any);
    mockedPrisma.$executeRaw.mockResolvedValue(0 as any);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("OK") });
  });

  // ---------------------------------------------------------------------------
  // processTrigger
  // ---------------------------------------------------------------------------

  describe("processTrigger", () => {
    it("should match automation with matching trigger type and enqueue first node", async () => {
      mockedPrisma.emailAutomation.findMany.mockResolvedValue([
        {
          id: "auto-1",
          name: "Welcome Flow",
          trigger: { type: "contactCreated" },
          steps: sampleWorkflow,
          active: true,
          workspaceId: "ws-1",
        },
      ] as any);

      const result = await processTrigger("ws-1", "contactCreated", "contact-1");

      expect(result.matchedAutomations).toBe(1);
      expect(result.automationIds).toContain("auto-1");
      expect(mockedAutoQueue.add).toHaveBeenCalledTimes(1);
    });

    it("should not match when trigger type differs", async () => {
      mockedPrisma.emailAutomation.findMany.mockResolvedValue([
        {
          id: "auto-1",
          trigger: { type: "formSubmitted" },
          steps: sampleWorkflow,
          active: true,
          workspaceId: "ws-1",
        },
      ] as any);

      const result = await processTrigger("ws-1", "contactCreated", "contact-1");

      expect(result.matchedAutomations).toBe(0);
      expect(mockedAutoQueue.add).not.toHaveBeenCalled();
    });

    it("should check additional trigger conditions (tagAdded)", async () => {
      mockedPrisma.emailAutomation.findMany.mockResolvedValue([
        {
          id: "auto-1",
          trigger: { type: "tagAdded", tag: "vip" },
          steps: sampleWorkflow,
          active: true,
          workspaceId: "ws-1",
        },
      ] as any);

      // Should not match: different tag
      const noMatch = await processTrigger("ws-1", "tagAdded", "contact-1", {
        tag: "basic",
      });
      expect(noMatch.matchedAutomations).toBe(0);

      // Should match: same tag
      const match = await processTrigger("ws-1", "tagAdded", "contact-1", {
        tag: "vip",
      });
      expect(match.matchedAutomations).toBe(1);
    });

    it("should skip automations with empty workflow", async () => {
      mockedPrisma.emailAutomation.findMany.mockResolvedValue([
        {
          id: "auto-empty",
          trigger: { type: "contactCreated" },
          steps: { entryNodeId: "", nodes: [] },
          active: true,
          workspaceId: "ws-1",
        },
      ] as any);

      const result = await processTrigger("ws-1", "contactCreated", "contact-1");

      expect(result.matchedAutomations).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // executeNode — condition evaluation
  // ---------------------------------------------------------------------------

  describe("executeNode — condition", () => {
    const baseJobData: AutomationJobData = {
      automationId: "auto-1",
      contactId: "contact-1",
      currentNodeId: "condition-1",
      workspaceId: "ws-1",
      executionId: "exec-1",
    };

    it("should follow true branch when condition passes", async () => {
      mockedPrisma.emailAutomation.findUnique.mockResolvedValue({
        id: "auto-1",
        active: true,
        steps: sampleWorkflow,
      } as any);

      mockedPrisma.contact.findUnique.mockResolvedValue({
        id: "contact-1",
        email: "test@test.com",
        stage: "MQL", // matches condition
        tags: [],
      } as any);

      await executeNode(baseJobData);

      // Should enqueue add-tag-1 (true branch)
      const enqueued = mockedAutoQueue.add.mock.calls.map(
        (c) => (c[1] as AutomationJobData).currentNodeId
      );
      expect(enqueued).toContain("add-tag-1");
    });

    it("should follow false branch when condition fails", async () => {
      mockedPrisma.emailAutomation.findUnique.mockResolvedValue({
        id: "auto-1",
        active: true,
        steps: sampleWorkflow,
      } as any);

      mockedPrisma.contact.findUnique.mockResolvedValue({
        id: "contact-1",
        email: "test@test.com",
        stage: "LEAD", // does not match "MQL"
        tags: [],
      } as any);

      await executeNode(baseJobData);

      const enqueued = mockedAutoQueue.add.mock.calls.map(
        (c) => (c[1] as AutomationJobData).currentNodeId
      );
      expect(enqueued).toContain("wait-1");
    });
  });

  // ---------------------------------------------------------------------------
  // executeNode — sendEmail
  // ---------------------------------------------------------------------------

  describe("executeNode — sendEmail", () => {
    it("should enqueue email send job", async () => {
      mockedPrisma.emailAutomation.findUnique.mockResolvedValue({
        id: "auto-1",
        active: true,
        steps: sampleWorkflow,
      } as any);

      mockedPrisma.contact.findUnique.mockResolvedValue({
        id: "contact-1",
        email: "user@test.com",
        firstName: "John",
        lastName: "Doe",
        tags: [],
        stage: "LEAD",
      } as any);

      await executeNode({
        automationId: "auto-1",
        contactId: "contact-1",
        currentNodeId: "send-email-1",
        workspaceId: "ws-1",
        executionId: "exec-1",
      });

      expect(mockedSendQueue.add).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // executeNode — wait
  // ---------------------------------------------------------------------------

  describe("executeNode — wait", () => {
    it("should enqueue next node with delay", async () => {
      mockedPrisma.emailAutomation.findUnique.mockResolvedValue({
        id: "auto-1",
        active: true,
        steps: sampleWorkflow,
      } as any);

      mockedPrisma.contact.findUnique.mockResolvedValue({
        id: "contact-1",
        email: "test@test.com",
        tags: [],
        stage: "LEAD",
      } as any);

      await executeNode({
        automationId: "auto-1",
        contactId: "contact-1",
        currentNodeId: "wait-1",
        workspaceId: "ws-1",
        executionId: "exec-1",
      });

      expect(mockedAutoQueue.add).toHaveBeenCalledTimes(1);
      const delayOpt = mockedAutoQueue.add.mock.calls[0][2];
      // 2 hours in ms = 7200000
      expect(delayOpt?.delay).toBe(7200000);
    });
  });

  // ---------------------------------------------------------------------------
  // executeNode — addTag
  // ---------------------------------------------------------------------------

  describe("executeNode — addTag", () => {
    it("should add tag to contact if not already present", async () => {
      mockedPrisma.emailAutomation.findUnique.mockResolvedValue({
        id: "auto-1",
        active: true,
        steps: sampleWorkflow,
      } as any);

      mockedPrisma.contact.findUnique.mockResolvedValue({
        id: "contact-1",
        email: "test@test.com",
        tags: ["existing"],
        stage: "LEAD",
      } as any);

      mockedPrisma.contact.update.mockResolvedValue({} as any);

      await executeNode({
        automationId: "auto-1",
        contactId: "contact-1",
        currentNodeId: "add-tag-1",
        workspaceId: "ws-1",
        executionId: "exec-1",
      });

      expect(mockedPrisma.contact.update).toHaveBeenCalledWith({
        where: { id: "contact-1" },
        data: { tags: ["existing", "engaged"] },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // executeNode — inactive automation
  // ---------------------------------------------------------------------------

  describe("executeNode — edge cases", () => {
    it("should do nothing when automation is inactive", async () => {
      mockedPrisma.emailAutomation.findUnique.mockResolvedValue({
        id: "auto-1",
        active: false,
        steps: sampleWorkflow,
      } as any);

      await executeNode({
        automationId: "auto-1",
        contactId: "contact-1",
        currentNodeId: "send-email-1",
        workspaceId: "ws-1",
        executionId: "exec-1",
      });

      expect(mockedSendQueue.add).not.toHaveBeenCalled();
      expect(mockedAutoQueue.add).not.toHaveBeenCalled();
    });

    it("should do nothing when contact not found", async () => {
      mockedPrisma.emailAutomation.findUnique.mockResolvedValue({
        id: "auto-1",
        active: true,
        steps: sampleWorkflow,
      } as any);

      mockedPrisma.contact.findUnique.mockResolvedValue(null);

      await executeNode({
        automationId: "auto-1",
        contactId: "deleted-contact",
        currentNodeId: "send-email-1",
        workspaceId: "ws-1",
        executionId: "exec-1",
      });

      expect(mockedSendQueue.add).not.toHaveBeenCalled();
    });
  });
});
