import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set developer token env
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "test_dev_token";

const { googleAdsService, GoogleAdsApiError } = await import(
  "@/server/services/analytics/google-ads"
);

// ── Helpers ─────────────────────────────────────────────────────────

function ok(batches: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(batches),
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

describe("googleAdsService.fetchCampaigns", () => {
  it("fetches campaigns and computes derived metrics", async () => {
    mockFetch.mockResolvedValueOnce(
      ok([
        {
          results: [
            {
              campaign: { id: "123", name: "Summer Sale", status: "ENABLED" },
              metrics: {
                impressions: "10000",
                clicks: "500",
                cost_micros: "25000000", // $25
                conversions: "50",
              },
            },
          ],
        },
      ]),
    );

    const campaigns = await googleAdsService.fetchCampaigns("tok", "123-456-7890", {
      start: "2025-01-01",
      end: "2025-01-31",
    });

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].name).toBe("Summer Sale");
    expect(campaigns[0].impressions).toBe(10000);
    expect(campaigns[0].clicks).toBe(500);
    expect(campaigns[0].spend).toBe(25); // 25000000 micros = $25
    expect(campaigns[0].conversions).toBe(50);

    // Derived metrics
    expect(campaigns[0].cpc).toBe(25 / 500); // spend / clicks
    expect(campaigns[0].ctr).toBe(500 / 10000); // clicks / impressions
    expect(campaigns[0].cpa).toBe(25 / 50); // spend / conversions
  });

  it("strips dashes from customer ID", async () => {
    mockFetch.mockResolvedValueOnce(ok([{ results: [] }]));

    await googleAdsService.fetchCampaigns("tok", "123-456-7890", {
      start: "2025-01-01",
      end: "2025-01-31",
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("/customers/1234567890/");
    expect(url).not.toContain("123-456-7890");
  });

  it("includes developer-token header", async () => {
    mockFetch.mockResolvedValueOnce(ok([{ results: [] }]));

    await googleAdsService.fetchCampaigns("tok", "123", {
      start: "2025-01-01",
      end: "2025-01-31",
    });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["developer-token"]).toBe("test_dev_token");
  });

  it("throws GoogleAdsApiError on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(
      errResp(401, { error: { message: "Invalid credentials" } }),
    );

    await expect(
      googleAdsService.fetchCampaigns("bad_tok", "123", {
        start: "2025-01-01",
        end: "2025-01-31",
      }),
    ).rejects.toThrow(GoogleAdsApiError);
  });

  it("handles null derived metrics when denominators are zero", async () => {
    mockFetch.mockResolvedValueOnce(
      ok([
        {
          results: [
            {
              campaign: { id: "1", name: "Empty", status: "PAUSED" },
              metrics: {
                impressions: "0",
                clicks: "0",
                cost_micros: "0",
                conversions: "0",
              },
            },
          ],
        },
      ]),
    );

    const campaigns = await googleAdsService.fetchCampaigns("tok", "123", {
      start: "2025-01-01",
      end: "2025-01-31",
    });

    expect(campaigns[0].cpc).toBeNull();
    expect(campaigns[0].ctr).toBeNull();
    expect(campaigns[0].cpa).toBeNull();
    expect(campaigns[0].roas).toBeNull();
  });
});

// ── fetchCampaignMetrics ────────────────────────────────────────────

describe("googleAdsService.fetchCampaignMetrics", () => {
  it("returns daily metrics with date", async () => {
    mockFetch.mockResolvedValueOnce(
      ok([
        {
          results: [
            {
              segments: { date: "2025-01-15" },
              metrics: {
                impressions: "5000",
                clicks: "250",
                cost_micros: "12500000",
                conversions: "25",
              },
            },
            {
              segments: { date: "2025-01-16" },
              metrics: {
                impressions: "6000",
                clicks: "300",
                cost_micros: "15000000",
                conversions: "30",
              },
            },
          ],
        },
      ]),
    );

    const metrics = await googleAdsService.fetchCampaignMetrics(
      "tok",
      "123",
      "campaign_1",
      { start: "2025-01-15", end: "2025-01-16" },
    );

    expect(metrics).toHaveLength(2);
    expect(metrics[0].date).toBe("2025-01-15");
    expect(metrics[0].spend).toBe(12.5);
    expect(metrics[1].date).toBe("2025-01-16");
    expect(metrics[1].clicks).toBe(300);
  });

  it("includes campaign ID in the GAQL query", async () => {
    mockFetch.mockResolvedValueOnce(ok([{ results: [] }]));

    await googleAdsService.fetchCampaignMetrics("tok", "123", "cam_456", {
      start: "2025-01-01",
      end: "2025-01-31",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.query).toContain("cam_456");
  });
});

// ── refreshGoogleToken ──────────────────────────────────────────────

describe("googleAdsService.refreshGoogleToken", () => {
  it("exchanges a refresh token for a new access token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: "new_tok",
          expires_in: 3600,
          token_type: "Bearer",
        }),
    } as unknown as Response);

    const result = await googleAdsService.refreshGoogleToken(
      "refresh_tok",
      "client_id",
      "client_secret",
    );

    expect(result.access_token).toBe("new_tok");
    expect(result.expires_in).toBe(3600);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("oauth2.googleapis.com/token");
  });

  it("throws GoogleAdsApiError on token refresh failure", async () => {
    mockFetch.mockResolvedValueOnce(
      errResp(400, { error: "invalid_grant" }),
    );

    await expect(
      googleAdsService.refreshGoogleToken("bad_ref", "cid", "csec"),
    ).rejects.toThrow(GoogleAdsApiError);
  });
});
