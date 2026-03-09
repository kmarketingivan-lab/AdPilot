// ---------------------------------------------------------------------------
// Twitter / X  —  Service layer (API v2 + v1.1 media upload)
// ---------------------------------------------------------------------------

const API_BASE = "https://api.twitter.com";
const MEDIA_UPLOAD_URL = `${API_BASE}/1.1/media/upload.json`;
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per APPEND chunk

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class TwitterApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly headers?: Headers,
  ) {
    super(message);
    this.name = "TwitterApiError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TweetData {
  id: string;
  text: string;
  edit_history_tweet_ids?: string[];
}

export interface TweetMetrics {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
  bookmark_count: number;
  impression_count: number;
}

export interface TweetWithMetrics {
  id: string;
  text: string;
  public_metrics: TweetMetrics;
}

export interface MediaUploadResult {
  media_id: number;
  media_id_string: string;
  expires_after_secs?: number;
}

export interface MediaStatusResult {
  media_id: number;
  media_id_string: string;
  processing_info?: {
    state: "pending" | "in_progress" | "succeeded" | "failed";
    check_after_secs?: number;
    progress_percent?: number;
    error?: { code: number; name: string; message: string };
  };
}

export interface ThreadTweet {
  text: string;
  mediaIds?: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    let message = `Twitter API error ${response.status}`;
    let code: string | undefined;

    try {
      const parsed = JSON.parse(body);
      // v2 error shape
      if (parsed.detail) {
        message = parsed.detail;
        code = parsed.type;
      }
      // v1.1 error shape
      if (parsed.errors?.[0]) {
        message = parsed.errors[0].message;
        code = String(parsed.errors[0].code);
      }
    } catch {
      // body wasn't JSON — keep the generic message
    }

    throw new TwitterApiError(message, response.status, code, response.headers);
  }

  // DELETE /2/tweets/:id returns 200 with { data: { deleted: true } }
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Tweet publishing
// ---------------------------------------------------------------------------

async function createTweet(
  accessToken: string,
  text: string,
  mediaIds?: string[],
): Promise<TweetData> {
  const body: Record<string, unknown> = { text };

  if (mediaIds?.length) {
    body.media = { media_ids: mediaIds };
  }

  const res = await fetch(`${API_BASE}/2/tweets`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await handleResponse<{ data: TweetData }>(res);
  return json.data;
}

async function deleteTweet(
  accessToken: string,
  tweetId: string,
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/2/tweets/${tweetId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });

  const json = await handleResponse<{ data: { deleted: boolean } }>(res);
  return json.data.deleted;
}

async function createThread(
  accessToken: string,
  tweets: ThreadTweet[],
): Promise<TweetData[]> {
  if (tweets.length === 0) {
    throw new Error("Thread must contain at least one tweet");
  }

  const results: TweetData[] = [];
  let replyToId: string | undefined;

  for (const tweet of tweets) {
    const body: Record<string, unknown> = { text: tweet.text };

    if (tweet.mediaIds?.length) {
      body.media = { media_ids: tweet.mediaIds };
    }

    if (replyToId) {
      body.reply = { in_reply_to_tweet_id: replyToId };
    }

    const res = await fetch(`${API_BASE}/2/tweets`, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await handleResponse<{ data: TweetData }>(res);
    results.push(json.data);
    replyToId = json.data.id;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Media upload (v1.1 chunked)
// ---------------------------------------------------------------------------

async function uploadMedia(
  accessToken: string,
  mediaBuffer: Buffer,
  mimeType: string,
): Promise<MediaUploadResult> {
  // --- INIT ---
  const initParams = new URLSearchParams({
    command: "INIT",
    total_bytes: String(mediaBuffer.byteLength),
    media_type: mimeType,
  });

  const initRes = await fetch(`${MEDIA_UPLOAD_URL}?${initParams.toString()}`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });

  const initData = await handleResponse<MediaUploadResult>(initRes);
  const mediaId = initData.media_id_string;

  // --- APPEND (chunked) ---
  const totalBytes = mediaBuffer.byteLength;
  let segmentIndex = 0;

  for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, totalBytes);
    const chunk = mediaBuffer.subarray(offset, end);

    const formData = new FormData();
    formData.append("command", "APPEND");
    formData.append("media_id", mediaId);
    formData.append("segment_index", String(segmentIndex));
    formData.append(
      "media_data",
      new Blob([new Uint8Array(chunk)], { type: "application/octet-stream" }),
    );

    const appendRes = await fetch(MEDIA_UPLOAD_URL, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: formData,
    });

    // APPEND returns 204 with no body on success
    if (!appendRes.ok) {
      await handleResponse(appendRes); // will throw
    }

    segmentIndex++;
  }

  // --- FINALIZE ---
  const finalizeParams = new URLSearchParams({
    command: "FINALIZE",
    media_id: mediaId,
  });

  const finalizeRes = await fetch(
    `${MEDIA_UPLOAD_URL}?${finalizeParams.toString()}`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );

  return handleResponse<MediaUploadResult>(finalizeRes);
}

async function checkMediaStatus(
  accessToken: string,
  mediaId: string,
): Promise<MediaStatusResult> {
  const params = new URLSearchParams({
    command: "STATUS",
    media_id: mediaId,
  });

  const res = await fetch(`${MEDIA_UPLOAD_URL}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  return handleResponse<MediaStatusResult>(res);
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

async function getTweetMetrics(
  accessToken: string,
  tweetId: string,
): Promise<TweetWithMetrics> {
  const params = new URLSearchParams({
    "tweet.fields": "public_metrics",
  });

  const res = await fetch(
    `${API_BASE}/2/tweets/${tweetId}?${params.toString()}`,
    {
      method: "GET",
      headers: authHeaders(accessToken),
    },
  );

  const json = await handleResponse<{ data: TweetWithMetrics }>(res);
  return json.data;
}

// ---------------------------------------------------------------------------
// OAuth 2.0 PKCE — token refresh
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const res = await fetch(`${API_BASE}/2/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  return handleResponse<TokenResponse>(res);
}

// ---------------------------------------------------------------------------
// Public service object
// ---------------------------------------------------------------------------

export const twitterService = {
  createTweet,
  deleteTweet,
  createThread,
  uploadMedia,
  checkMediaStatus,
  getTweetMetrics,
  refreshAccessToken,
} as const;
