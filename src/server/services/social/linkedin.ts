// ---------------------------------------------------------------------------
// LinkedIn API v2 Service
// ---------------------------------------------------------------------------

const LINKEDIN_API_BASE = "https://api.linkedin.com/v2";

const RESTLI_HEADERS = {
  "X-Restli-Protocol-Version": "2.0.0",
} as const;

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export class LinkedInApiError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;
  public readonly body: unknown;

  constructor(message: string, status: number, body: unknown, code?: string) {
    super(message);
    this.name = "LinkedInApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegisterUploadResponse {
  value: {
    uploadMechanism: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
        uploadUrl: string;
        headers: Record<string, string>;
      };
    };
    asset: string; // e.g. "urn:li:digitalmediaAsset:ABC123"
    mediaArtifact: string;
  };
}

interface UgcPostResponse {
  id: string; // URN of the created post
}

interface ShareStatistic {
  totalShareStatistics: {
    shareCount: number;
    clickCount: number;
    engagement: number;
    commentCount: number;
    impressionCount: number;
    likeCount: number;
  };
}

interface ShareStatisticsResponse {
  elements: ShareStatistic[];
}

interface FollowerCountResponse {
  firstDegreeSize: number;
}

interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

export interface PostStats {
  shares: number;
  clicks: number;
  engagement: number;
  comments: number;
  impressions: number;
  likes: number;
}

export interface UploadRegistration {
  uploadUrl: string;
  asset: string;
  headers: Record<string, string>;
}

export interface RefreshedToken {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...RESTLI_HEADERS,
  };
}

async function linkedinFetch<T>(
  url: string,
  options: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }

    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as Record<string, unknown>).message)
        : `LinkedIn API error: ${response.status} ${response.statusText}`;

    const code =
      typeof body === "object" && body !== null && "serviceErrorCode" in body
        ? String((body as Record<string, unknown>).serviceErrorCode)
        : undefined;

    throw new LinkedInApiError(message, response.status, body, code);
  }

  // Some endpoints (e.g. image upload PUT) return 201 with no body
  const contentType = response.headers.get("content-type") ?? "";
  if (
    response.status === 204 ||
    !contentType.includes("application/json")
  ) {
    return undefined as unknown as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Register an image upload with LinkedIn.
 * Returns the upload URL, asset URN, and any required headers.
 */
async function registerUpload(
  authorUrn: string,
  accessToken: string,
): Promise<UploadRegistration> {
  const body = {
    registerUploadRequest: {
      recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
      owner: authorUrn,
      serviceRelationships: [
        {
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent",
        },
      ],
    },
  };

  const data = await linkedinFetch<RegisterUploadResponse>(
    `${LINKEDIN_API_BASE}/assets?action=registerUpload`,
    {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const mechanism =
    data.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ];

  return {
    uploadUrl: mechanism.uploadUrl,
    asset: data.value.asset,
    headers: mechanism.headers,
  };
}

/**
 * Upload raw image bytes to the URL obtained from registerUpload.
 */
async function uploadImage(
  uploadUrl: string,
  imageBuffer: Buffer | Uint8Array,
  accessToken: string,
): Promise<void> {
  await linkedinFetch<void>(uploadUrl, {
    method: "PUT",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/octet-stream",
    },
    body: imageBuffer as unknown as RequestInit["body"],
  });
}

/**
 * Publish a text-only post via the UGC Post API.
 */
async function createTextPost(
  authorUrn: string,
  text: string,
  accessToken: string,
): Promise<string> {
  const body = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const data = await linkedinFetch<UgcPostResponse>(
    `${LINKEDIN_API_BASE}/ugcPosts`,
    {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  return data.id;
}

/**
 * Publish a post with an image.
 *
 * Flow: registerUpload -> uploadImage -> create UGC post referencing the asset.
 */
async function createImagePost(
  authorUrn: string,
  text: string,
  imageUrl: string,
  accessToken: string,
): Promise<string> {
  // 1. Register the upload to get an upload URL + asset URN
  const registration = await registerUpload(authorUrn, accessToken);

  // 2. Download the image from the provided URL
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new LinkedInApiError(
      `Failed to download image from ${imageUrl}: ${imageResponse.status}`,
      imageResponse.status,
      null,
    );
  }
  const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());

  // 3. Upload the binary to LinkedIn
  await uploadImage(registration.uploadUrl, imageBuffer, accessToken);

  // 4. Create the UGC post referencing the asset
  const body = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "IMAGE",
        media: [
          {
            status: "READY",
            media: registration.asset,
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const data = await linkedinFetch<UgcPostResponse>(
    `${LINKEDIN_API_BASE}/ugcPosts`,
    {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  return data.id;
}

/**
 * Retrieve engagement statistics for a specific post (share).
 *
 * Requires the `rw_organization_admin` scope for organisation posts,
 * or the `r_member_social` scope for member posts.
 */
async function getPostStats(
  postUrn: string,
  accessToken: string,
): Promise<PostStats> {
  const params = new URLSearchParams({
    q: "organizationalEntity",
    "shares[0]": postUrn,
  });

  const data = await linkedinFetch<ShareStatisticsResponse>(
    `${LINKEDIN_API_BASE}/organizationalEntityShareStatistics?${params.toString()}`,
    {
      method: "GET",
      headers: authHeaders(accessToken),
    },
  );

  if (!data.elements.length) {
    return {
      shares: 0,
      clicks: 0,
      engagement: 0,
      comments: 0,
      impressions: 0,
      likes: 0,
    };
  }

  const stats = data.elements[0].totalShareStatistics;

  return {
    shares: stats.shareCount,
    clicks: stats.clickCount,
    engagement: stats.engagement,
    comments: stats.commentCount,
    impressions: stats.impressionCount,
    likes: stats.likeCount,
  };
}

/**
 * Get follower count for an organisation.
 *
 * @param orgUrn – e.g. "urn:li:organization:12345"
 */
async function getFollowerStats(
  orgUrn: string,
  accessToken: string,
): Promise<{ followers: number }> {
  const data = await linkedinFetch<FollowerCountResponse>(
    `${LINKEDIN_API_BASE}/networkSizes/${encodeURIComponent(orgUrn)}?edgeType=CompanyFollowedByMember`,
    {
      method: "GET",
      headers: authHeaders(accessToken),
    },
  );

  return { followers: data.firstDegreeSize };
}

/**
 * Refresh an OAuth 2.0 access token using a refresh token.
 */
async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<RefreshedToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const data = await linkedinFetch<TokenRefreshResponse>(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token,
    refreshTokenExpiresIn: data.refresh_token_expires_in,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const linkedinService = {
  createTextPost,
  createImagePost,
  registerUpload,
  uploadImage,
  getPostStats,
  getFollowerStats,
  refreshAccessToken,
} as const;
