import { decrypt } from "@/lib/encryption";

// ---------- Types ----------

interface GoogleAdsConnection {
  accessToken: string;
  refreshToken: string;
  accountId: string; // Google Ads customer ID (e.g., "123-456-7890")
}

interface CampaignConfig {
  name: string;
  budgetAmountMicros: number;
  budgetType: "DAILY" | "LIFETIME";
  biddingStrategy: "MAXIMIZE_CLICKS" | "MAXIMIZE_CONVERSIONS" | "TARGET_CPA" | "TARGET_ROAS";
  targetCpaMicros?: number;
  targetRoas?: number;
  status?: "ENABLED" | "PAUSED";
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

interface AdGroupConfig {
  name: string;
  cpcBidMicros?: number;
}

interface GoogleAdPerformance {
  adId: string;
  adName: string;
  impressions: number;
  clicks: number;
  conversions: number;
  costMicros: number;
  ctr: number;
  conversionRate: number;
  headlines: string[];
  descriptions: string[];
}

// ---------- Constants ----------

const GOOGLE_ADS_API_VERSION = "v17";
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

// ---------- Helpers ----------

function formatCustomerId(raw: string): string {
  return raw.replace(/-/g, "");
}

function decryptConnection(connection: {
  accessToken: string;
  refreshToken: string;
  accountId: string;
}): GoogleAdsConnection {
  return {
    accessToken: decrypt(connection.accessToken),
    refreshToken: decrypt(connection.refreshToken),
    accountId: connection.accountId,
  };
}

function buildHeaders(accessToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    headers["developer-token"] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  }

  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = formatCustomerId(
      process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    );
  }

  return headers;
}

