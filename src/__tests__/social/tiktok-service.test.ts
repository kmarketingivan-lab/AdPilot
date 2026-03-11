import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { tiktokService, TikTokApiError } = await import(
  "@/server/services/social/tiktok"
);

// ── Helpers ─────────────────────────────────────────────────────────

function ok(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: () =>
      Promise.resolve(
        JSON.stringify({ data, error: { code: "ok", message: "", log_id: "" } }),
      ),
  } as unknown as Response;
}

function errResp(status: number, errorCode: string, message: string): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: () =>
      Promise.resolve({
        error: { code: errorCode, message, log_id: "log_1" },
      }),
  } as unknown as Response;
}

beforeEach(() => vi.clearAllMocks());

// ── initVideoUpload ─────────────────────────────────────────────────

describe("tiktokService.initVideoUpload", () => {
  it("returns publish_id and upload_url", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ publish_id: "pub_1", upload_url: "https://upload.tiktok.com/xyz" }),
    );

    const result = await tiktokService.initVideoUpload("tok", {
      video_size: 1024000,
      chunk_total: 1,
      source: "FILE_UPLOAD",
    });

    expect(result.publish_id).toBe("pub_1");
    expect(result.upload_url).toBe("https://upload.tiktok.com/xyz");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/v2/post/publish/inbox/video/init/");
    expect(opts.headers.Authorization).toBe("Bearer tok");
  });

  it("throws TikTokApiError on 401", async () => {
    mockFetch.mockResolvedValueOnce(errResp(401, "invalid_token", "Token expired"));

    await expect(
      tiktokService.initVideoUpload("bad_tok", {
        video_size: 100,
        chunk_total: 1,
        source: "FILE_UPLOAD",
      }),
    ).rejects.toThrow(TikTokApiError);
  });
});

// ── uploadVideoChunk ────────────────────────────────────────────────

describe("tiktokService.uploadVideoChunk", () => {
  it("sends a PUT with correct Content-Range header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    } as unknown as Response);

    const chunk = Buffer.alloc(512);

    await tiktokService.uploadVideoChunk(
      "https://upload.tiktok.com/xyz",
      chunk,
      0,
      1,
      512,
    );

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://upload.tiktok.com/xyz");
    expect(opts.method).toBe("PUT");
    expect(opts.headers["Content-Range"]).toBe("bytes 0-511/512");
  });

  it("throws TikTokApiError on upload failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
    } as unknown as Response);

    await expect(
      tiktokService.uploadVideoChunk("https://upload.tiktok.com/xyz", Buffer.alloc(10), 0, 1, 10),
    ).rejects.toThrow(TikTokApiError);
  });
});

// ── publishVideo ────────────────────────────────────────────────────

describe("tiktokService.publishVideo", () => {
  it("publishes a video and returns publish_id", async () => {
    mockFetch.mockResolvedValueOnce(ok({ publish_id: "pub_2" }));

    const result = await tiktokService.publishVideo("tok", {
      publish_id: "pub_1",
      title: "My video",
      privacy_level: "PUBLIC_TO_EVERYONE",
    });

    expect(result.publish_id).toBe("pub_2");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.post_info.title).toBe("My video");
    expect(body.post_info.privacy_level).toBe("PUBLIC_TO_EVERYONE");
    expect(body.post_info.disable_comment).toBe(false);
  });
});

// ── getPublishStatus ────────────────────────────────────────────────

describe("tiktokService.getPublishStatus", () => {
  it("returns PUBLISH_COMPLETE status", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        status: "PUBLISH_COMPLETE",
        publicaly_available_post_id: ["video_123"],
      }),
    );

    const result = await tiktokService.getPublishStatus("tok", "pub_1");

    expect(result.status).toBe("PUBLISH_COMPLETE");
    expect(result.publicaly_available_post_id).toContain("video_123");
  });

  it("returns FAILED status with reason", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        status: "FAILED",
        fail_reason: "Video too short",
      }),
    );

    const result = await tiktokService.getPublishStatus("tok", "pub_2");

    expect(result.status).toBe("FAILED");
    expect(result.fail_reason).toBe("Video too short");
  });
});

// ── publishPhotos ───────────────────────────────────────────────────

describe("tiktokService.publishPhotos", () => {
  it("publishes photos with URLs and caption", async () => {
    mockFetch.mockResolvedValueOnce(ok({ publish_id: "photo_pub_1" }));

    const result = await tiktokService.publishPhotos(
      "tok",
      ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      "My photos",
    );

    expect(result.publish_id).toBe("photo_pub_1");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.media_type).toBe("PHOTO");
    expect(body.source_info.photo_images).toHaveLength(2);
  });
});

// ── getVideoMetrics ─────────────────────────────────────────────────

describe("tiktokService.getVideoMetrics", () => {
  it("returns video metrics for a valid video", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        videos: [
          {
            id: "v1",
            title: "My vid",
            create_time: 1700000000,
            cover_image_url: "https://example.com/cover.jpg",
            video_description: "desc",
            duration: 30,
            like_count: 100,
            comment_count: 10,
            share_count: 5,
            view_count: 1000,
          },
        ],
      }),
    );

    const metrics = await tiktokService.getVideoMetrics("tok", "v1");

    expect(metrics.like_count).toBe(100);
    expect(metrics.view_count).toBe(1000);
  });

  it("throws when video is not found", async () => {
    mockFetch.mockResolvedValueOnce(ok({ videos: [] }));

    await expect(
      tiktokService.getVideoMetrics("tok", "non_existent"),
    ).rejects.toThrow("Video not found");
  });
});

// ── refreshAccessToken ──────────────────────────────────────────────

describe("tiktokService.refreshAccessToken", () => {
  it("returns new tokens", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        access_token: "new_tok",
        expires_in: 86400,
        refresh_token: "new_ref",
        refresh_expires_in: 15552000,
        open_id: "user_1",
        scope: "video.upload",
        token_type: "bearer",
      }),
    );

    const result = await tiktokService.refreshAccessToken("old_ref", "key", "secret");

    expect(result.access_token).toBe("new_tok");
    expect(result.refresh_token).toBe("new_ref");
  });
});
