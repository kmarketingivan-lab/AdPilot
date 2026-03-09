import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock googleapis
vi.mock("googleapis", () => {
  const mockRunReport = vi.fn();
  const mockRunRealtimeReport = vi.fn();

  class MockOAuth2 {
    setCredentials = vi.fn();
  }

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
      analyticsdata: vi.fn(() => ({
        properties: {
          runReport: mockRunReport,
          runRealtimeReport: mockRunRealtimeReport,
        },
      })),
    },
    analyticsdata_v1beta: {},
    __mocks: {
      mockRunReport,
      mockRunRealtimeReport,
    },
  };
});

const { ga4Service, GA4ApiError } = await import(
  "@/server/services/analytics/ga4"
);
const googleapis = await import("googleapis");
const { mockRunReport, mockRunRealtimeReport } = (googleapis as any).__mocks;

beforeEach(() => vi.clearAllMocks());

// ── runReport ───────────────────────────────────────────────────────

describe("ga4Service.runReport", () => {
  it("calls the GA4 API with correct parameters", async () => {
    mockRunReport.mockResolvedValueOnce({
      data: {
        rows: [
          {
            dimensionValues: [{ value: "20250101" }],
            metricValues: [{ value: "100" }, { value: "50" }],
          },
        ],
        metricHeaders: [{ name: "sessions" }, { name: "totalUsers" }],
        dimensionHeaders: [{ name: "date" }],
      },
    });

    const report = await ga4Service.runReport("tok", "123456", {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      metrics: ["sessions", "totalUsers"],
      dimensions: ["date"],
    });

    expect(report.rows).toHaveLength(1);
    expect(mockRunReport).toHaveBeenCalledWith(
      expect.objectContaining({
        property: "properties/123456",
      }),
    );
  });

  it("uses default metrics and dimensions when not specified", async () => {
    mockRunReport.mockResolvedValueOnce({ data: { rows: [] } });

    await ga4Service.runReport("tok", "123", {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });

    const call = mockRunReport.mock.calls[0][0];
    const reqBody = call.requestBody;
    expect(reqBody.metrics).toEqual(
      expect.arrayContaining([
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "conversions" },
      ]),
    );
    expect(reqBody.dimensions).toEqual([{ name: "date" }]);
  });

  it("wraps API errors as GA4ApiError", async () => {
    mockRunReport.mockRejectedValueOnce({
      code: 403,
      message: "Permission denied",
      errors: [{ reason: "forbidden" }],
    });

    const err = await ga4Service
      .runReport("tok", "123", { startDate: "2025-01-01", endDate: "2025-01-31" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GA4ApiError);
    expect((err as GA4ApiError).statusCode).toBe(403);
    expect((err as GA4ApiError).isPermissionDenied).toBe(true);
  });
});

// ── getTrafficSources ───────────────────────────────────────────────

describe("ga4Service.getTrafficSources", () => {
  it("requests sessions by sessionSource/sessionMedium", async () => {
    mockRunReport.mockResolvedValueOnce({ data: { rows: [] } });

    await ga4Service.getTrafficSources("tok", "123", {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });

    const reqBody = mockRunReport.mock.calls[0][0].requestBody;
    expect(reqBody.metrics).toEqual([{ name: "sessions" }]);
    expect(reqBody.dimensions).toEqual(
      expect.arrayContaining([
        { name: "sessionSource" },
        { name: "sessionMedium" },
      ]),
    );
  });
});

// ── getRealTimeUsers ────────────────────────────────────────────────

describe("ga4Service.getRealTimeUsers", () => {
  it("calls the realtime report endpoint", async () => {
    mockRunRealtimeReport.mockResolvedValueOnce({
      data: {
        rows: [{ metricValues: [{ value: "42" }] }],
      },
    });

    const report = await ga4Service.getRealTimeUsers("tok", "123");
    expect(report.rows![0].metricValues![0].value).toBe("42");
  });
});

// ── transformReportToTimeSeries ─────────────────────────────────────

describe("ga4Service.transformReportToTimeSeries", () => {
  it("converts rows into a keyed time-series array", () => {
    const report = {
      dimensionHeaders: [{ name: "date" }],
      metricHeaders: [{ name: "sessions" }, { name: "bounceRate" }],
      rows: [
        {
          dimensionValues: [{ value: "20250101" }],
          metricValues: [{ value: "150" }, { value: "0.45" }],
        },
        {
          dimensionValues: [{ value: "20250102" }],
          metricValues: [{ value: "200" }, { value: "0.38" }],
        },
      ],
    };

    const timeSeries = ga4Service.transformReportToTimeSeries(report);

    expect(timeSeries).toHaveLength(2);
    expect(timeSeries[0]).toEqual({
      date: "20250101",
      sessions: 150,
      bounceRate: 0.45,
    });
    expect(timeSeries[1].sessions).toBe(200);
  });

  it("throws when report has no date dimension", () => {
    const report = {
      dimensionHeaders: [{ name: "country" }],
      metricHeaders: [{ name: "sessions" }],
      rows: [],
    };

    expect(() => ga4Service.transformReportToTimeSeries(report)).toThrow(
      "does not contain a 'date' dimension",
    );
  });
});

// ── transformReportToSummary ────────────────────────────────────────

describe("ga4Service.transformReportToSummary", () => {
  it("uses API totals row when available", () => {
    const report = {
      metricHeaders: [{ name: "sessions" }, { name: "totalUsers" }],
      totals: [{ metricValues: [{ value: "1000" }, { value: "800" }] }],
      rows: [],
    };

    const summary = ga4Service.transformReportToSummary(report);

    expect(summary).toEqual([
      { metric: "sessions", value: 1000 },
      { metric: "totalUsers", value: 800 },
    ]);
  });

  it("aggregates manually when no totals are present", () => {
    const report = {
      metricHeaders: [{ name: "sessions" }],
      rows: [
        { metricValues: [{ value: "100" }] },
        { metricValues: [{ value: "200" }] },
      ],
    };

    const summary = ga4Service.transformReportToSummary(report);

    expect(summary).toEqual([{ metric: "sessions", value: 300 }]);
  });
});

// ── GA4ApiError ─────────────────────────────────────────────────────

describe("GA4ApiError", () => {
  it("detects token expiry", () => {
    const err = new GA4ApiError("Unauthorized", 401);
    expect(err.isTokenExpired).toBe(true);
    expect(err.isQuotaExceeded).toBe(false);
  });

  it("detects quota exceeded", () => {
    const err = new GA4ApiError("Too many requests", 429);
    expect(err.isQuotaExceeded).toBe(true);
  });
});