async function googleAdsRequest<T>(
  accessToken: string,
  customerId: string,
  path: string,
  body?: unknown,
  method: "POST" | "GET" = "POST",
): Promise<T> {
  const formattedId = formatCustomerId(customerId);
  const url = `${GOOGLE_ADS_BASE_URL}/customers/${formattedId}/${path}`;

  const response = await fetch(url, {
    method,
    headers: buildHeaders(accessToken),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Google Ads API error (${response.status}): ${errorBody}`,
    );
  }

  return response.json() as Promise<T>;
}

// ---------- Service Functions ----------

/**
 * Create a Search campaign with the specified budget and bidding strategy.
 */
export async function createSearchCampaign(
  connection: { accessToken: string; refreshToken: string; accountId: string },
  config: CampaignConfig,
): Promise<{ resourceName: string; campaignId: string }> {
  const { accessToken, accountId } = decryptConnection(connection);
  const customerId = formatCustomerId(accountId);

  // Step 1: Create campaign budget
  const budgetResponse = await googleAdsRequest<{
    results: Array<{ resourceName: string }>;
  }>(accessToken, customerId, "campaignBudgets:mutate", {
    operations: [
      {
        create: {
          name: `${config.name} Budget`,
          amountMicros: config.budgetAmountMicros.toString(),
          deliveryMethod: "STANDARD",
          ...(config.budgetType === "LIFETIME"
            ? { explicitlyShared: false, totalAmountMicros: config.budgetAmountMicros.toString() }
            : {}),
        },
      },
    ],
  });

  const budgetResourceName = budgetResponse.results[0].resourceName;

  // Step 2: Create campaign
  const biddingConfig: Record<string, unknown> = {};
  switch (config.biddingStrategy) {
    case "MAXIMIZE_CLICKS":
      biddingConfig.maximizeClicks = {};
      break;
    case "MAXIMIZE_CONVERSIONS":
      biddingConfig.maximizeConversions = {};
      break;
    case "TARGET_CPA":
      biddingConfig.targetCpa = {
        targetCpaMicros: (config.targetCpaMicros ?? 0).toString(),
      };
      break;
    case "TARGET_ROAS":
      biddingConfig.targetRoas = {
        targetRoas: config.targetRoas ?? 1.0,
      };
      break;
  }

  const campaignResponse = await googleAdsRequest<{
    results: Array<{ resourceName: string }>;
  }>(accessToken, customerId, "campaigns:mutate", {
    operations: [
      {
        create: {
          name: config.name,
          advertisingChannelType: "SEARCH",
          status: config.status ?? "PAUSED",
          campaignBudget: budgetResourceName,
          ...biddingConfig,
          ...(config.startDate ? { startDate: config.startDate.replace(/-/g, "") } : {}),
          ...(config.endDate ? { endDate: config.endDate.replace(/-/g, "") } : {}),
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            targetContentNetwork: false,
          },
        },
      },
    ],
  });

  const campaignResourceName = campaignResponse.results[0].resourceName;
  const campaignId = campaignResourceName.split("/").pop()!;

  return { resourceName: campaignResourceName, campaignId };
}

/**
 * Create an ad group within an existing campaign.
 */
export async function createAdGroup(
  connection: { accessToken: string; refreshToken: string; accountId: string },
  campaignId: string,
  name: string,
  cpcBidMicros?: number,
): Promise<{ resourceName: string; adGroupId: string }> {
  const { accessToken, accountId } = decryptConnection(connection);
  const customerId = formatCustomerId(accountId);

  const response = await googleAdsRequest<{
    results: Array<{ resourceName: string }>;
  }>(accessToken, customerId, "adGroups:mutate", {
    operations: [
      {
        create: {
          name,
          campaign: `customers/${customerId}/campaigns/${campaignId}`,
          type: "SEARCH_STANDARD",
          status: "ENABLED",
          ...(cpcBidMicros
            ? { cpcBidMicros: cpcBidMicros.toString() }
            : {}),
        },
      },
    ],
  });

  const resourceName = response.results[0].resourceName;
  const adGroupId = resourceName.split("/").pop()!;

  return { resourceName, adGroupId };
}

/**
 * Create a Responsive Search Ad (RSA) with multiple headline and description variants.
 * Google Ads RSA supports up to 15 headlines and 4 descriptions.
 */
export async function createResponsiveSearchAd(
  connection: { accessToken: string; refreshToken: string; accountId: string },
  adGroupId: string,
  headlines: string[],
  descriptions: string[],
  finalUrl: string,
): Promise<{ resourceName: string; adId: string }> {
  const { accessToken, accountId } = decryptConnection(connection);
  const customerId = formatCustomerId(accountId);

  if (headlines.length < 3) {
    throw new Error("RSA requires at least 3 headlines");
  }
  if (headlines.length > 15) {
    throw new Error("RSA supports at most 15 headlines");
  }
  if (descriptions.length < 2) {
    throw new Error("RSA requires at least 2 descriptions");
  }
  if (descriptions.length > 4) {
    throw new Error("RSA supports at most 4 descriptions");
  }

  const headlineAssets = headlines.map((text, idx) => ({
    text,
    ...(idx < 3 ? { pinnedField: undefined } : {}),
  }));

  const descriptionAssets = descriptions.map((text) => ({
    text,
  }));

  const response = await googleAdsRequest<{
    results: Array<{ resourceName: string }>;
  }>(accessToken, customerId, "adGroupAds:mutate", {
    operations: [
      {
        create: {
          adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
          status: "ENABLED",
          ad: {
            responsiveSearchAd: {
              headlines: headlineAssets,
              descriptions: descriptionAssets,
            },
            finalUrls: [finalUrl],
          },
        },
      },
    ],
  });

  const resourceName = response.results[0].resourceName;
  const adId = resourceName.split("/").pop()!;

  return { resourceName, adId };
}

/**
 * Fetch per-ad performance metrics for a campaign using Google Ads Query Language (GAQL).
 */
export async function getAdPerformance(
  connection: { accessToken: string; refreshToken: string; accountId: string },
  campaignId: string,
): Promise<GoogleAdPerformance[]> {
  const { accessToken, accountId } = decryptConnection(connection);
  const customerId = formatCustomerId(accountId);

  const query = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_micros,
      metrics.ctr,
      metrics.all_conversions_from_interactions_rate
    FROM ad_group_ad
    WHERE campaign.id = ${campaignId}
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
  `;

  const response = await googleAdsRequest<{
    results: Array<{
      adGroupAd: {
        ad: {
          id: string;
          name: string;
          responsiveSearchAd?: {
            headlines: Array<{ text: string }>;
            descriptions: Array<{ text: string }>;
          };
        };
      };
      metrics: {
        impressions: string;
        clicks: string;
        conversions: string;
        costMicros: string;
        ctr: number;
        allConversionsFromInteractionsRate: number;
      };
    }>;
  }>(accessToken, customerId, "googleAds:searchStream", {
    query,
  });

  return (response.results ?? []).map((row) => ({
    adId: row.adGroupAd.ad.id,
    adName: row.adGroupAd.ad.name ?? "",
    impressions: parseInt(row.metrics.impressions, 10) || 0,
    clicks: parseInt(row.metrics.clicks, 10) || 0,
    conversions: parseFloat(row.metrics.conversions) || 0,
    costMicros: parseInt(row.metrics.costMicros, 10) || 0,
    ctr: row.metrics.ctr ?? 0,
    conversionRate: row.metrics.allConversionsFromInteractionsRate ?? 0,
    headlines:
      row.adGroupAd.ad.responsiveSearchAd?.headlines.map((h) => h.text) ?? [],
    descriptions:
      row.adGroupAd.ad.responsiveSearchAd?.descriptions.map((d) => d.text) ??
      [],
  }));
}
