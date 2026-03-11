// ---------------------------------------------------------------------------
// Google Ads REST API connector (v17)
// Uses native fetch -- no client library dependency.
// ---------------------------------------------------------------------------

const GOOGLE_ADS_API_VERSION = 'v17';
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_OAUTH2_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ---- Types ----------------------------------------------------------------

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  spend: number;       // dollars
  conversions: number;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
  roas: number | null;
}

export interface GoogleAdsMetric {
  date: string;        // YYYY-MM-DD
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
  roas: number | null;
}

interface GoogleAdsTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// ---- Error class ----------------------------------------------------------

export class GoogleAdsApiError extends Error {
  public readonly statusCode: number;
  public readonly details: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'GoogleAdsApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ---- Helpers --------------------------------------------------------------

function micros(value: string | number): number {
  return Number(value) / 1_000_000;
}

function safeDiv(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function computeDerivedMetrics(row: {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}): { cpc: number | null; ctr: number | null; cpa: number | null; roas: number | null } {
  return {
    cpc: safeDiv(row.spend, row.clicks),
    ctr: safeDiv(row.clicks, row.impressions),
    cpa: safeDiv(row.spend, row.conversions),
    roas: safeDiv(row.conversions, row.spend), // simple ROAS = conversions / spend
  };
}

/**
 * Execute a GAQL query via the Google Ads REST searchStream endpoint.
 * Returns the concatenated rows from all batches.
 */
async function executeGaqlQuery(
  accessToken: string,
  customerId: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const cleanCustomerId = customerId.replace(/-/g, '');
  const url = `${GOOGLE_ADS_BASE_URL}/customers/${cleanCustomerId}/googleAds:searchStream`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const body = await response.text();
    let details: unknown;
    try {
      details = JSON.parse(body);
    } catch {
      details = body;
    }
    throw new GoogleAdsApiError(
      `Google Ads API error (${response.status}): ${response.statusText}`,
      response.status,
      details,
    );
  }

  // searchStream returns an array of batches, each with a `results` array.
  const batches = (await response.json()) as Array<{ results?: Record<string, unknown>[] }>;
  const rows: Record<string, unknown>[] = [];
  for (const batch of batches) {
    if (batch.results) {
      rows.push(...batch.results);
    }
  }
  return rows;
}

// ---- Service methods ------------------------------------------------------

/**
 * Fetch all campaigns with aggregated metrics for the given date range.
 */
async function fetchCampaigns(
  accessToken: string,
  customerId: string,
  dateRange: DateRange,
): Promise<GoogleAdsCampaign[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  `.trim();

  const rows = await executeGaqlQuery(accessToken, customerId, query);

  return rows.map((row) => {
    const campaign = row.campaign as Record<string, string>;
    const metrics = row.metrics as Record<string, string>;

    const impressions = Number(metrics.impressions ?? 0);
    const clicks = Number(metrics.clicks ?? 0);
    const spend = micros(metrics.costMicros ?? metrics.cost_micros ?? '0');
    const conversions = Number(metrics.conversions ?? 0);

    return {
      id: String(campaign.id),
      name: campaign.name,
      status: campaign.status,
      impressions,
      clicks,
      spend,
      conversions,
      ...computeDerivedMetrics({ impressions, clicks, spend, conversions }),
    };
  });
}

/**
 * Fetch daily metric breakdown for a single campaign.
 */
async function fetchCampaignMetrics(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateRange: DateRange,
): Promise<GoogleAdsMetric[]> {
  const query = `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
    ORDER BY segments.date ASC
  `.trim();

  const rows = await executeGaqlQuery(accessToken, customerId, query);

  return rows.map((row) => {
    const segments = row.segments as Record<string, string>;
    const metrics = row.metrics as Record<string, string>;

    const impressions = Number(metrics.impressions ?? 0);
    const clicks = Number(metrics.clicks ?? 0);
    const spend = micros(metrics.costMicros ?? metrics.cost_micros ?? '0');
    const conversions = Number(metrics.conversions ?? 0);

    return {
      date: segments.date,
      impressions,
      clicks,
      spend,
      conversions,
      ...computeDerivedMetrics({ impressions, clicks, spend, conversions }),
    };
  });
}

/**
 * Exchange a refresh token for a new access token via Google OAuth2.
 */
async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleAdsTokenResponse> {
  const response = await fetch(GOOGLE_OAUTH2_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    let details: unknown;
    try {
      details = JSON.parse(body);
    } catch {
      details = body;
    }
    throw new GoogleAdsApiError(
      `Failed to refresh Google token (${response.status})`,
      response.status,
      details,
    );
  }

  return (await response.json()) as GoogleAdsTokenResponse;
}

// ---- Exported service object -----------------------------------------------

export const googleAdsService = {
  fetchCampaigns,
  fetchCampaignMetrics,
  refreshGoogleToken,
} as const;
