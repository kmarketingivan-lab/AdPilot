import { decrypt } from "@/lib/encryption";

// ---------- Types ----------

interface MetaAdsConnection {
  accessToken: string;
  accountId: string; // Meta ad account ID (without "act_" prefix)
}

interface MetaCampaignConfig {
  name: string;
  objective:
    | "OUTCOME_AWARENESS"
    | "OUTCOME_ENGAGEMENT"
    | "OUTCOME_LEADS"
    | "OUTCOME_SALES"
    | "OUTCOME_TRAFFIC"
    | "OUTCOME_APP_PROMOTION";
  status?: "ACTIVE" | "PAUSED";
  specialAdCategories?: string[];
}

interface MetaAdSetConfig {
  name: string;
  dailyBudget?: number;   // in cents
  lifetimeBudget?: number; // in cents
  bidAmount?: number;
  billingEvent?: "IMPRESSIONS" | "LINK_CLICKS";
  optimizationGoal?: "REACH" | "IMPRESSIONS" | "LINK_CLICKS" | "LANDING_PAGE_VIEWS" | "CONVERSIONS";
  targeting: {
    geoLocations?: { countries?: string[] };
    ageMin?: number;
    ageMax?: number;
    genders?: number[]; // 1 = male, 2 = female
    interests?: Array<{ id: string; name: string }>;
    customAudiences?: Array<{ id: string }>;
  };
  startTime?: string; // ISO 8601
  endTime?: string;
  status?: "ACTIVE" | "PAUSED";
}

interface MetaAdCreative {
  name: string;
  headline: string;
  description: string;
  body: string;
  ctaType?: string;
  imageUrl?: string;
  imageHash?: string;
  linkUrl: string;
  pageId: string;
}

interface MetaAdPerformance {
  adId: string;
  adName: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cpc: number;
  costPerResult: number;
}

// ---------- Constants ----------

const META_API_VERSION = "v24.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// ---------- Helpers ----------

function decryptConnection(connection: {
  accessToken: string;
  refreshToken: string;
  accountId: string;
}): MetaAdsConnection {
  return {
    accessToken: decrypt(connection.accessToken),
    accountId: connection.accountId,
  };
}

function actAccountId(accountId: string): string {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}

