const TIKTOK_API_BASE = "https://open.tiktokapis.com";

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export class TikTokApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
    public readonly logId?: string,
  ) {
    super(message);
    this.name = "TikTokApiError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TikTokBaseResponse {
  error: {
    code: string;
    message: string;
    log_id: string;
  };
}

/** Info required to initialise a video upload via the inbox (direct-post) flow. */
export interface VideoUploadInfo {
  /** Total byte size of the video file. */
  video_size: number;
  /** Number of chunks (min 1, max 64). */
  chunk_total: number;
  /** Source of the video. "FILE_UPLOAD" | "PULL_FROM_URL". */
  source: "FILE_UPLOAD" | "PULL_FROM_URL";
  /** If source is PULL_FROM_URL, provide the URL here. */
  video_url?: string;
}

export interface VideoUploadInitResponse {
  publish_id: string;
  upload_url: string;
}

/** Info required to publish a video that has already been uploaded. */
export interface VideoPublishInfo {
  /** The publish_id obtained from initVideoUpload. */
  publish_id: string;
  /** Post title / caption (max 2200 chars). */
  title: string;
  /** Privacy level: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY". */
  privacy_level: string;
  /** Whether to disable comments. */
  disable_comment?: boolean;
  /** Whether to disable duet. */
  disable_duet?: boolean;
  /** Whether to disable stitch. */
  disable_stitch?: boolean;
  /** Content disclosure: whether the video promotes a brand. */
  brand_content_toggle?: boolean;
  /** Content disclosure: whether the video is organic (not paid). */
  brand_organic_toggle?: boolean;
}

export interface PublishStatusResponse {
  status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "PUBLISH_COMPLETE" | "FAILED";
  /** The TikTok video id once published. */
  publicaly_available_post_id?: string[];
  /** Failure reason when status === "FAILED". */
  fail_reason?: string;
}

export interface VideoMetrics {
  id: string;
  title: string;
  create_time: number;
  cover_image_url: string;
  video_description: string;
  duration: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function tiktokFetch<T>(
  url: string,
  options: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    let body: TikTokBaseResponse | undefined;
    try {
      body = (await response.json()) as TikTokBaseResponse;
    } catch {
      // response may not be JSON
    }

    throw new TikTokApiError(
      body?.error?.message ?? `TikTok API error: ${response.status} ${response.statusText}`,
      response.status,
      body?.error?.code,
      body?.error?.log_id,
    );
  }

  // Some endpoints (e.g. chunk upload PUT) return 200 with empty body.
  const text = await response.text();
  if (!text) return {} as T;

  const json = JSON.parse(text) as TikTokBaseResponse & { data: T };

  if (json.error?.code && json.error.code !== "ok") {
    throw new TikTokApiError(
      json.error.message,
      response.status,
      json.error.code,
      json.error.log_id,
    );
  }

  return json.data;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/**
 * Initialise a video upload through the inbox (direct-post) flow.
 *
 * @see https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 */
async function initVideoUpload(
  accessToken: string,
  videoInfo: VideoUploadInfo,
): Promise<VideoUploadInitResponse> {
  return tiktokFetch<VideoUploadInitResponse>(
    `${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        source_info: {
          source: videoInfo.source,
          video_size: videoInfo.video_size,
          chunk_size: Math.ceil(videoInfo.video_size / videoInfo.chunk_total),
          total_chunk_count: videoInfo.chunk_total,
          ...(videoInfo.video_url && { video_url: videoInfo.video_url }),
        },
      }),
    },
  );
}

/**
 * Upload a single binary chunk of video data to the TikTok upload URL.
 *
 * The upload URL is obtained from `initVideoUpload`.
 */
async function uploadVideoChunk(
  uploadUrl: string,
  chunk: Buffer | ArrayBuffer,
  chunkIndex: number,
  totalChunks: number,
  totalFileSize: number,
): Promise<void> {
  const chunkSize = chunk instanceof ArrayBuffer ? chunk.byteLength : (chunk as Buffer).length;
  const startByte = chunkIndex * chunkSize;
  const endByte = startByte + chunkSize - 1;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes ${startByte}-${endByte}/${totalFileSize}`,
      "Content-Length": String(chunkSize),
    },
    body: chunk as unknown as BodyInit,
  });

  if (!response.ok) {
    throw new TikTokApiError(
      `Video chunk upload failed: ${response.status} ${response.statusText}`,
      response.status,
    );
  }
}

