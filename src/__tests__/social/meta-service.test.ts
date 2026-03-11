import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch before importing the module
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Dynamic import to ensure fetch is mocked first
const { metaService, MetaApiError } = await import(
  "@/server/services/social/meta"
);

// ── Helpers ─────────────────────────────────────────────────────────

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function err(status: number, error: Record<string, unknown>): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  } as unknown as Response;
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("metaService.createMediaContainer", () => {
  it("creates an IG media container and returns the id", async () => {
    mockFetch.mockResolvedValueOnce(ok({ id: "container_123" }));

    const result = await metaService.createMediaContainer(
      "ig_user_1",
      "https://example.com/photo.jpg",
      "Hello world",
      "tok_abc",
    );

    expect(result).toEqual({ id: "container_123" });
    expect(mockFetch).toHaveBeenCalledOnce();

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toContain("/ig_user_1/media");
    expect(calledUrl.searchParams.get("image_url")).toBe(
      "https://example.com/photo.jpg",
    );
    expect(calledUrl.searchParams.get("access_token")).toBe("tok_abc");
  });

  it("throws MetaApiError on API error response", async () => {
    mockFetch.mockResolvedValueOnce(
      err(400, { message: "Invalid image", type: "OAuthException", code: 100 }),
    );

    await expect(
      metaService.createMediaContainer("ig_user_1", "bad_url", "cap", "tok"),
    ).rejects.toThrow(MetaApiError);
  });

  it("throws a generic MetaApiError when no error payload is present", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    await expect(
      metaService.createMediaContainer("ig_user_1", "url", "cap", "tok"),
    ).rejects.toThrow("Meta API request failed with status 500");
  });
});

describe("metaService.publishMedia", () => {
  it("publishes a media container and returns the media id", async () => {
    mockFetch.mockResolvedValueOnce(ok({ id: "media_456" }));

    const result = await metaService.publishMedia(
      "ig_user_1",
      "container_123",
      "tok_abc",
    );

    expect(result).toEqual({ id: "media_456" });
    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toContain("/ig_user_1/media_publish");
    expect(calledUrl.searchParams.get("creation_id")).toBe("container_123");
  });
});

describe("metaService.publishCarousel", () => {
  it("throws when fewer than 2 containers are provided", async () => {
    await expect(
      metaService.publishCarousel("ig_1", ["only_one"], "caption", "tok"),
    ).rejects.toThrow("between 2 and 10");
  });

  it("throws when more than 10 containers are provided", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `c_${i}`);
    await expect(
      metaService.publishCarousel("ig_1", ids, "caption", "tok"),
    ).rejects.toThrow("between 2 and 10");
  });

  it("creates a carousel container then publishes it", async () => {
    // First call: create carousel container
    mockFetch.mockResolvedValueOnce(ok({ id: "carousel_container_1" }));
    // Second call: publish
    mockFetch.mockResolvedValueOnce(ok({ id: "carousel_media_1" }));

    const result = await metaService.publishCarousel(
      "ig_1",
      ["child_1", "child_2"],
      "My carousel",
      "tok",
    );

    expect(result).toEqual({ id: "carousel_media_1" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("metaService.publishFacebookPost", () => {
  it("posts a text-only update to a page feed", async () => {
    mockFetch.mockResolvedValueOnce(ok({ id: "page_1_post_1" }));

    const result = await metaService.publishFacebookPost(
      "page_1",
      "Hello Facebook",
      "tok",
    );

    expect(result).toEqual({ id: "page_1_post_1" });
    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toContain("/page_1/feed");
  });

  it("posts a photo update when imageUrl is provided", async () => {
    mockFetch.mockResolvedValueOnce(ok({ id: "page_1_photo_1" }));

    const result = await metaService.publishFacebookPost(
      "page_1",
      "Photo post",
      "tok",
      "https://example.com/img.jpg",
    );

    expect(result).toEqual({ id: "page_1_photo_1" });
    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toContain("/page_1/photos");
  });
});

describe("metaService.exchangeShortLivedToken", () => {
  it("exchanges a token when env vars are set", async () => {
    process.env.META_APP_ID = "app_123";
    process.env.META_APP_SECRET = "secret_456";

    mockFetch.mockResolvedValueOnce(
      ok({
        access_token: "long_lived_tok",
        token_type: "bearer",
        expires_in: 5184000,
      }),
    );

    const result = await metaService.exchangeShortLivedToken("short_tok");

    expect(result.access_token).toBe("long_lived_tok");
    expect(result.expires_in).toBe(5184000);

    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  it("throws when META_APP_ID is not set", async () => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;

    await expect(
      metaService.exchangeShortLivedToken("short_tok"),
    ).rejects.toThrow("META_APP_ID and META_APP_SECRET");
  });
});

describe("MetaApiError", () => {
  it("detects expired tokens via code 190", () => {
    const error = new MetaApiError({
      message: "Token expired",
      type: "OAuthException",
      code: 190,
    });
    expect(error.isTokenExpired).toBe(true);
    expect(error.isRateLimited).toBe(false);
  });

  it("detects rate limiting via code 4 or 32", () => {
    const err4 = new MetaApiError({
      message: "Rate limited",
      type: "OAuthException",
      code: 4,
    });
    expect(err4.isRateLimited).toBe(true);

    const err32 = new MetaApiError({
      message: "Rate limited",
      type: "OAuthException",
      code: 32,
    });
    expect(err32.isRateLimited).toBe(true);
  });

  it("detects permission errors via code 10 or 200", () => {
    const error = new MetaApiError({
      message: "Permission denied",
      type: "OAuthException",
      code: 200,
    });
    expect(error.isPermissionError).toBe(true);
  });
});
