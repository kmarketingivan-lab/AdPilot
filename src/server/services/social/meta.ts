/**
 * Meta (Instagram + Facebook) Graph API Service
 *
 * Handles publishing to Instagram and Facebook, token management,
 * and insights retrieval via the Meta Graph API v24.0.
 */

const META_API_BASE = "https://graph.facebook.com/v24.0";

// ─── Error Handling ───────────────────────────────────────────────

interface MetaApiErrorData {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaApiError extends Error {
  public readonly type: string;
  public readonly code: number;
  public readonly errorSubcode?: number;
  public readonly fbtraceId?: string;

  constructor(data: MetaApiErrorData) {
    super(data.message);
    this.name = "MetaApiError";
    this.type = data.type;
    this.code = data.code;
    this.errorSubcode = data.error_subcode;
    this.fbtraceId = data.fbtrace_id;
  }

  /** True if the token has expired or been invalidated. */
  get isTokenExpired(): boolean {
    return this.code === 190;
  }

  /** True if the app has hit a rate limit. */
  get isRateLimited(): boolean {
    return this.code === 4 || this.code === 32;
  }

  /** True if the user needs to re-authorize permissions. */
  get isPermissionError(): boolean {
    return this.code === 10 || this.code === 200;
  }
}

// ─── Types ────────────────────────────────────────────────────────

interface MetaMediaContainer {
  id: string;
}

interface MetaPublishResult {
  id: string;
}

interface MetaInsightValue {
  value: number;
}

interface MetaInsight {
  name: string;
  period: string;
  values: MetaInsightValue[];
  title: string;
  description: string;
  id: string;
}

interface InstagramInsightsResponse {
  data: MetaInsight[];
}

interface FacebookInsightsResponse {
  data: MetaInsight[];
}

interface FacebookPostResult {
  id: string;
  post_id?: string;
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PageAccessTokenResponse {
  access_token: string;
  id: string;
}

// ─── Rate Limit & Retry Helpers ───────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

// ─── Internal Helpers ─────────────────────────────────────────────

async function metaFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  let lastError: MetaApiError | undefined;

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      const data = (await response.json()) as { error?: MetaApiErrorData } & T;

      if (!response.ok) {
        const errorPayload = data?.error;
        if (errorPayload) {
          throw new MetaApiError({
            message: errorPayload.message ?? "Unknown Meta API error",
            type: errorPayload.type ?? "UnknownError",
            code: errorPayload.code ?? response.status,
            error_subcode: errorPayload.error_subcode,
            fbtrace_id: errorPayload.fbtrace_id,
          });
        }
        throw new MetaApiError({
          message: `Meta API request failed with status ${response.status}`,
          type: "HttpError",
          code: response.status,
        });
      }

