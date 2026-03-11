import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock encryption module
vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn((val: string) => `decrypted_${val}`),
  encrypt: vi.fn((val: string) => `encrypted_${val}`),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  createSearchCampaign,
  createAdGroup,
  createResponsiveSearchAd,
  getAdPerformance,
} from "@/server/services/ads/google-ads-campaign";

const mockConnection = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  accountId: "123-456-7890",
};

describe("google-ads-campaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "test-dev-token";
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "000-000-0000";
  });

  // ---------------------------------------------------------------------------
  // createSearchCampaign
  // ---------------------------------------------------------------------------

  describe("createSearchCampaign", () => {
    it("should create budget then campaign and return resource names", async () => {
      // First call: budget creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ resourceName: "customers/1234567890/campaignBudgets/111" }],
          }),
      });

      // Second call: campaign creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ resourceName: "customers/1234567890/campaigns/222" }],
          }),
      });

      const result = await createSearchCampaign(mockConnection, {
        name: "Test Campaign",
        budgetAmountMicros: 10_000_000,
        budgetType: "DAILY",
        biddingStrategy: "MAXIMIZE_CLICKS",
      });

      expect(result.resourceName).toBe("customers/1234567890/campaigns/222");
      expect(result.campaignId).toBe("222");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad request"),
      });

      await expect(
        createSearchCampaign(mockConnection, {
          name: "Fail Campaign",
          budgetAmountMicros: 5_000_000,
          budgetType: "DAILY",
          biddingStrategy: "MAXIMIZE_CONVERSIONS",
        })
      ).rejects.toThrow("Google Ads API error (400)");
    });

    it("should handle TARGET_CPA bidding strategy", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ resourceName: "customers/1234567890/campaignBudgets/333" }],
          }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ resourceName: "customers/1234567890/campaigns/444" }],
          }),
      });

      const result = await createSearchCampaign(mockConnection, {
        name: "CPA Campaign",
        budgetAmountMicros: 20_000_000,
        budgetType: "DAILY",
        biddingStrategy: "TARGET_CPA",
        targetCpaMicros: 5_000_000,
      });

      expect(result.campaignId).toBe("444");

      // Verify the campaign creation body includes targetCpa
      const campaignCall = mockFetch.mock.calls[1];
      const body = JSON.parse(campaignCall[1].body);
      expect(body.operations[0].create.targetCpa).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // createResponsiveSearchAd
  // ---------------------------------------------------------------------------

  describe("createResponsiveSearchAd", () => {
    it("should create RSA with valid headlines and descriptions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ resourceName: "customers/1234567890/adGroupAds/555" }],
          }),
      });

      const result = await createResponsiveSearchAd(
        mockConnection,
        "adgroup-1",
        ["Headline 1", "Headline 2", "Headline 3"],
        ["Description 1", "Description 2"],
        "https://example.com"
      );

      expect(result.adId).toBe("555");
      expect(result.resourceName).toContain("adGroupAds");
    });

    it("should reject fewer than 3 headlines", async () => {
      await expect(
        createResponsiveSearchAd(
          mockConnection,
          "adgroup-1",
          ["H1", "H2"],
          ["D1", "D2"],
          "https://example.com"
        )
      ).rejects.toThrow("RSA requires at least 3 headlines");
    });

    it("should reject more than 15 headlines", async () => {
      const headlines = Array.from({ length: 16 }, (_, i) => `H${i + 1}`);

      await expect(
        createResponsiveSearchAd(
          mockConnection,
          "adgroup-1",
          headlines,
          ["D1", "D2"],
          "https://example.com"
        )
      ).rejects.toThrow("RSA supports at most 15 headlines");
    });

    it("should reject fewer than 2 descriptions", async () => {
      await expect(
        createResponsiveSearchAd(
          mockConnection,
          "adgroup-1",
          ["H1", "H2", "H3"],
          ["D1"],
          "https://example.com"
        )
      ).rejects.toThrow("RSA requires at least 2 descriptions");
    });

    it("should reject more than 4 descriptions", async () => {
      await expect(
        createResponsiveSearchAd(
          mockConnection,
          "adgroup-1",
          ["H1", "H2", "H3"],
          ["D1", "D2", "D3", "D4", "D5"],
          "https://example.com"
        )
      ).rejects.toThrow("RSA supports at most 4 descriptions");
    });
  });

  // ---------------------------------------------------------------------------
  // createAdGroup
  // ---------------------------------------------------------------------------

  describe("createAdGroup", () => {
    it("should create ad group and return its ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ resourceName: "customers/1234567890/adGroups/777" }],
          }),
      });

      const result = await createAdGroup(mockConnection, "campaign-1", "My Ad Group");

      expect(result.adGroupId).toBe("777");
    });
  });

  // ---------------------------------------------------------------------------
  // getAdPerformance
  // ---------------------------------------------------------------------------

  describe("getAdPerformance", () => {
    it("should parse performance data from GAQL response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                adGroupAd: {
                  ad: {
                    id: "ad-1",
                    name: "Test Ad",
                    responsiveSearchAd: {
                      headlines: [{ text: "H1" }, { text: "H2" }],
                      descriptions: [{ text: "D1" }],
                    },
                  },
                },
                metrics: {
                  impressions: "1000",
                  clicks: "50",
                  conversions: "5.0",
                  costMicros: "500000",
                  ctr: 0.05,
                  allConversionsFromInteractionsRate: 0.1,
                },
              },
            ],
          }),
      });

      const result = await getAdPerformance(mockConnection, "campaign-1");

      expect(result).toHaveLength(1);
      expect(result[0].impressions).toBe(1000);
      expect(result[0].clicks).toBe(50);
      expect(result[0].ctr).toBe(0.05);
      expect(result[0].headlines).toEqual(["H1", "H2"]);
    });

    it("should return empty array when no results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await getAdPerformance(mockConnection, "campaign-x");

      expect(result).toEqual([]);
    });
  });
});
