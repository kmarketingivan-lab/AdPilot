import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdsPlatform, CampaignStatus } from "@prisma/client";

// ── Mock Prisma ─────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    adsConnection: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn((v: string) => `decrypted_${v}`),
}));

// Mock platform services (lazy-loaded via dynamic import)
const mockGoogleFetchCampaigns = vi.fn();
const mockMetaFetchCampaigns = vi.fn();

vi.mock("@/server/services/analytics/google-ads", () => ({
  googleAdsService: {
    fetchCampaigns: (...args: unknown[]) => mockGoogleFetchCampaigns(...args),
  },
}));

vi.mock("@/server/services/analytics/meta-ads", () => ({
  metaAdsService: {
    fetchCampaigns: (...args: unknown[]) => mockMetaFetchCampaigns(...args),
  },
}));

const { syncConnection, syncWorkspaceAnalytics } = await import(
  "@/server/services/analytics/sync"
);
const { prisma } = await import("@/lib/prisma");

// ── Helpers ─────────────────────────────────────────────────────────

function makeConnection(platform: AdsPlatform, overrides: Record<string, unknown> = {}) {
  return {
    id: "conn_1",
    platform,
    accountId: "acct_123",
    accessToken: "enc_tok",
    refreshToken: "enc_ref",
    workspaceId: "ws_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    tokenExpiresAt: null,
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no existing campaigns
  (prisma.campaign.findFirst as any).mockResolvedValue(null);
});

// ── syncConnection ──────────────────────────────────────────────────

describe("syncConnection", () => {
  it("syncs Google Ads campaigns and creates new records", async () => {
    mockGoogleFetchCampaigns.mockResolvedValueOnce([
      { id: "g1", name: "Google Campaign 1", status: "ENABLED" },
      { id: "g2", name: "Google Campaign 2", status: "PAUSED" },
    ]);

    const result = await syncConnection(makeConnection("GOOGLE_ADS"));

    expect(result.metricsUpserted).toBe(2);
    expect(result.error).toBeUndefined();
    expect(prisma.campaign.create).toHaveBeenCalledTimes(2);

    // Verify first campaign was created with correct data
    const firstCall = (prisma.campaign.create as any).mock.calls[0][0];
    expect(firstCall.data.externalId).toBe("g1");
    expect(firstCall.data.platform).toBe("GOOGLE_ADS");
    expect(firstCall.data.status).toBe("ACTIVE"); // ENABLED maps to ACTIVE
  });

  it("syncs Meta Ads campaigns", async () => {
    mockMetaFetchCampaigns.mockResolvedValueOnce([
      { id: "m1", name: "Meta Campaign 1", status: "ACTIVE", objective: "CONVERSIONS" },
    ]);

    const result = await syncConnection(makeConnection("META_ADS"));

    expect(result.metricsUpserted).toBe(1);
    expect(prisma.campaign.create).toHaveBeenCalledOnce();
  });

  it("updates existing campaigns instead of creating", async () => {
    (prisma.campaign.findFirst as any).mockResolvedValueOnce({ id: "existing_id" });
    mockGoogleFetchCampaigns.mockResolvedValueOnce([
      { id: "g1", name: "Updated Name", status: "PAUSED" },
    ]);

    const result = await syncConnection(makeConnection("GOOGLE_ADS"));

    expect(result.metricsUpserted).toBe(1);
    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing_id" },
        data: expect.objectContaining({
          name: "Updated Name",
          status: "PAUSED",
        }),
      }),
    );
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  it("maps campaign statuses correctly", async () => {
    mockGoogleFetchCampaigns.mockResolvedValueOnce([
      { id: "g1", name: "C1", status: "REMOVED" },
      { id: "g2", name: "C2", status: "UNKNOWN_STATUS" },
    ]);

    await syncConnection(makeConnection("GOOGLE_ADS"));

    const calls = (prisma.campaign.create as any).mock.calls;
    expect(calls[0][0].data.status).toBe("ARCHIVED"); // REMOVED -> ARCHIVED
    expect(calls[1][0].data.status).toBe("ACTIVE"); // unknown -> ACTIVE
  });

  it("catches errors and returns them in the result", async () => {
    mockGoogleFetchCampaigns.mockRejectedValueOnce(new Error("API down"));

    const result = await syncConnection(makeConnection("GOOGLE_ADS"));

    expect(result.metricsUpserted).toBe(0);
    expect(result.error).toBe("API down");
  });

  it("throws for unsupported platforms", async () => {
    const result = await syncConnection(makeConnection("LINKEDIN_ADS" as any));
    expect(result.error).toContain("Unsupported platform");
  });
});

// ── syncWorkspaceAnalytics ──────────────────────────────────────────

describe("syncWorkspaceAnalytics", () => {
  it("syncs all connections for a workspace", async () => {
    (prisma.adsConnection.findMany as any).mockResolvedValueOnce([
      makeConnection("GOOGLE_ADS", { id: "conn_g" }),
      makeConnection("META_ADS", { id: "conn_m" }),
    ]);
    mockGoogleFetchCampaigns.mockResolvedValueOnce([
      { id: "g1", name: "G1", status: "ENABLED" },
    ]);
    mockMetaFetchCampaigns.mockResolvedValueOnce([
      { id: "m1", name: "M1", status: "ACTIVE" },
      { id: "m2", name: "M2", status: "ACTIVE" },
    ]);

    const result = await syncWorkspaceAnalytics("ws_1");

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.totalMetrics).toBe(3); // 1 + 2
    expect(result.connections).toHaveLength(2);
  });

  it("handles partial failures across connections", async () => {
    (prisma.adsConnection.findMany as any).mockResolvedValueOnce([
      makeConnection("GOOGLE_ADS", { id: "conn_g" }),
      makeConnection("META_ADS", { id: "conn_m" }),
    ]);
    mockGoogleFetchCampaigns.mockResolvedValueOnce([
      { id: "g1", name: "G1", status: "ENABLED" },
    ]);
    mockMetaFetchCampaigns.mockRejectedValueOnce(new Error("Meta API down"));

    const result = await syncWorkspaceAnalytics("ws_1");

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.totalMetrics).toBe(1);
  });

  it("returns empty results when no connections exist", async () => {
    (prisma.adsConnection.findMany as any).mockResolvedValueOnce([]);

    const result = await syncWorkspaceAnalytics("ws_1");

    expect(result.connections).toHaveLength(0);
    expect(result.totalMetrics).toBe(0);
  });
});
