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
  createCampaign,
  createAdSet,
  createAd,
  createMultipleAds,
  getAdPerformance,
} from "@/server/services/ads/meta-ads-campaign";

const mockConnection = {
  accessToken: "meta-access-token",
  refreshToken: "meta-refresh-token",
  accountId: "12345678",
};

describe("meta-ads-campaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createCampaign
  // ---------------------------------------------------------------------------

  describe("createCampaign", () => {
    it("should create a campaign and return its ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "camp_001" }),
      });

      const result = await createCampaign(mockConnection, {
        name: "Test Meta Campaign",
        objective: "OUTCOME_LEADS",
      });

      expect(result.id).toBe("camp_001");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify URL includes act_ prefix
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("act_12345678/campaigns");
    });

    it("should default status to PAUSED", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "camp_002" }),
      });

      await createCampaign(mockConnection, {
        name: "Paused Campaign",
        objective: "OUTCOME_TRAFFIC",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.status).toBe("PAUSED");
    });

    it("should throw on Meta API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Insufficient permissions"),
      });

      await expect(
        createCampaign(mockConnection, {
          name: "Fail Campaign",
          objective: "OUTCOME_SALES",
        })
      ).rejects.toThrow("Meta API error (403)");
    });
  });

  // ---------------------------------------------------------------------------
  // createAdSet
  // ---------------------------------------------------------------------------

  describe("createAdSet", () => {
    it("should create an ad set with targeting parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "adset_001" }),
      });

      const result = await createAdSet(mockConnection, "camp_001", {
        name: "Test Ad Set",
        dailyBudget: 5000,
        targeting: {
          geoLocations: { countries: ["IT"] },
          ageMin: 25,
          ageMax: 55,
          genders: [1, 2],
          interests: [{ id: "123", name: "Marketing" }],
        },
      });

      expect(result.id).toBe("adset_001");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.campaign_id).toBe("camp_001");
      expect(body.targeting.geo_locations).toEqual({ countries: ["IT"] });
      expect(body.targeting.age_min).toBe(25);
      expect(body.targeting.age_max).toBe(55);
      expect(body.targeting.flexible_spec).toBeDefined();
    });

    it("should handle lifetime budget", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "adset_002" }),
      });

      await createAdSet(mockConnection, "camp_001", {
        name: "Lifetime Budget Set",
        lifetimeBudget: 100000,
        targeting: { geoLocations: { countries: ["US"] } },
        startTime: "2026-04-01T00:00:00Z",
        endTime: "2026-04-30T23:59:59Z",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.lifetime_budget).toBe(100000);
      expect(body.start_time).toBeDefined();
      expect(body.end_time).toBeDefined();
    });

    it("should use default billing event and optimization goal", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "adset_003" }),
      });

      await createAdSet(mockConnection, "camp_001", {
        name: "Defaults Set",
        targeting: {},
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.billing_event).toBe("IMPRESSIONS");
      expect(body.optimization_goal).toBe("LINK_CLICKS");
    });
  });

  // ---------------------------------------------------------------------------
  // createAd
  // ---------------------------------------------------------------------------

  describe("createAd", () => {
    it("should create an ad with link data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "ad_001" }),
      });

      const result = await createAd(mockConnection, "adset_001", {
        name: "Test Ad",
        headline: "Buy Now",
        description: "Amazing product",
        body: "Check out this product",
        ctaType: "SHOP_NOW",
        imageUrl: "https://cdn.example.com/img.jpg",
        linkUrl: "https://example.com/product",
        pageId: "page_123",
      });

      expect(result.id).toBe("ad_001");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.adset_id).toBe("adset_001");
      expect(body.creative.object_story_spec.page_id).toBe("page_123");
      expect(body.creative.object_story_spec.link_data.picture).toBe(
        "https://cdn.example.com/img.jpg"
      );
    });

    it("should use imageHash when provided instead of imageUrl", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "ad_002" }),
      });

      await createAd(mockConnection, "adset_001", {
        name: "Hash Ad",
        headline: "Headline",
        description: "Desc",
        body: "Body",
        imageHash: "abc123hash",
        imageUrl: "https://cdn.example.com/img.jpg",
        linkUrl: "https://example.com",
        pageId: "page_123",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const linkData = body.creative.object_story_spec.link_data;
      expect(linkData.image_hash).toBe("abc123hash");
      expect(linkData.picture).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // createMultipleAds
  // ---------------------------------------------------------------------------

  describe("createMultipleAds", () => {
    it("should create multiple ads sequentially", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "ad_a" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "ad_b" }),
        });

      const results = await createMultipleAds(mockConnection, "adset_001", [
        {
          name: "Creative A",
          headline: "HA",
          description: "DA",
          body: "BA",
          linkUrl: "https://a.com",
          pageId: "page_1",
        },
        {
          name: "Creative B",
          headline: "HB",
          description: "DB",
          body: "BB",
          linkUrl: "https://b.com",
          pageId: "page_1",
        },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ id: "ad_a", creativeName: "Creative A" });
      expect(results[1]).toEqual({ id: "ad_b", creativeName: "Creative B" });
    });
  });

  // ---------------------------------------------------------------------------
  // getAdPerformance
  // ---------------------------------------------------------------------------

  describe("getAdPerformance", () => {
    it("should parse insights data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                ad_id: "ad_1",
                ad_name: "Test Ad",
                impressions: "5000",
                clicks: "250",
                actions: [{ action_type: "lead", value: "10" }],
                spend: "150.50",
                ctr: "5.0",
                cpc: "0.60",
                cost_per_action_type: [{ action_type: "lead", value: "15.05" }],
              },
            ],
          }),
      });

      const result = await getAdPerformance(mockConnection, "camp_001");

      expect(result).toHaveLength(1);
      expect(result[0].impressions).toBe(5000);
      expect(result[0].clicks).toBe(250);
      expect(result[0].conversions).toBe(10);
      expect(result[0].spend).toBe(150.5);
      expect(result[0].costPerResult).toBe(15.05);
    });

    it("should default conversions to 0 when no matching action", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                ad_id: "ad_2",
                ad_name: "No Conversions",
                impressions: "100",
                clicks: "5",
                spend: "10.00",
                ctr: "5.0",
                cpc: "2.00",
              },
            ],
          }),
      });

      const result = await getAdPerformance(mockConnection, "camp_002");

      expect(result[0].conversions).toBe(0);
      expect(result[0].costPerResult).toBe(0);
    });

    it("should return empty array when no data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await getAdPerformance(mockConnection, "camp_empty");
      expect(result).toEqual([]);
    });
  });
});
