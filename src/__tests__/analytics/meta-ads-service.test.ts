import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { metaAdsService, MetaAdsApiError } = await import(
  "@/server/services/analytics/meta-ads"
);

// ── Helpers ─────────────────────────────────────────────────────────

function okPage(data: unknown[], next?: string): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        data,
        paging: next ? { next } : undefined,
      }),
  } as unknown as Response;
}

function errResp(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => vi.clearAllMocks());

// ── fetchCampaigns ──────────────────────────────────────────────────

describe("metaAdsService.fetchCampaigns", () => {
  it("fetches campaigns and normalizes budget fields", async () => {
    mockFetch.mockResolvedValueOnce(
      okPage([
        {
          id: "camp_1",
          name: "Spring Campaign",
          status: "ACTIVE",
          objective: "CONVERSIONS",
          daily_budget: "5000", // cents
          lifetime_budget: null,
        },
      ]),
    );

    const campaigns = await metaAdsService.fetchCampaigns(
      "tok",
      "act_123",
      { start: "2025-01-01", end: "2025-01-31" },
    );

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].name).toBe("Spring Campaign");
    expect(campaigns[0].dailyBudget).toBe(50); // 5000 / 100
    expect(campaigns[0].lifetimeBudget).toBeNull();
  });

  it("strips act_ prefix if present in adAccountId", async () => {
    mockFetch.mockResolvedValueOnce(okPage([]));

    await metaAdsService.fetchCampaigns("tok", "act_456", {
      start: "2025-01-01",
      end: "2025-01-31",
    });

    const url = mockFetch.mock.calls[0][0];
    // Should have act_456, not act_act_456
    expect(url).toContain("/act_456/campaigns");
    expect(url).not.toContain("act_act_456");
  });

  it("paginates through multiple pages", async () => {
    // Page 1 -> has a next link
    mockFetch.mockResolvedValueOnce(
      okPage(
        [{ id: "c1", name: "Camp 1", status: "ACTIVE" }],
        "https://graph.facebook.com/next_page",
      ),
    );
    // Page 2 -> no next link
    mockFetch.mockResolvedValueOnce(
      okPage([{ id: "c2", name: "Camp 2", status: "PAUSED" }]),
    );

    const campaigns = await metaAdsService.fetchCampaigns("tok", "123", {
      start: "2025-01-01",
      end: "2025-01-31",
    });

    expect(campaigns).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws MetaAdsApiError on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(
      errResp(401, { error: { message: "Invalid token" } }),
    );

    await expect(
      metaAdsService.fetchCampaigns("bad_tok", "123", {
        start: "2025-01-01",
        end: "2025-01-31",
      }),
    ).rejects.toThrow(MetaAdsApiError);
  });
});

// ── fetchCampaignInsights ───────────────────────────────────────────

describe("metaAdsService.fetchCampaignInsights", () => {
  it("fetches and transforms daily insights", async () => {
    mockFetch.mockResolvedValueOnce(
      okPage([
        {
          date_start: "2025-01-15",
          impressions: "10000",
          clicks: "500",
          spend: "150.50",
          actions: [
            { action_type: "purchase", value: "10" },
            { action_type: "link_click", value: "200" },
          ],
          cpc: "0.30",
          ctr: "5.0",
        },
      ]),
    );

    const insights = await metaAdsService.fetchCampaignInsights(
      "tok",
      "camp_1",
      { start: "2025-01-15", end: "2025-01-15" },
    );

    expect(insights).toHaveLength(1);
    expect(insights[0].date).toBe("2025-01-15");
    expect(insights[0].impressions).toBe(10000);
    expect(insights[0].clicks).toBe(500);
    expect(insights[0].spend).toBe(150.5);
    // Only "purchase" is a conversion type; "link_click" is not
    expect(insights[0].conversions).toBe(10);
    // cpc and ctr come from the API directly
    expect(insights[0].cpc).toBe(0.3);
    // ctr from API is percentage, divided by 100
    expect(insights[0].ctr).toBe(0.05);
  });

  it("computes cpc/ctr when API does not provide them", async () => {
    mockFetch.mockResolvedValueOnce(
      okPage([
        {
          date_start: "2025-01-20",
          impressions: "2000",
          clicks: "100",
          spend: "50",
        },
      ]),
    );

    const insights = await metaAdsService.fetchCampaignInsights(
      "tok",
      "camp_1",
      { start: "2025-01-20", end: "2025-01-20" },
    );

    expect(insights[0].cpc).toBe(50 / 100); // spend / clicks
    expect(insights[0].ctr).toBe(100 / 2000); // clicks / impressions
  });
});

// ── fetchAccountInsights ────────────────────────────────────────────

describe("metaAdsService.fetchAccountInsights", () => {
  it("calls the account-level insights endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      okPage([
        {
          date_start: "2025-01-01",
          impressions: "50000",
          clicks: "2500",
          spend: "750.00",
        },
      ]),
    );

    const insights = await metaAdsService.fetchAccountInsights(
      "tok",
      "act_789",
      { start: "2025-01-01", end: "2025-01-31" },
    );

    expect(insights).toHaveLength(1);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("/act_789/insights");
  });
});

// ── transformInsights ───────────────────────────────────────────────

describe("metaAdsService.transformInsights", () => {
  it("handles empty actions array", () => {
    const result = metaAdsService.transformInsights([
      {
        date_start: "2025-01-01",
        impressions: "100",
        clicks: "10",
        spend: "5",
        actions: [],
      },
    ]);

    expect(result[0].conversions).toBe(0);
  });

  it("sums multiple conversion action types", () => {
    const result = metaAdsService.transformInsights([
      {
        date_start: "2025-01-01",
        impressions: "100",
        clicks: "10",
        spend: "5",
        actions: [
          { action_type: "purchase", value: "3" },
          { action_type: "lead", value: "7" },
          { action_type: "page_view", value: "50" }, // not a conversion
        ],
      },
    ]);

    expect(result[0].conversions).toBe(10); // 3 + 7
  });
});