async function metaApiRequest<T>(
  accessToken: string,
  path: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${META_BASE_URL}/${path}`;

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (method === "GET") {
    // For GET requests, append access_token as query param
    const separator = path.includes("?") ? "&" : "?";
    const getUrl = `${META_BASE_URL}/${path}${separator}access_token=${encodeURIComponent(accessToken)}`;

    const response = await fetch(getUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Meta API error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  // POST requests include access_token in body
  options.body = JSON.stringify({
    ...body,
    access_token: accessToken,
  });

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

// ---------- Service Functions ----------

/**
 * Create a Meta Ads campaign.
 */
export async function createCampaign(
  connection: { accessToken: string; refreshToken: string; accountId: string },
  config: MetaCampaignConfig,
): Promise<{ id: string }> {
  const { accessToken, accountId } = decryptConnection(connection);
  const actId = actAccountId(accountId);

  const result = await metaApiRequest<{ id: string }>(
    accessToken,
    `${actId}/campaigns`,
    "POST",
    {
      name: config.name,
      objective: config.objective,
      status: config.status ?? "PAUSED",
      special_ad_categories: config.specialAdCategories ?? [],
    },
  );

  return result;
}

/**
 * Create an ad set within a campaign, including targeting and budget.
 */
export async function createAdSet(
  connection: { accessToken: string; refreshToken: string; accountId: string },
  campaignId: string,
  config: MetaAdSetConfig,
): Promise<{ id: string }> {
  const { accessToken, accountId } = decryptConnection(connection);
  const actId = actAccountId(accountId);

  const targeting: Record<string, unknown> = {};

  if (config.targeting.geoLocations) {
    targeting.geo_locations = config.targeting.geoLocations;
  }
  if (config.targeting.ageMin) {
    targeting.age_min = config.targeting.ageMin;
  }
  if (config.targeting.ageMax) {
    targeting.age_max = config.targeting.ageMax;
  }
  if (config.targeting.genders) {
    targeting.genders = config.targeting.genders;
  }
  if (config.targeting.interests) {
    targeting.flexible_spec = [
      { interests: config.targeting.interests },
    ];
  }
  if (config.targeting.customAudiences) {
    targeting.custom_audiences = config.targeting.customAudiences;
  }

  const body: Record<string, unknown> = {
    name: config.name,
    campaign_id: campaignId,
    billing_event: config.billingEvent ?? "IMPRESSIONS",
    optimization_goal: config.optimizationGoal ?? "LINK_CLICKS",
    targeting,
    status: config.status ?? "PAUSED",
  };

  if (config.dailyBudget) {
    body.daily_budget = config.dailyBudget;
  }
  if (config.lifetimeBudget) {
    body.lifetime_budget = config.lifetimeBudget;
  }
  if (config.bidAmount) {
    body.bid_amount = config.bidAmount;
  }
  if (config.startTime) {
    body.start_time = config.startTime;
  }
  if (config.endTime) {
    body.end_time = config.endTime;
  }

  const result = await metaApiRequest<{ id: string }>(
    accessToken,
    `${actId}/adsets`,
    "POST",
    body,
  );

  return result;
}

/**
 * Create a single ad within an ad set, including creative inline.
 */
export async function createAd(
  connection: { accessToken: string; refreshToken: string; accountId: string },
  adSetId: string,
  creative: MetaAdCreative,
): Promise<{ id: string }> {
  const { accessToken, accountId } = decryptConnection(connection);
  const actId = actAccountId(accountId);

  const linkData: Record<string, unknown> = {
    message: creative.body,
    link: creative.linkUrl,
    name: creative.headline,
    description: creative.description,
  };

  if (creative.ctaType) {
    linkData.call_to_action = { type: creative.ctaType };
  }
  if (creative.imageHash) {
    linkData.image_hash = creative.imageHash;
  } else if (creative.imageUrl) {
    linkData.picture = creative.imageUrl;
  }

  const result = await metaApiRequest<{ id: string }>(
    accessToken,
    `${actId}/ads`,
    "POST",
    {
      name: creative.name,
      adset_id: adSetId,
      status: "PAUSED",
      creative: {
        object_story_spec: {
          page_id: creative.pageId,
          link_data: linkData,
        },
      },
    },
  );

  return result;
}

/**
 * Create multiple ads within an ad set for A/B testing.
 * Each creative becomes a separate ad so Meta can optimize delivery.
 */
export async function createMultipleAds(
  connection: { accessToken: string; refreshToken: string; accountId: string },
  adSetId: string,
  creatives: MetaAdCreative[],
): Promise<Array<{ id: string; creativeName: string }>> {
  const results: Array<{ id: string; creativeName: string }> = [];

  for (const creative of creatives) {
    const result = await createAd(connection, adSetId, creative);
    results.push({ id: result.id, creativeName: creative.name });
  }

  return results;
}

/**
 * Fetch per-ad insights (performance metrics) for a campaign.
 */
export async function getAdPerformance(
  connection: { accessToken: string; refreshToken: string; accountId: string },
  campaignId: string,
): Promise<MetaAdPerformance[]> {
  const { accessToken } = decryptConnection(connection);

  const fields = [
    "ad_id",
    "ad_name",
    "impressions",
    "clicks",
    "actions",
    "spend",
    "ctr",
    "cpc",
    "cost_per_action_type",
  ].join(",");

  const response = await metaApiRequest<{
    data: Array<{
      ad_id: string;
      ad_name: string;
      impressions: string;
      clicks: string;
      actions?: Array<{ action_type: string; value: string }>;
      spend: string;
      ctr: string;
      cpc: string;
      cost_per_action_type?: Array<{
        action_type: string;
        value: string;
      }>;
    }>;
  }>(
    accessToken,
    `${campaignId}/insights?fields=${fields}&level=ad&time_increment=all_days`,
    "GET",
  );

  return (response.data ?? []).map((row) => {
    const conversions =
      row.actions?.find(
        (a) =>
          a.action_type === "offsite_conversion" ||
          a.action_type === "lead" ||
          a.action_type === "purchase",
      )?.value ?? "0";

    const costPerResult =
      row.cost_per_action_type?.find(
        (a) =>
          a.action_type === "offsite_conversion" ||
          a.action_type === "lead" ||
          a.action_type === "purchase",
      )?.value ?? "0";

    return {
      adId: row.ad_id,
      adName: row.ad_name,
      impressions: parseInt(row.impressions, 10) || 0,
      clicks: parseInt(row.clicks, 10) || 0,
      conversions: parseInt(conversions, 10) || 0,
      spend: parseFloat(row.spend) || 0,
      ctr: parseFloat(row.ctr) || 0,
      cpc: parseFloat(row.cpc) || 0,
      costPerResult: parseFloat(costPerResult) || 0,
    };
  });
}
