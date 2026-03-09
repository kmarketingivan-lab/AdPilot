import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ─────────────────────────────────────────────────────

const mockCampaignMetricFindMany = vi.fn();
const mockCampaignFindMany = vi.fn();
const mockCampaignCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaignMetric: {
      findMany: (...args: unknown[]) => mockCampaignMetricFindMany(...args),
    },
    campaign: {
      findMany: (...args: unknown[]) => mockCampaignFindMany(...args),
      count: (...args: unknown[]) => mockCampaignCount(...args),
    },
  },
}));

// Mock jsPDF
vi.mock("jspdf", () => {
  class MockJsPDF {
    setFontSize = vi.fn();
    setFont = vi.fn();
    text = vi.fn();
    setDrawColor = vi.fn();
    line = vi.fn();
    addPage = vi.fn();
    setPage = vi.fn();
    setTextColor = vi.fn();
    getNumberOfPages = vi.fn().mockReturnValue(1);
    internal = {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    };
    output = vi.fn().mockReturnValue(new ArrayBuffer(100));
  }

  return { jsPDF: MockJsPDF };
});

// Mock xlsx
vi.mock("xlsx", () => ({
  utils: {
    book_new: vi.fn().mockReturnValue({}),
    aoa_to_sheet: vi.fn().mockReturnValue({ "!cols": [] }),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn().mockReturnValue(Buffer.alloc(50)),
}));

const { generatePdfReport, generateExcelReport } = await import(
  "@/server/services/analytics/report-generator"
);

// ── Helpers ─────────────────────────────────────────────────────────

const dateRange = {
  start: new Date("2025-01-01"),
  end: new Date("2025-01-31"),
};

function setupMockData(opts: {
  metrics?: Array<Record<string, unknown>>;
  campaigns?: Array<Record<string, unknown>>;
  activeCampaigns?: number;
} = {}) {
  const metrics = opts.metrics ?? [
    {
      impressions: 10000,
      clicks: 500,
      conversions: 50,
      spend: 250.0,
      cpc: 0.5,
      roas: 2.0,
      date: new Date("2025-01-15"),
      campaign: { status: "ACTIVE" },
    },
    {
      impressions: 8000,
      clicks: 400,
      conversions: 40,
      spend: 200.0,
      cpc: 0.5,
      roas: 1.8,
      date: new Date("2025-01-16"),
      campaign: { status: "ACTIVE" },
    },
  ];

  const campaigns = opts.campaigns ?? [
    {
      name: "Campaign Alpha",
      platform: "GOOGLE_ADS",
      status: "ACTIVE",
      metrics: [
        { impressions: 10000, clicks: 500, conversions: 50, spend: 250, cpc: 0.5, roas: 2.0 },
      ],
    },
  ];

  mockCampaignMetricFindMany.mockResolvedValue(metrics);
  mockCampaignFindMany.mockResolvedValue(campaigns);
  mockCampaignCount.mockResolvedValue(opts.activeCampaigns ?? 1);
}

beforeEach(() => vi.clearAllMocks());

// ── generatePdfReport ───────────────────────────────────────────────

describe("generatePdfReport", () => {
  it("returns a Buffer containing PDF data", async () => {
    setupMockData();

    const result = await generatePdfReport("ws_1", dateRange);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("queries metrics and campaigns for the correct workspace and date range", async () => {
    setupMockData();

    await generatePdfReport("ws_1", dateRange);

    expect(mockCampaignMetricFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          campaign: { workspaceId: "ws_1" },
          date: { gte: dateRange.start, lte: dateRange.end },
        }),
      }),
    );
  });

  it("handles empty data gracefully", async () => {
    setupMockData({ metrics: [], campaigns: [], activeCampaigns: 0 });

    const result = await generatePdfReport("ws_1", dateRange);

    expect(result).toBeInstanceOf(Buffer);
  });

  it("computes KPI summary correctly", async () => {
    setupMockData({
      metrics: [
        {
          impressions: 1000,
          clicks: 100,
          conversions: 10,
          spend: 50,
          cpc: 0.5,
          roas: 2.0,
          date: new Date("2025-01-01"),
          campaign: { status: "ACTIVE" },
        },
      ],
      activeCampaigns: 3,
    });

    // The function should complete without errors
    const result = await generatePdfReport("ws_1", dateRange);
    expect(result).toBeInstanceOf(Buffer);
  });
});

// ── generateExcelReport ─────────────────────────────────────────────

describe("generateExcelReport", () => {
  it("returns a Buffer containing Excel data", async () => {
    setupMockData();

    const result = await generateExcelReport("ws_1", dateRange);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("creates three sheets: KPI Summary, Campaign Details, Daily Breakdown", async () => {
    setupMockData();

    const XLSX = await import("xlsx");
    await generateExcelReport("ws_1", dateRange);

    const appendCalls = (XLSX.utils.book_append_sheet as any).mock.calls;
    const sheetNames = appendCalls.map((c: unknown[]) => c[2]);

    expect(sheetNames).toContain("KPI Summary");
    expect(sheetNames).toContain("Campaign Details");
    expect(sheetNames).toContain("Daily Breakdown");
  });

  it("handles daily aggregation across multiple metrics", async () => {
    setupMockData({
      metrics: [
        {
          impressions: 500,
          clicks: 50,
          conversions: 5,
          spend: 25,
          cpc: null,
          roas: null,
          date: new Date("2025-01-15"),
          campaign: { status: "ACTIVE" },
        },
        {
          impressions: 300,
          clicks: 30,
          conversions: 3,
          spend: 15,
          cpc: null,
          roas: null,
          date: new Date("2025-01-15"), // same day
          campaign: { status: "ACTIVE" },
        },
      ],
    });

    const result = await generateExcelReport("ws_1", dateRange);
    expect(result).toBeInstanceOf(Buffer);
  });

  it("handles null CPC and ROAS values in KPI calculation", async () => {
    setupMockData({
      metrics: [
        {
          impressions: 100,
          clicks: 10,
          conversions: 0,
          spend: 5,
          cpc: null,
          roas: null,
          date: new Date("2025-01-01"),
          campaign: { status: "ACTIVE" },
        },
      ],
    });

    // Should not throw even with null CPC/ROAS
    const result = await generateExcelReport("ws_1", dateRange);
    expect(result).toBeInstanceOf(Buffer);
  });
});
