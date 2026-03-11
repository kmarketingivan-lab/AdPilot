/**
 * Google Analytics 4 Data API Service
 *
 * Provides authenticated access to GA4 reporting: traffic, page views,
 * real-time users, and custom reports via the Analytics Data API v1beta.
 */

import { google, analyticsdata_v1beta } from "googleapis";

type Schema$RunReportResponse =
  analyticsdata_v1beta.Schema$RunReportResponse;

// ─── Types ────────────────────────────────────────────────────────

export interface GA4DateRange {
  startDate: string;
  endDate: string;
}

export interface GA4MetricData {
  date: string;
  [metric: string]: number | string;
}

export interface GA4ReportOptions {
  startDate: string;
  endDate: string;
  metrics?: string[];
  dimensions?: string[];
}

interface GA4SummaryEntry {
  metric: string;
  value: number;
}

// ─── Error Handling ───────────────────────────────────────────────

export class GA4ApiError extends Error {
  public readonly statusCode: number;
  public readonly reason?: string;

  constructor(message: string, statusCode: number, reason?: string) {
    super(message);
    this.name = "GA4ApiError";
    this.statusCode = statusCode;
    this.reason = reason;
  }

  /** True if the OAuth token has expired or been revoked. */
  get isTokenExpired(): boolean {
    return this.statusCode === 401;
  }

  /** True if the API quota has been exceeded. */
  get isQuotaExceeded(): boolean {
    return this.statusCode === 429;
  }

  /** True if the user lacks permission for the requested property. */
  get isPermissionDenied(): boolean {
    return this.statusCode === 403;
  }
}

// ─── Constants ────────────────────────────────────────────────────

const DEFAULT_METRICS = [
  "sessions",
  "totalUsers",
  "conversions",
  "bounceRate",
  "screenPageViews",
];

const DEFAULT_DIMENSIONS = ["date"];

// ─── Authentication ──────────────────────────────────────────────

/**
 * Create an authenticated GA4 Data API client.
 *
 * @param accessToken - A valid OAuth2 access token with GA4 read scopes
 * @returns Authenticated `analyticsdata` v1beta client
 */
function getGA4Client(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  return google.analyticsdata({
    version: "v1beta",
    auth,
  });
}

// ─── Internal Helpers ─────────────────────────────────────────────

function buildMetrics(
  metrics: string[],
): analyticsdata_v1beta.Schema$Metric[] {
  return metrics.map((name) => ({ name }));
}

function buildDimensions(
  dimensions: string[],
): analyticsdata_v1beta.Schema$Dimension[] {
  return dimensions.map((name) => ({ name }));
}

/**
 * Wraps googleapis calls with consistent error handling.
 */
