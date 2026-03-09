// ---------------------------------------------------------------------------
// Meta Marketing API connector (v24.0)
// Uses native fetch against the Graph API.
// ---------------------------------------------------------------------------

const META_API_VERSION = 'v24.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// ---- Types ----------------------------------------------------------------

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

export interface MetaAdsCampaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
}

export interface MetaAdsInsight {
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
  roas: number | null;
}

// ---- Error class ----------------------------------------------------------

export class MetaAdsApiError extends Error {
  public readonly statusCode: number;
  public readonly details: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'MetaAdsApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ---- Helpers --------------------------------------------------------------

function safeDiv(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function buildTimeRange(dateRange: DateRange): string {
  return JSON.stringify({ since: dateRange.start, until: dateRange.end });
}

/**
 * Generic GET request against the Meta Graph API.
 * Handles error responses uniformly.
 */
async function metaGet<T>(url: string, accessToken: string): Promise<T> {
  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(fullUrl);

  if (!response.ok) {
    const body = await response.text();
    let details: unknown;
    try {
      details = JSON.parse(body);
    } catch {
      details = body;
    }
    throw new MetaAdsApiError(
      `Meta Ads API error (${response.status}): ${response.statusText}`,
      response.status,
      details,
    );
  }

  return (await response.json()) as T;
}

/**
 * Paginate through all results using the `paging.next` cursor.
 */
async function metaGetAll<T>(url: string, accessToken: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const page: { data: T[]; paging?: { next?: string } } = await metaGet<{
      data: T[];
      paging?: { next?: string };
    }>(nextUrl, accessToken);

    items.push(...page.data);
    nextUrl = page.paging?.next ?? null;
  }

  return items;
}

// ---- Transform ------------------------------------------------------------

/**
 * Extract the total conversion count from Meta's `actions` array.
 * Meta reports conversions under various action types; we sum the ones that
 * represent meaningful conversion events.
 */
function extractConversions(
  actions?: Array<{ action_type: string; value: string }>,
): number {
  if (!actions || actions.length === 0) return 0;

  const conversionTypes = new Set([
    'offsite_conversion',
    'offsite_conversion.fb_pixel_purchase',
    'offsite_conversion.fb_pixel_lead',
    'offsite_conversion.fb_pixel_complete_registration',
    'lead',
    'purchase',
    'complete_registration',
    'omni_purchase',
    'onsite_conversion.messaging_conversation_started_7d',
  ]);

  return actions
    .filter((a) => conversionTypes.has(a.action_type))
    .reduce((sum, a) => sum + Number(a.value), 0);
}

/**
 * Normalize a single Meta insights row into our canonical format.
 */
function transformSingleInsight(raw: Record<string, unknown>): MetaAdsInsight {
  const impressions = Number(raw.impressions ?? 0);
  const clicks = Number(raw.clicks ?? 0);
  const spend = Number(raw.spend ?? 0);
  const conversions = extractConversions(
    raw.actions as Array<{ action_type: string; value: string }> | undefined,
  );

  // Meta sometimes returns cpc / ctr directly -- use them or compute.
  const cpc = raw.cpc != null ? Number(raw.cpc) : safeDiv(spend, clicks);
  const ctr = raw.ctr != null ? Number(raw.ctr) / 100 : safeDiv(clicks, impressions);
  const cpa = safeDiv(spend, conversions);
  const roas = safeDiv(conversions, spend);

  return {
    date: (raw.date_start ?? raw.date ?? '') as string,
    impressions,
    clicks,
    conversions,
    spend,
    cpc,
    ctr,
    cpa,
    roas,
  };
}

/**
 * Transform an array of raw Meta insight objects into canonical MetaAdsInsight[].
 */
function transformInsights(insights: Record<string, unknown>[]): MetaAdsInsight[] {
  return insights.map(transformSingleInsight);
}

// ---- Service methods ------------------------------------------------------

/**
 * Fetch all campaigns for an ad account.
 */
async function fetchCampaigns(
  accessToken: string,
  adAccountId: string,
  dateRange: DateRange,
): Promise<MetaAdsCampaign[]> {
  const cleanId = adAccountId.replace(/^act_/, '');
  const fields = 'name,status,objective,daily_budget,lifetime_budget';
  const timeRange = buildTimeRange(dateRange);
  const url =
    `${META_BASE_URL}/act_${cleanId}/campaigns` +
    `?fields=${fields}` +
    `&time_range=${encodeURIComponent(timeRange)}` +
    `&limit=500`;

  interface RawCampaign {
    id: string;
    name: string;
    status: string;
    objective?: string;
    daily_budget?: string;
    lifetime_budget?: string;
  }

  const campaigns = await metaGetAll<RawCampaign>(url, accessToken);

  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    objective: c.objective ?? null,
    dailyBudget: c.daily_budget != null ? Number(c.daily_budget) / 100 : null,
    lifetimeBudget: c.lifetime_budget != null ? Number(c.lifetime_budget) / 100 : null,
  }));
}

/**
 * Fetch daily insights for a single campaign.
 */
async function fetchCampaignInsights(
  accessToken: string,
  campaignId: string,
  dateRange: DateRange,
): Promise<MetaAdsInsight[]> {
  const fields = 'impressions,clicks,spend,actions,cost_per_action_type,ctr,cpc';
  const timeRange = buildTimeRange(dateRange);
  const url =
    `${META_BASE_URL}/${campaignId}/insights` +
    `?fields=${fields}` +
    `&time_range=${encodeURIComponent(timeRange)}` +
    `&time_increment=1` +
    `&limit=500`;

  const rawInsights = await metaGetAll<Record<string, unknown>>(url, accessToken);

  return transformInsights(rawInsights);
}

/**
 * Fetch account-level aggregated insights for the given date range.
 */
async function fetchAccountInsights(
  accessToken: string,
  adAccountId: string,
  dateRange: DateRange,
): Promise<MetaAdsInsight[]> {
  const cleanId = adAccountId.replace(/^act_/, '');
  const fields = 'impressions,clicks,spend,actions,cost_per_action_type,ctr,cpc';
  const timeRange = buildTimeRange(dateRange);
  const url =
    `${META_BASE_URL}/act_${cleanId}/insights` +
    `?fields=${fields}` +
    `&time_range=${encodeURIComponent(timeRange)}` +
    `&limit=500`;

  const rawInsights = await metaGetAll<Record<string, unknown>>(url, accessToken);

  return transformInsights(rawInsights);
}

// ---- Exported service object -----------------------------------------------

export const metaAdsService = {
  fetchCampaigns,
  fetchCampaignInsights,
  fetchAccountInsights,
  transformInsights,
} as const;
