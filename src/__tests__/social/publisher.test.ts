import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Platform, PostStatus } from "@prisma/client";

// ── Mock dependencies ───────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    post: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    postPlatform: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn((v: string) => `decrypted_${v}`),
}));

vi.mock("@/server/services/media/cloudinary", () => ({
  getResizedUrl: vi.fn((publicId: string, _preset: string) => `https://cdn.example.com/${publicId}`),
}));

vi.mock("@/server/services/social/meta", () => ({
  metaService: {
    createMediaContainer: vi.fn().mockResolvedValue({ id: "container_1" }),
    publishMedia: vi.fn().mockResolvedValue({ id: "ig_media_1" }),
    publishCarousel: vi.fn().mockResolvedValue({ id: "ig_carousel_1" }),
    publishFacebookPost: vi.fn().mockResolvedValue({ id: "fb_post_1" }),
  },
}));

vi.mock("@/server/services/social/linkedin", () => ({
  linkedinService: {
    createTextPost: vi.fn().mockResolvedValue("urn:li:share:123"),
    createImagePost: vi.fn().mockResolvedValue("urn:li:share:456"),
  },
}));

vi.mock("@/server/services/social/twitter", () => ({
  twitterService: {
    createTweet: vi.fn().mockResolvedValue({ id: "tweet_1", text: "test" }),
    uploadMedia: vi.fn().mockResolvedValue({ media_id: 1, media_id_string: "1" }),
  },
}));

vi.mock("@/server/services/social/notifications", () => ({
  notifyPublishSuccess: vi.fn().mockResolvedValue(undefined),
  notifyPublishFailure: vi.fn().mockResolvedValue(undefined),
}));

// Mock fetch for Twitter media download
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { publishPost } = await import("@/server/services/social/publisher");
const { prisma } = await import("@/lib/prisma");
const { metaService } = await import("@/server/services/social/meta");

// ── Helpers ─────────────────────────────────────────────────────────

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: "post_1",
    content: "Hello world",
    hashtags: ["marketing", "ads"],
    status: "APPROVED" as PostStatus,
    platforms: [
      {
        id: "pp_1",
        platform: "FACEBOOK" as Platform,
        socialAccount: {
          id: "sa_1",
          accessToken: "enc_tok_fb",
          accountId: "fb_page_1",
        },
      },
    ],
    mediaFiles: [],
    workspace: {
      id: "ws_1",
      members: [
        {
          user: { email: "test@example.com", name: "Test User" },
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── publishPost ─────────────────────────────────────────────────────

describe("publishPost", () => {
  it("throws when post is not found", async () => {
    (prisma.post.findUnique as any).mockResolvedValueOnce(null);

    await expect(publishPost("missing_id")).rejects.toThrow("Post not found");
  });

  it("throws when post has no target platforms", async () => {
    (prisma.post.findUnique as any).mockResolvedValueOnce(
      makePost({ platforms: [] }),
    );

    await expect(publishPost("post_1")).rejects.toThrow("no target platforms");
  });

  it("skips publishing when post is not in a publishable state", async () => {
    (prisma.post.findUnique as any).mockResolvedValueOnce(
      makePost({ status: "DRAFT" }),
    );

    // Should return without throwing
    await publishPost("post_1");

    // Status should NOT have been changed to PUBLISHING
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it("publishes to Facebook and sets status to PUBLISHED", async () => {
    (prisma.post.findUnique as any).mockResolvedValueOnce(makePost());

    await publishPost("post_1");

    // Should set status to PUBLISHING first
    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PUBLISHING" }),
      }),
    );

    // Then set to PUBLISHED
    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PUBLISHED" }),
      }),
    );

    // PostPlatform should be updated
    expect(prisma.postPlatform.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PUBLISHED",
          externalPostId: "fb_post_1",
        }),
      }),
    );
  });

  it("publishes to Instagram with single image", async () => {
    const post = makePost({
      platforms: [
        {
          id: "pp_ig",
          platform: "INSTAGRAM" as Platform,
          socialAccount: {
            id: "sa_ig",
            accessToken: "enc_tok_ig",
            accountId: "ig_user_1",
          },
        },
      ],
      mediaFiles: [
        { media: { publicId: "img_1" }, sortOrder: 0 },
      ],
    });
    (prisma.post.findUnique as any).mockResolvedValueOnce(post);

    await publishPost("post_1");

    expect(metaService.createMediaContainer).toHaveBeenCalled();
    expect(metaService.publishMedia).toHaveBeenCalled();
  });

  it("throws when all platforms fail", async () => {
    const { metaService: meta } = await import("@/server/services/social/meta");
    (meta.publishFacebookPost as any).mockRejectedValueOnce(new Error("FB API down"));

    (prisma.post.findUnique as any).mockResolvedValueOnce(makePost());

    await expect(publishPost("post_1")).rejects.toThrow("All platforms failed");
  });

  it("publishes to multiple platforms and handles partial failure", async () => {
    const { metaService: meta } = await import("@/server/services/social/meta");
    const { linkedinService: li } = await import("@/server/services/social/linkedin");

    // FB succeeds, LinkedIn fails
    (meta.publishFacebookPost as any).mockResolvedValueOnce({ id: "fb_post_2" });
    (li.createTextPost as any).mockRejectedValueOnce(new Error("LinkedIn 500"));

    const post = makePost({
      platforms: [
        {
          id: "pp_fb",
          platform: "FACEBOOK" as Platform,
          socialAccount: { id: "sa_fb", accessToken: "tok_fb", accountId: "fb_1" },
        },
        {
          id: "pp_li",
          platform: "LINKEDIN" as Platform,
          socialAccount: { id: "sa_li", accessToken: "tok_li", accountId: "li_1" },
        },
      ],
    });
    (prisma.post.findUnique as any).mockResolvedValueOnce(post);

    // Partial failure should NOT throw (only all-failed throws)
    await publishPost("post_1");

    // Post should be marked FAILED since at least one platform failed
    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });
});