async function executeRequest<T>(
  label: string,
  fn: () => Promise<{ data: T }>,
): Promise<T> {
  try {
    const response = await fn();
    return response.data;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      "message" in err
    ) {
      const apiErr = err as { code: number; message: string; errors?: { reason?: string }[] };
      const reason = apiErr.errors?.[0]?.reason;
      throw new GA4ApiError(
        `GA4 ${label} failed: ${apiErr.message}`,
        apiErr.code,
        reason,
      );
    }
    throw new GA4ApiError(
      `GA4 ${label} failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      500,
    );
  }
}

// ─── Report Fetching ──────────────────────────────────────────────

/**
 * Run a GA4 report with custom metrics and dimensions.
 *
 * @param accessToken - OAuth2 access token
 * @param propertyId  - GA4 property ID (numeric, without "properties/" prefix)
 * @param options     - Date range, metrics, and dimensions
 * @returns Raw GA4 RunReportResponse
 */
async function runReport(
  accessToken: string,
  propertyId: string,
  options: GA4ReportOptions,
): Promise<Schema$RunReportResponse> {
  const client = getGA4Client(accessToken);
  const metrics = options.metrics ?? DEFAULT_METRICS;
  const dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;

  return executeRequest("runReport", () =>
    client.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [
          {
            startDate: options.startDate,
            endDate: options.endDate,
          },
        ],
        metrics: buildMetrics(metrics),
        dimensions: buildDimensions(dimensions),
      },
    }),
  );
}

/**
 * Get traffic sources breakdown (sessions grouped by source/medium).
 *
 * @param accessToken - OAuth2 access token
 * @param propertyId  - GA4 property ID
 * @param dateRange   - Start and end dates
 * @returns GA4 report with sessionSource and sessionMedium dimensions
 */
async function getTrafficSources(
  accessToken: string,
  propertyId: string,
  dateRange: GA4DateRange,
): Promise<Schema$RunReportResponse> {
  return runReport(accessToken, propertyId, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    metrics: ["sessions"],
    dimensions: ["sessionSource", "sessionMedium"],
  });
}

/**
 * Get top pages by page views.
 *
 * @param accessToken - OAuth2 access token
 * @param propertyId  - GA4 property ID
 * @param dateRange   - Start and end dates
 * @returns GA4 report with pagePath dimension and screenPageViews metric
 */
async function getPageViews(
  accessToken: string,
  propertyId: string,
  dateRange: GA4DateRange,
): Promise<Schema$RunReportResponse> {
  return runReport(accessToken, propertyId, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    metrics: ["screenPageViews"],
    dimensions: ["pagePath"],
  });
}

/**
 * Get the number of active users right now (real-time).
 *
 * Uses the GA4 Realtime Report endpoint which does not require a date range.
 *
 * @param accessToken - OAuth2 access token
 * @param propertyId  - GA4 property ID
 * @returns Real-time report with activeUsers metric
 */
async function getRealTimeUsers(
  accessToken: string,
  propertyId: string,
): Promise<analyticsdata_v1beta.Schema$RunRealtimeReportResponse> {
  const client = getGA4Client(accessToken);

  return executeRequest("getRealTimeUsers", () =>
    client.properties.runRealtimeReport({
      property: `properties/${propertyId}`,
      requestBody: {
        metrics: [{ name: "activeUsers" }],
      },
    }),
  );
}

// ─── Data Transformation ──────────────────────────────────────────

/**
 * Convert a GA4 RunReportResponse into a time-series array.
 *
 * Expects the report to contain a "date" dimension. Each row becomes
 * an object with the date and all metric values parsed as numbers.
 *
 * @param report - Raw GA4 RunReportResponse
 * @returns Array of objects keyed by date and metric names
 */
function transformReportToTimeSeries(
  report: Schema$RunReportResponse,
): GA4MetricData[] {
  const metricHeaders =
    report.metricHeaders?.map((h) => h.name ?? "unknown") ?? [];
  const dimensionHeaders =
    report.dimensionHeaders?.map((h) => h.name ?? "unknown") ?? [];
  const dateIndex = dimensionHeaders.indexOf("date");

  if (dateIndex === -1) {
    throw new GA4ApiError(
      "Report does not contain a 'date' dimension — cannot convert to time series",
      422,
    );
  }

  const rows = report.rows ?? [];

  return rows.map((row) => {
    const date = row.dimensionValues?.[dateIndex]?.value ?? "";
    const entry: GA4MetricData = { date };

    metricHeaders.forEach((metricName, i) => {
      const raw = row.metricValues?.[i]?.value ?? "0";
      entry[metricName] = parseFloat(raw);
    });

    return entry;
  });
}

/**
 * Aggregate a GA4 RunReportResponse into summary totals.
 *
 * Uses the report's built-in `totals` row when available, otherwise
 * sums values across all rows manually.
 *
 * @param report - Raw GA4 RunReportResponse
 * @returns Array of { metric, value } summary entries
 */
function transformReportToSummary(
  report: Schema$RunReportResponse,
): GA4SummaryEntry[] {
  const metricHeaders =
    report.metricHeaders?.map((h) => h.name ?? "unknown") ?? [];

  // Prefer the API-provided totals row
  const totalsRow = report.totals?.[0];
  if (totalsRow) {
    return metricHeaders.map((metric, i) => ({
      metric,
      value: parseFloat(totalsRow.metricValues?.[i]?.value ?? "0"),
    }));
  }

  // Manual aggregation fallback
  const sums = new Map<string, number>();
  for (const name of metricHeaders) {
    sums.set(name, 0);
  }

  for (const row of report.rows ?? []) {
    metricHeaders.forEach((name, i) => {
      const val = parseFloat(row.metricValues?.[i]?.value ?? "0");
      sums.set(name, (sums.get(name) ?? 0) + val);
    });
  }

  return metricHeaders.map((metric) => ({
    metric,
    value: sums.get(metric) ?? 0,
  }));
}

// ─── Exported Service ─────────────────────────────────────────────

export const ga4Service = {
  // Authentication
  getGA4Client,

  // Report fetching
  runReport,
  getTrafficSources,
  getPageViews,
  getRealTimeUsers,

  // Data transformation
  transformReportToTimeSeries,
  transformReportToSummary,
} as const;
