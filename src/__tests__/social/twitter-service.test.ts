import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { twitterService, TwitterApiError } = await import(
  "@/server/services/social/twitter"
);

// ── Helpers ─────────────────────────────────────────────────────────

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function errResp(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => vi.clearAllMocks());

// ── createTweet ─────────────────────────────────────────────────────

describe("twitterService.createTweet", () => {
  it("creates a text tweet and returns the tweet data", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ data: { id: "tweet_1", text: "Hello world" } }),
    );

    const tweet = await twitterService.createTweet("tok", "Hello world");

    expect(tweet).toEqual({ id: "tweet_1", text: "Hello world" });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/2/tweets");
    expect(opts.method).toBe("POST");
  });

  it("includes media_ids when provided", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ data: { id: "tweet_2", text: "With media" } }),
    );

    await twitterService.createTweet("tok", "With media", ["media_1"]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.media).toEqual({ media_ids: ["media_1"] });
  });

  it("throws TwitterApiError on v2 error", async () => {
    mockFetch.mockResolvedValueOnce(
      errResp(403, { detail: "Forbidden: not allowed", type: "about:blank" }),
    );

    await expect(
      twitterService.createTweet("tok", "text"),
    ).rejects.toThrow(TwitterApiError);
  });

  it("throws TwitterApiError on v1.1 error shape", async () => {
    mockFetch.mockResolvedValueOnce(
      errResp(401, { errors: [{ message: "Invalid token", code: 89 }] }),
    );

    const err = await twitterService
      .createTweet("bad_tok", "text")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TwitterApiError);
    expect((err as TwitterApiError).message).toBe("Invalid token");
    expect((err as TwitterApiError).code).toBe("89");
  });
});

// ── deleteTweet ─────────────────────────────────────────────────────

describe("twitterService.deleteTweet", () => {
  it("returns true when the tweet is deleted", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ data: { deleted: true } }),
    );

    const result = await twitterService.deleteTweet("tok", "tweet_1");
    expect(result).toBe(true);
  });
});

// ── createThread ────────────────────────────────────────────────────

describe("twitterService.createThread", () => {
  it("throws when the thread is empty", async () => {
    await expect(
      twitterService.createThread("tok", []),
    ).rejects.toThrow("at least one tweet");
  });

  it("chains tweets using reply_to_tweet_id", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ data: { id: "t1", text: "First" } }))
      .mockResolvedValueOnce(ok({ data: { id: "t2", text: "Second" } }));

    const results = await twitterService.createThread("tok", [
      { text: "First" },
      { text: "Second" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("t1");
    expect(results[1].id).toBe("t2");

    // Second tweet should be a reply to the first
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondBody.reply).toEqual({ in_reply_to_tweet_id: "t1" });
  });
});

// ── uploadMedia ─────────────────────────────────────────────────────

describe("twitterService.uploadMedia", () => {
  it("performs INIT, APPEND, and FINALIZE sequence", async () => {
    const smallBuffer = Buffer.alloc(100);

    // INIT response
    mockFetch.mockResolvedValueOnce(
      ok({ media_id: 123, media_id_string: "123" }),
    );
    // APPEND response (204 no body)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
    } as unknown as Response);
    // FINALIZE response
    mockFetch.mockResolvedValueOnce(
      ok({ media_id: 123, media_id_string: "123", expires_after_secs: 86400 }),
    );

    const result = await twitterService.uploadMedia("tok", smallBuffer, "image/jpeg");

    expect(result.media_id_string).toBe("123");
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify INIT
    const initUrl = mockFetch.mock.calls[0][0];
    expect(initUrl).toContain("command=INIT");

    // Verify FINALIZE
    const finalizeUrl = mockFetch.mock.calls[2][0];
    expect(finalizeUrl).toContain("command=FINALIZE");
  });
});

// ── getTweetMetrics ─────────────────────────────────────────────────

describe("twitterService.getTweetMetrics", () => {
  it("returns tweet with public_metrics", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        data: {
          id: "tweet_1",
          text: "Hello",
          public_metrics: {
            retweet_count: 5,
            reply_count: 2,
            like_count: 10,
            quote_count: 1,
            bookmark_count: 3,
            impression_count: 500,
          },
        },
      }),
    );

    const metrics = await twitterService.getTweetMetrics("tok", "tweet_1");

    expect(metrics.public_metrics.like_count).toBe(10);
    expect(metrics.public_metrics.impression_count).toBe(500);
  });
});

// ── refreshAccessToken ──────────────────────────────────────────────

describe("twitterService.refreshAccessToken", () => {
  it("returns new token data", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        access_token: "new_tok",
        refresh_token: "new_ref",
        expires_in: 7200,
        token_type: "bearer",
        scope: "tweet.read tweet.write",
      }),
    );

    const result = await twitterService.refreshAccessToken("old_ref", "cid");

    expect(result.access_token).toBe("new_tok");
    expect(result.expires_in).toBe(7200);
  });
});
