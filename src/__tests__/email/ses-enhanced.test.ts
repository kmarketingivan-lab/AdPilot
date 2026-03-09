import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailEvent: { create: vi.fn() },
    emailSubscriber: { findMany: vi.fn(), updateMany: vi.fn() },
    emailCampaign: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/server/services/email/ses", () => ({
  ses: { send: vi.fn() },
  renderTemplate: vi.fn((html: string, vars: Record<string, string>) => {
    let result = html;
    for (const [key, val] of Object.entries(vars)) {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), val);
    }
    return result;
  }),
}));

import {
  insertTrackingPixel,
  insertClickTracking,
  insertUnsubscribeLink,
  sendBulkEmail,
} from "@/server/services/email/ses-enhanced";
import { ses } from "@/server/services/email/ses";
import { prisma } from "@/lib/prisma";

const mockedSes = vi.mocked(ses);
const mockedPrisma = vi.mocked(prisma);

describe("ses-enhanced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.adpilot.dev";
  });

  // ---------------------------------------------------------------------------
  // insertTrackingPixel
  // ---------------------------------------------------------------------------

  describe("insertTrackingPixel", () => {
    it("should insert 1x1 pixel before </body>", () => {
      const html = "<html><body><p>Hello</p></body></html>";
      const result = insertTrackingPixel(html, "camp-1", "contact-1");

      expect(result).toContain('width="1"');
      expect(result).toContain('height="1"');
      expect(result).toContain("cid=camp-1");
      expect(result).toContain("rid=contact-1");
      expect(result).toContain("</body>");
    });

    it("should append pixel when no </body> tag exists", () => {
      const html = "<p>Hello World</p>";
      const result = insertTrackingPixel(html, "camp-2");

      expect(result).toContain("<img");
      expect(result).toContain("cid=camp-2");
      expect(result).not.toContain("rid=");
    });

    it("should omit rid parameter when contactId is not provided", () => {
      const html = "<body></body>";
      const result = insertTrackingPixel(html, "camp-3");

      expect(result).not.toContain("rid=");
    });
  });

  // ---------------------------------------------------------------------------
  // insertClickTracking
  // ---------------------------------------------------------------------------

  describe("insertClickTracking", () => {
    it("should rewrite http(s) links to tracking URLs", () => {
      const html = '<a href="https://example.com/page">Click</a>';
      const result = insertClickTracking(html, "camp-1", "contact-1");

      expect(result).toContain("/api/email/track/click");
      expect(result).toContain("cid=camp-1");
      expect(result).toContain("rid=contact-1");
      expect(result).toContain(encodeURIComponent("https://example.com/page"));
    });

    it("should not modify mailto or anchor links", () => {
      const html = '<a href="mailto:test@test.com">Email</a><a href="#section">Jump</a>';
      const result = insertClickTracking(html, "camp-1");

      expect(result).toBe(html);
    });

    it("should rewrite multiple links", () => {
      const html = '<a href="https://a.com">A</a><a href="https://b.com">B</a>';
      const result = insertClickTracking(html, "camp-1");

      const trackMatches = result.match(/\/api\/email\/track\/click/g);
      expect(trackMatches).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // insertUnsubscribeLink
  // ---------------------------------------------------------------------------

  describe("insertUnsubscribeLink", () => {
    it("should insert unsubscribe link before </body>", () => {
      const html = "<body><p>Content</p></body>";
      const result = insertUnsubscribeLink(html, "camp-1", "user@test.com");

      expect(result).toContain("Unsubscribe");
      expect(result).toContain("/api/email/unsubscribe");
      expect(result).toContain("cid=camp-1");
      expect(result).toContain("email=user%40test.com");
    });

    it("should append unsubscribe link when no </body> tag", () => {
      const html = "<p>No body tag</p>";
      const result = insertUnsubscribeLink(html, "camp-2", "a@b.com");

      expect(result).toContain("Unsubscribe");
    });
  });

  // ---------------------------------------------------------------------------
  // sendBulkEmail — rate limiting
  // ---------------------------------------------------------------------------

  describe("sendBulkEmail", () => {
    it("should send emails and report sent count", async () => {
      mockedSes.send.mockResolvedValue({} as any);
      mockedPrisma.emailEvent.create.mockResolvedValue({} as any);

      const result = await sendBulkEmail({
        recipients: [
          { email: "a@test.com", contactId: "c1" },
          { email: "b@test.com", contactId: "c2" },
        ],
        subject: "Test Subject",
        html: "<p>Hello</p></body>",
        campaignId: "camp-1",
      });

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should track failures individually without stopping the batch", async () => {
      mockedSes.send
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error("SES rate exceeded"))
        .mockResolvedValueOnce({} as any);
      mockedPrisma.emailEvent.create.mockResolvedValue({} as any);

      const result = await sendBulkEmail({
        recipients: [
          { email: "ok1@test.com" },
          { email: "fail@test.com" },
          { email: "ok2@test.com" },
        ],
        subject: "Subject",
        html: "<p>Hi</p>",
        campaignId: "camp-2",
      });

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("fail@test.com");
    });

    it("should insert tracking pixel and click tracking by default", async () => {
      mockedSes.send.mockResolvedValue({} as any);
      mockedPrisma.emailEvent.create.mockResolvedValue({} as any);

      await sendBulkEmail({
        recipients: [{ email: "a@test.com", contactId: "c1" }],
        subject: "Test",
        html: '<p>Visit <a href="https://site.com">here</a></p></body>',
        campaignId: "camp-3",
      });

      // Inspect the HTML sent to SES
      const sendCall = mockedSes.send.mock.calls[0][0] as any;
      const sentHtml =
        sendCall.input?.Message?.Body?.Html?.Data ?? "";

      expect(sentHtml).toContain("track/open");
      expect(sentHtml).toContain("track/click");
      expect(sentHtml).toContain("Unsubscribe");
    });

    it("should skip tracking when disabled", async () => {
      mockedSes.send.mockResolvedValue({} as any);
      mockedPrisma.emailEvent.create.mockResolvedValue({} as any);

      await sendBulkEmail({
        recipients: [{ email: "a@test.com" }],
        subject: "Test",
        html: '<a href="https://site.com">Link</a>',
        campaignId: "camp-4",
        trackOpens: false,
        trackClicks: false,
        includeUnsubscribeLink: false,
      });

      const sendCall = mockedSes.send.mock.calls[0][0] as any;
      const sentHtml =
        sendCall.input?.Message?.Body?.Html?.Data ?? "";

      expect(sentHtml).not.toContain("track/open");
      expect(sentHtml).not.toContain("track/click");
      expect(sentHtml).not.toContain("Unsubscribe");
    });
  });
});
