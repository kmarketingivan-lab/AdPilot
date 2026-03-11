import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { linkedinService, LinkedInApiError } = await import(
  "@/server/services/social/linkedin"
);

// ── Helpers ─────────────────────────────────────────────────────────

function ok(body: unknown, contentType = "application/json"): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": contentType }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function errResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    statusText: "Bad Request",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => vi.clearAllMocks());

// ── createTextPost ──────────────────────────────────────────────────

describe("linkedinService.createTextPost", () => {
  it("creates a UGC text post and returns the post URN", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ id: "urn:li:share:12345" }),
    );

    const id = await linkedinService.createTextPost(
      "urn:li:organization:111",
      "Hello LinkedIn!",
      "tok_abc",
    );

    expect(id).toBe("urn:li:share:12345");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/ugcPosts");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.author).toBe("urn:li:organization:111");
    expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory).toBe("NONE");
  });

  it("throws LinkedInApiError on API error", async () => {
    mockFetch.mockResolvedValueOnce(
      errResponse(403, { message: "Insufficient permissions", serviceErrorCode: "100" }),
    );

    await expect(
      linkedinService.createTextPost("urn:li:organization:111", "text", "tok"),
    ).rejects.toThrow(LinkedInApiError);
  });

  it("includes Bearer token and RestLi header", async () => {
    mockFetch.mockResolvedValueOnce(ok({ id: "urn:li:share:99" }));

    await linkedinService.createTextPost("urn:li:organization:1", "hi", "my_token");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer my_token");
    expect(headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
  });
});

// ── registerUpload ──────────────────────────────────────────────────

describe("linkedinService.registerUpload", () => {
  it("returns uploadUrl, asset, and headers from the response", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        value: {
          uploadMechanism: {
            "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
              uploadUrl: "https://api.linkedin.com/upload/1234",
              headers: { "media-type-family": "STILLIMAGE" },
            },
          },
          asset: "urn:li:digitalmediaAsset:ABC123",
          mediaArtifact: "urn:li:digitalmediaMediaArtifact:XYZ",
        },
      }),
    );

    const reg = await linkedinService.registerUpload("urn:li:organization:1", "tok");

    expect(reg.uploadUrl).toBe("https://api.linkedin.com/upload/1234");
    expect(reg.asset).toBe("urn:li:digitalmediaAsset:ABC123");
    expect(reg.headers["media-type-family"]).toBe("STILLIMAGE");
  });
});

// ── getPostStats ────────────────────────────────────────────────────

describe("linkedinService.getPostStats", () => {
  it("returns engagement stats from the response", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        elements: [
          {
            totalShareStatistics: {
              shareCount: 10,
              clickCount: 200,
              engagement: 0.05,
              commentCount: 15,
              impressionCount: 5000,
              likeCount: 300,
            },
          },
        ],
      }),
    );

    const stats = await linkedinService.getPostStats("urn:li:share:555", "tok");

    expect(stats).toEqual({
      shares: 10,
      clicks: 200,
      engagement: 0.05,
      comments: 15,
      impressions: 5000,
      likes: 300,
    });
  });

  it("returns zeroed stats when no elements are returned", async () => {
    mockFetch.mockResolvedValueOnce(ok({ elements: [] }));

    const stats = await linkedinService.getPostStats("urn:li:share:404", "tok");

    expect(stats).toEqual({
      shares: 0,
      clicks: 0,
      engagement: 0,
      comments: 0,
      impressions: 0,
      likes: 0,
    });
  });
});

// ── refreshAccessToken ──────────────────────────────────────────────

describe("linkedinService.refreshAccessToken", () => {
  it("returns normalized token data", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        access_token: "new_tok",
        expires_in: 7200,
        refresh_token: "new_refresh",
        refresh_token_expires_in: 15552000,
      }),
    );

    const result = await linkedinService.refreshAccessToken(
      "old_refresh",
      "client_id",
      "client_secret",
    );

    expect(result).toEqual({
      accessToken: "new_tok",
      expiresIn: 7200,
      refreshToken: "new_refresh",
      refreshTokenExpiresIn: 15552000,
    });
  });

  it("sends the correct form body", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ access_token: "t", expires_in: 100 }),
    );

    await linkedinService.refreshAccessToken("ref", "cid", "csec");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://www.linkedin.com/oauth/v2/accessToken");
    expect(opts.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });
});
