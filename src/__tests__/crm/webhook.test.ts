import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhook: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((val: string) => `encrypted_${val}`),
  decrypt: vi.fn((val: string) => val.replace("encrypted_", "")),
}));

vi.mock("@/server/queue/queues", () => ({
  webhookDeliveryQueue: {
    add: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { prisma } from "@/lib/prisma";
import { webhookDeliveryQueue } from "@/server/queue/queues";
import {
  computeSignature,
  verifySignature,
  registerWebhook,
  fireWebhooks,
  executeDelivery,
  type WebhookPayload,
} from "@/server/services/crm/webhook";

const mockedPrisma = vi.mocked(prisma);
const mockedQueue = vi.mocked(webhookDeliveryQueue);

describe("webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // HMAC signature
  // ---------------------------------------------------------------------------

  describe("computeSignature", () => {
    it("should produce a consistent HMAC-SHA256 hex digest", () => {
      const payload = '{"event":"contact.created","data":{}}';
      const secret = "test-secret";

      const sig1 = computeSignature(payload, secret);
      const sig2 = computeSignature(payload, secret);

      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should produce different signatures for different payloads", () => {
      const secret = "same-secret";
      const sig1 = computeSignature('{"a":1}', secret);
      const sig2 = computeSignature('{"a":2}', secret);

      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures for different secrets", () => {
      const payload = '{"data":"same"}';
      const sig1 = computeSignature(payload, "secret-1");
      const sig2 = computeSignature(payload, "secret-2");

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("verifySignature", () => {
    it("should return true for valid signature", () => {
      const payload = '{"event":"test"}';
      const secret = "my-secret";
      const signature = computeSignature(payload, secret);

      expect(verifySignature(payload, secret, signature)).toBe(true);
    });

    it("should return false for tampered payload", () => {
      const secret = "my-secret";
      const signature = computeSignature('{"original":"data"}', secret);

      expect(verifySignature('{"tampered":"data"}', secret, signature)).toBe(false);
    });

    it("should return false for wrong secret", () => {
      const payload = '{"data":"test"}';
      const signature = computeSignature(payload, "correct-secret");

      expect(verifySignature(payload, "wrong-secret", signature)).toBe(false);
    });

    it("should return false for different-length signatures", () => {
      expect(verifySignature("payload", "secret", "tooshort")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // registerWebhook
  // ---------------------------------------------------------------------------

  describe("registerWebhook", () => {
    it("should create webhook with encrypted secret and return raw secret", async () => {
      mockedPrisma.webhook.create.mockResolvedValue({
        id: "wh-1",
        url: "https://hooks.example.com/receive",
        events: ["contact.created"],
        active: true,
        secret: "encrypted_secret",
        workspaceId: "ws-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await registerWebhook({
        url: "https://hooks.example.com/receive",
        events: ["contact.created"],
        workspaceId: "ws-1",
      });

      expect(result.id).toBe("wh-1");
      expect(result.secret).toBeDefined();
      expect(typeof result.secret).toBe("string");
      expect(result.secret.length).toBeGreaterThan(0);
    });

    it("should reject invalid URL", async () => {
      await expect(
        registerWebhook({
          url: "not-a-url",
          events: ["contact.created"],
          workspaceId: "ws-1",
        })
      ).rejects.toThrow("Invalid webhook URL");
    });

    it("should reject non-http protocols", async () => {
      await expect(
        registerWebhook({
          url: "ftp://example.com/hook",
          events: ["contact.created"],
          workspaceId: "ws-1",
        })
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // fireWebhooks
  // ---------------------------------------------------------------------------

  describe("fireWebhooks", () => {
    it("should enqueue delivery jobs for matching webhooks", async () => {
      mockedPrisma.webhook.findMany.mockResolvedValue([
        {
          id: "wh-1",
          url: "https://example.com/hook1",
          events: ["contact.created"],
          active: true,
          secret: "encrypted_secret1",
          workspaceId: "ws-1",
        },
        {
          id: "wh-2",
          url: "https://example.com/hook2",
          events: ["contact.created"],
          active: true,
          secret: "encrypted_secret2",
          workspaceId: "ws-1",
        },
      ] as any);

      mockedPrisma.webhookDelivery.create.mockResolvedValue({ id: "del-1" } as any);
      mockedQueue.add.mockResolvedValue({} as any);

      const count = await fireWebhooks("contact.created", "ws-1", {
        contactId: "c-1",
      });

      expect(count).toBe(2);
      expect(mockedQueue.add).toHaveBeenCalledTimes(2);
    });

    it("should return 0 when no matching webhooks", async () => {
      mockedPrisma.webhook.findMany.mockResolvedValue([]);

      const count = await fireWebhooks("contact.deleted", "ws-1", {});

      expect(count).toBe(0);
      expect(mockedQueue.add).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // executeDelivery
  // ---------------------------------------------------------------------------

  describe("executeDelivery", () => {
    const mockPayload: WebhookPayload = {
      event: "contact.created",
      timestamp: new Date().toISOString(),
      workspaceId: "ws-1",
      data: { contactId: "c-1" },
    };

    it("should send POST with HMAC signature headers on success", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve("OK"),
      });

      mockedPrisma.webhookDelivery.update.mockResolvedValue({} as any);

      const result = await executeDelivery({
        deliveryId: "del-1",
        webhookId: "wh-1",
        url: "https://example.com/hook",
        encryptedSecret: "encrypted_test-secret",
        payload: mockPayload,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);

      // Verify headers
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders["X-Webhook-Signature"]).toBeDefined();
      expect(callHeaders["X-Webhook-Event"]).toBe("contact.created");
      expect(callHeaders["X-Webhook-Delivery"]).toBe("del-1");
      expect(callHeaders["User-Agent"]).toBe("AdPilot-Webhooks/1.0");
    });

    it("should throw on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      mockedPrisma.webhookDelivery.update.mockResolvedValue({} as any);

      await expect(
        executeDelivery({
          deliveryId: "del-2",
          webhookId: "wh-1",
          url: "https://example.com/hook",
          encryptedSecret: "encrypted_secret",
          payload: mockPayload,
        })
      ).rejects.toThrow("Webhook returned HTTP 500");
    });

    it("should throw on network error and record failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      mockedPrisma.webhookDelivery.update.mockResolvedValue({} as any);

      await expect(
        executeDelivery({
          deliveryId: "del-3",
          webhookId: "wh-1",
          url: "https://unreachable.example.com",
          encryptedSecret: "encrypted_secret",
          payload: mockPayload,
        })
      ).rejects.toThrow("Network timeout");

      expect(mockedPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "del-3" },
          data: expect.objectContaining({
            error: "Network timeout",
          }),
        })
      );
    });
  });
});