/**
 * Publish a previously uploaded video.
 *
 * @see https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 */
async function publishVideo(
  accessToken: string,
  publishInfo: VideoPublishInfo,
): Promise<{ publish_id: string }> {
  return tiktokFetch<{ publish_id: string }>(
    `${TIKTOK_API_BASE}/v2/post/publish/`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        post_info: {
          title: publishInfo.title,
          privacy_level: publishInfo.privacy_level,
          disable_comment: publishInfo.disable_comment ?? false,
          disable_duet: publishInfo.disable_duet ?? false,
          disable_stitch: publishInfo.disable_stitch ?? false,
          brand_content_toggle: publishInfo.brand_content_toggle ?? false,
          brand_organic_toggle: publishInfo.brand_organic_toggle ?? false,
        },
        source_info: {
          publish_id: publishInfo.publish_id,
          source: "FILE_UPLOAD",
        },
      }),
    },
  );
}

/**
 * Poll the publish status of a video.
 *
 * @see https://developers.tiktok.com/doc/content-posting-api-get-status
 */
async function getPublishStatus(
  accessToken: string,
  publishId: string,
): Promise<PublishStatusResponse> {
  return tiktokFetch<PublishStatusResponse>(
    `${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ publish_id: publishId }),
    },
  );
}

/**
 * Publish one or more photos as a carousel / photo post.
 *
 * @see https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 */
async function publishPhotos(
  accessToken: string,
  photoUrls: string[],
  caption: string,
  privacyLevel = "PUBLIC_TO_EVERYONE",
): Promise<{ publish_id: string }> {
  return tiktokFetch<{ publish_id: string }>(
    `${TIKTOK_API_BASE}/v2/post/publish/content/init/`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: privacyLevel,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: 0,
          photo_images: photoUrls,
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      }),
    },
  );
}

/**
 * Retrieve video-level metrics (views, likes, comments, shares).
 *
 * @see https://developers.tiktok.com/doc/research-api-specs-query-videos
 */
async function getVideoMetrics(
  accessToken: string,
  videoId: string,
): Promise<VideoMetrics> {
  const data = await tiktokFetch<{ videos: VideoMetrics[] }>(
    `${TIKTOK_API_BASE}/v2/video/query/`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        filters: {
          video_ids: [videoId],
        },
        fields: [
          "id",
          "title",
          "create_time",
          "cover_image_url",
          "video_description",
          "duration",
          "like_count",
          "comment_count",
          "share_count",
          "view_count",
        ],
      }),
    },
  );

  const video = data.videos?.[0];
  if (!video) {
    throw new TikTokApiError(
      `Video not found: ${videoId}`,
      404,
      "VIDEO_NOT_FOUND",
    );
  }

  return video;
}

/**
 * Refresh an expired access token using a refresh token.
 *
 * @see https://developers.tiktok.com/doc/oauth-api-reference
 */
async function refreshAccessToken(
  refreshToken: string,
  clientKey: string,
  clientSecret: string,
): Promise<TokenResponse> {
  return tiktokFetch<TokenResponse>(
    `${TIKTOK_API_BASE}/v2/oauth/token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );
}

// ---------------------------------------------------------------------------
// Exported service object
// ---------------------------------------------------------------------------

export const tiktokService = {
  // Video publishing
  initVideoUpload,
  uploadVideoChunk,
  publishVideo,
  getPublishStatus,

  // Photo publishing
  publishPhotos,

  // Analytics
  getVideoMetrics,

  // OAuth
  refreshAccessToken,
} as const;