      return data as T;
    } catch (error) {
      if (error instanceof MetaApiError) {
        // Rate limit (codes 4, 32): exponential backoff retry
        if (error.isRateLimited && attempt < RATE_LIMIT_MAX_RETRIES) {
          const delay = RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[meta] Rate limited (code ${error.code}), retrying in ${delay}ms (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`,
          );
          await sleep(delay);
          lastError = error;
          continue;
        }

        // Token expired (code 190): attempt refresh and retry once
        if (error.isTokenExpired && attempt === 0) {
          console.warn(`[meta] Token expired (code 190), attempting refresh...`);
          const refreshedUrl = await tryRefreshTokenInUrl(url);
          if (refreshedUrl) {
            // Retry once with the refreshed token
            try {
              const retryResponse = await fetch(refreshedUrl, options);
              const retryData = (await retryResponse.json()) as { error?: MetaApiErrorData } & T;
              if (!retryResponse.ok) {
                const retryErrorPayload = retryData?.error;
                if (retryErrorPayload) {
                  throw new MetaApiError({
                    message: retryErrorPayload.message ?? "Unknown Meta API error",
                    type: retryErrorPayload.type ?? "UnknownError",
                    code: retryErrorPayload.code ?? retryResponse.status,
                    error_subcode: retryErrorPayload.error_subcode,
                    fbtrace_id: retryErrorPayload.fbtrace_id,
                  });
                }
              }
              return retryData as T;
            } catch (retryError) {
              // Refresh retry failed — throw original error
              throw error;
            }
          }
        }
      }
      throw error;
    }
  }

  // Should not reach here, but if we do, throw the last error
  throw lastError ?? new Error("metaFetch: unexpected end of retry loop");
}

/**
 * Attempt to refresh the access token embedded in a Meta API URL.
 * Extracts the current token from the URL, exchanges it for a new long-lived
 * token, updates the database, and returns a new URL with the refreshed token.
 * Returns null if refresh is not possible.
 */
async function tryRefreshTokenInUrl(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    const currentToken = parsed.searchParams.get("access_token");
    if (!currentToken) return null;

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) return null;

    const refreshUrl = buildUrl("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: currentToken,
    });

    const response = await fetch(refreshUrl);
    if (!response.ok) return null;

    const data = (await response.json()) as { access_token: string; expires_in?: number };
    if (!data.access_token) return null;

    console.log(`[meta] Token refreshed successfully`);

    // Return the original URL with the new token
    parsed.searchParams.set("access_token", data.access_token);
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`${META_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

// ─── Instagram Publishing ─────────────────────────────────────────

/**
 * Create an Instagram media container (image or video).
 * This is Step 1 of the two-step publishing flow.
 *
 * @param igUserId  - The Instagram Business/Creator account user ID
 * @param imageUrl  - Publicly accessible URL of the image
 * @param caption   - Post caption (supports hashtags and mentions)
 * @param accessToken - Page access token with `instagram_basic,instagram_content_publish` permissions
 * @returns The container ID needed for `publishMedia`
 */
async function createMediaContainer(
  igUserId: string,
  imageUrl: string,
  caption: string,
  accessToken: string,
): Promise<MetaMediaContainer> {
  const url = buildUrl(`/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });

  return metaFetch<MetaMediaContainer>(url, { method: "POST" });
}

/**
 * Publish a previously created media container.
 * This is Step 2 of the two-step publishing flow.
 *
 * @param igUserId    - The Instagram Business/Creator account user ID
 * @param containerId - The container ID returned from `createMediaContainer`
 * @param accessToken - Page access token
 * @returns The published media ID
 */
async function publishMedia(
  igUserId: string,
  containerId: string,
  accessToken: string,
): Promise<MetaPublishResult> {
  const url = buildUrl(`/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });

  return metaFetch<MetaPublishResult>(url, { method: "POST" });
}

/**
 * Publish a carousel post to Instagram.
 *
 * Creates a carousel container referencing the provided child container IDs,
 * then publishes it. Each child container must be created beforehand via
 * `createMediaContainer` (without a caption — caption goes on the carousel).
 *
 * @param igUserId     - The Instagram Business/Creator account user ID
 * @param containerIds - Array of child container IDs (2-10 items)
 * @param caption      - Carousel caption
 * @param accessToken  - Page access token
 * @returns The published carousel media ID
 */
async function publishCarousel(
  igUserId: string,
  containerIds: string[],
  caption: string,
  accessToken: string,
): Promise<MetaPublishResult> {
  if (containerIds.length < 2 || containerIds.length > 10) {
    throw new Error(
      "Instagram carousels require between 2 and 10 child containers",
    );
  }

  // Step 1: Create the carousel container
  const carouselUrl = buildUrl(`/${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: containerIds.join(","),
    caption,
    access_token: accessToken,
  });

  const carouselContainer = await metaFetch<MetaMediaContainer>(carouselUrl, {
    method: "POST",
  });

  // Step 2: Publish the carousel container
  return publishMedia(igUserId, carouselContainer.id, accessToken);
}

/**
 * Get insights for an Instagram media object.
 *
 * @param mediaId     - The Instagram media ID
 * @param accessToken - Page access token
 * @param metrics     - Metrics to retrieve (defaults to common engagement metrics)
 * @returns Insights data array
 */
async function getMediaInsights(
  mediaId: string,
  accessToken: string,
  metrics: string[] = [
    "impressions",
    "reach",
    "likes",
    "comments",
    "shares",
    "saved",
  ],
): Promise<InstagramInsightsResponse> {
  const url = buildUrl(`/${mediaId}/insights`, {
    metric: metrics.join(","),
    access_token: accessToken,
  });

  return metaFetch<InstagramInsightsResponse>(url);
}

// ─── Facebook Publishing ──────────────────────────────────────────

/**
 * Publish a post to a Facebook Page.
 *
 * If `imageUrl` is provided, creates a photo post via /{page-id}/photos.
 * Otherwise, creates a text/link post via /{page-id}/feed.
 *
 * @param pageId      - The Facebook Page ID
 * @param message     - Post text content
 * @param accessToken - Page access token with `pages_manage_posts` permission
 * @param imageUrl    - Optional publicly accessible image URL
 * @returns The created post ID
 */
async function publishFacebookPost(
  pageId: string,
  message: string,
  accessToken: string,
  imageUrl?: string,
): Promise<FacebookPostResult> {
  if (imageUrl) {
    const url = buildUrl(`/${pageId}/photos`, {
      url: imageUrl,
      message,
      access_token: accessToken,
    });
    return metaFetch<FacebookPostResult>(url, { method: "POST" });
  }

  const url = buildUrl(`/${pageId}/feed`, {
    message,
    access_token: accessToken,
  });
  return metaFetch<FacebookPostResult>(url, { method: "POST" });
}

/**
 * Get insights for a Facebook Page post.
 *
 * @param postId      - The Facebook post ID (format: pageId_postId)
 * @param accessToken - Page access token with `read_insights` permission
 * @param metrics     - Metrics to retrieve (defaults to common post metrics)
 * @returns Insights data array
 */
async function getFacebookPostInsights(
  postId: string,
  accessToken: string,
  metrics: string[] = [
    "post_impressions",
    "post_impressions_unique",
    "post_engaged_users",
    "post_clicks",
    "post_reactions_like_total",
  ],
): Promise<FacebookInsightsResponse> {
  const url = buildUrl(`/${postId}/insights`, {
    metric: metrics.join(","),
    access_token: accessToken,
  });

  return metaFetch<FacebookInsightsResponse>(url);
}

// ─── Token Management ─────────────────────────────────────────────

/**
 * Exchange a short-lived user token for a long-lived token (60 days).
 *
 * @param shortToken - The short-lived token from the login flow
 * @returns Long-lived token details including `access_token` and `expires_in`
 */
async function exchangeShortLivedToken(
  shortToken: string,
): Promise<LongLivedTokenResponse> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "META_APP_ID and META_APP_SECRET environment variables are required",
    );
  }

  const url = buildUrl("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });

  return metaFetch<LongLivedTokenResponse>(url);
}

/**
 * Retrieve a Page access token from a user access token.
 *
 * The returned Page token does not expire if the user token is long-lived.
 *
 * @param userToken - A long-lived user access token
 * @param pageId    - The Facebook Page ID
 * @returns Page access token details
 */
async function getPageAccessToken(
  userToken: string,
  pageId: string,
): Promise<PageAccessTokenResponse> {
  const url = buildUrl(`/${pageId}`, {
    fields: "access_token",
    access_token: userToken,
  });

  return metaFetch<PageAccessTokenResponse>(url);
}

// ─── Exported Service ─────────────────────────────────────────────

export const metaService = {
  // Instagram
  createMediaContainer,
  publishMedia,
  publishCarousel,
  getMediaInsights,

  // Facebook
  publishFacebookPost,
  getFacebookPostInsights,

  // Token management
  exchangeShortLivedToken,
  getPageAccessToken,
} as const;
