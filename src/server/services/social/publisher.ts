/**
 * Social Publishing Orchestrator
 *
 * Coordinates publishing a post to multiple social platforms, managing media
 * resizing via Cloudinary, status updates in the database, and email
 * notifications on completion.
 *
 * Retry logic is handled by BullMQ (3 attempts, exponential backoff) so this
 * module focuses on a single idempotent execution per attempt.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { getResizedUrl, type PresetName } from "../media/cloudinary";
import { metaService } from "./meta";
import { linkedinService } from "./linkedin";
import { twitterService } from "./twitter";
import {
  notifyPublishSuccess,
  notifyPublishFailure,
} from "./notifications";
import type { Platform, PostStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────

interface PublishResult {
  platform: Platform;
  success: boolean;
  externalPostId?: string;
  error?: string;
}

/** The Prisma Post with all relations needed for publishing. */
type PostWithRelations = NonNullable<Awaited<ReturnType<typeof fetchPostForPublishing>>>;
type PostPlatformEntry = PostWithRelations["platforms"][number];

// ─── Platform Media Presets ──────────────────────────────────────

const PLATFORM_IMAGE_PRESETS: Record<Platform, PresetName> = {
  FACEBOOK: "facebook_post",
  INSTAGRAM: "instagram_square",
  LINKEDIN: "linkedin_post",
  TWITTER: "twitter_post",
  TIKTOK: "tiktok_cover",
  YOUTUBE: "thumbnail",
};

// ─── Database Helpers ────────────────────────────────────────────

async function fetchPostForPublishing(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      platforms: {
        include: {
          socialAccount: true,
        },
      },
      mediaFiles: {
        include: {
          media: true,
        },
        orderBy: { sortOrder: "asc" },
      },
      workspace: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

async function setPostStatus(postId: string, status: PostStatus, extra?: { publishedAt?: Date }) {
  await prisma.post.update({
    where: { id: postId },
    data: {
      status,
      ...extra,
    },
  });
}

async function setPlatformResult(
  platformEntryId: string,
  result: { status: PostStatus; externalPostId?: string; error?: string },
) {
  await prisma.postPlatform.update({
    where: { id: platformEntryId },
    data: {
      status: result.status,
      externalPostId: result.externalPostId ?? undefined,
      error: result.error ?? null,
    },
  });
}

// ─── Media Helpers ───────────────────────────────────────────────

/**
 * Build resized Cloudinary URLs for each media file attached to the post,
 * using the appropriate preset for the target platform.
 */
function getMediaUrlsForPlatform(
  post: PostWithRelations,
  platform: Platform,
): string[] {
  const preset = PLATFORM_IMAGE_PRESETS[platform];

  return post.mediaFiles
    .filter((pm) => pm.media.publicId != null)
    .map((pm) => getResizedUrl(pm.media.publicId!, preset));
}

/**
 * Build the full caption by appending hashtags to the content.
 */
function buildCaption(content: string, hashtags: string[]): string {
  if (hashtags.length === 0) return content;
  const hashtagStr = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return `${content}\n\n${hashtagStr}`;
}

// ─── Platform Dispatch ───────────────────────────────────────────

/**
 * Route a publish request to the correct platform-specific service.
 *
 * Each platform service is expected to return the external post ID on success
 * or throw on failure. Services that are not yet implemented will throw with
 * a clear "not implemented" message so the retry mechanism can skip them.
 */
async function publishToPlatform(
  platform: Platform,
  content: string,
  hashtags: string[],
  mediaUrls: string[],
  accessToken: string,
  accountId: string,
): Promise<string> {
  const caption = buildCaption(content, hashtags);

  switch (platform) {
    case "INSTAGRAM": {
      // Instagram requires at least one image
      if (mediaUrls.length === 0) {
        throw new Error("Instagram requires at least one image to publish");
      }

      if (mediaUrls.length === 1) {
        // Single image flow
        const container = await metaService.createMediaContainer(
          accountId,
          mediaUrls[0],
          caption,
          accessToken,
        );
        const result = await metaService.publishMedia(accountId, container.id, accessToken);
        return result.id;
      }

      // Carousel flow — create individual containers without caption, then carousel
      const childContainerIds: string[] = [];
      for (const url of mediaUrls) {
        const child = await metaService.createMediaContainer(
          accountId,
          url,
          "", // caption goes on the carousel, not individual items
          accessToken,
        );
        childContainerIds.push(child.id);
      }
      const carousel = await metaService.publishCarousel(
        accountId,
        childContainerIds,
        caption,
        accessToken,
      );
      return carousel.id;
    }

    case "FACEBOOK": {
      const result = await metaService.publishFacebookPost(
        accountId,
        caption,
        accessToken,
        mediaUrls[0], // First image if available; undefined for text-only
      );
      return result.id;
    }

    case "LINKEDIN": {
      if (mediaUrls.length > 0) {
        const postUrn = await linkedinService.createImagePost(
          `urn:li:organization:${accountId}`,
          caption,
          mediaUrls[0],
          accessToken,
        );
        return postUrn;
      }
      const postUrn = await linkedinService.createTextPost(
        `urn:li:organization:${accountId}`,
        caption,
        accessToken,
      );
      return postUrn;
    }

    case "TWITTER": {
      // Upload media first if present
      const mediaIds: string[] = [];
      for (const url of mediaUrls) {
        // Download image and upload to Twitter
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to download media from ${url}: ${response.status}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const mimeType = response.headers.get("content-type") ?? "image/jpeg";
        const uploadResult = await twitterService.uploadMedia(accessToken, buffer, mimeType);
        mediaIds.push(uploadResult.media_id_string);
      }

      const tweet = await twitterService.createTweet(
        accessToken,
        caption,
        mediaIds.length > 0 ? mediaIds : undefined,
      );
      return tweet.id;
    }

    case "TIKTOK":
      // TikTok service is being created by another agent
      throw new Error(
        `Publishing to ${platform} is not yet implemented. The TikTok service module is pending.`,
      );

    case "YOUTUBE":
      // YouTube publishing requires video upload — not yet implemented
      throw new Error(
        `Publishing to ${platform} is not yet implemented. The YouTube service module is pending.`,
      );

    default: {
      const _exhaustive: never = platform;
      throw new Error(`Unknown platform: ${_exhaustive}`);
    }
  }
}

// ─── Main Orchestrator ───────────────────────────────────────────

/**
 * Publish a post to all configured platforms.
 *
 * This is the entry point called by the BullMQ worker. It handles:
 * 1. Fetching the post with all relations
 * 2. Setting the post status to PUBLISHING
 * 3. Publishing to each platform in parallel (per-platform isolation)
 * 4. Updating platform-level statuses and errors
 * 5. Setting the final post status (PUBLISHED or FAILED)
 * 6. Sending email notifications
 *
 * Throws only on unrecoverable infrastructure errors (e.g. database down).
 * Platform-level failures are captured per-platform and do not prevent
 * other platforms from being attempted.
 */
export async function publishPost(postId: string): Promise<void> {
  // 1. Fetch the post with all relations
  const post = await fetchPostForPublishing(postId);

  if (!post) {
    throw new Error(`Post not found: ${postId}`);
  }

  if (post.platforms.length === 0) {
    throw new Error(`Post ${postId} has no target platforms configured`);
  }

  // Guard: only publish posts that are in a publishable state
  const publishableStatuses: PostStatus[] = ["APPROVED", "SCHEDULED"];
  if (!publishableStatuses.includes(post.status as PostStatus)) {
    console.warn(
      `[publisher] Post ${postId} is in status "${post.status}", skipping publish`,
    );
    return;
  }

  // 2. Set post status to PUBLISHING
  await setPostStatus(postId, "PUBLISHING");

  // 3. Publish to each platform
  const results: PublishResult[] = await Promise.all(
    post.platforms.map((entry) => publishSinglePlatform(post, entry)),
  );

  // 4. Determine overall outcome
  const allSucceeded = results.every((r) => r.success);
  const allFailed = results.every((r) => !r.success);
  const failures = results.filter((r) => !r.success);

  // 5. Update post status
  if (allSucceeded) {
    await setPostStatus(postId, "PUBLISHED", { publishedAt: new Date() });
  } else {
    // If at least one platform failed, mark the post as FAILED.
    // Partial successes are still tracked at the PostPlatform level.
    await setPostStatus(postId, "FAILED");
  }

  // 6. Send notifications
  try {
    if (allSucceeded) {
      await notifyPublishSuccess(
        {
          id: post.id,
          content: post.content,
          hashtags: post.hashtags,
          publishedAt: new Date(),
          workspace: post.workspace,
        },
        results.map((r) => ({
          platform: r.platform,
          externalPostId: r.externalPostId ?? null,
          status: "PUBLISHED" as PostStatus,
          error: null,
        })),
      );
    } else {
      await notifyPublishFailure(
        {
          id: post.id,
          content: post.content,
          hashtags: post.hashtags,
          publishedAt: null,
          workspace: post.workspace,
        },
        failures.map((f) => ({
          platform: f.platform,
          error: f.error ?? "Unknown error",
        })),
      );
    }
  } catch (notificationError) {
    // Notification failures should never cause the job to fail/retry
    console.error("[publisher] Failed to send notification email:", notificationError);
  }

  // If all platforms failed, throw so BullMQ retries the job.
  // Partial failures are not retried — the successful platforms
  // already published, and retrying would create duplicates.
  if (allFailed) {
    const errorSummary = failures
      .map((f) => `${f.platform}: ${f.error}`)
      .join("; ");
    throw new Error(`All platforms failed for post ${postId}: ${errorSummary}`);
  }
}

/**
 * Publish to a single platform, capturing the result without throwing.
 * This allows parallel execution where one platform's failure does not
 * block the others.
 */
async function publishSinglePlatform(
  post: PostWithRelations,
  entry: PostPlatformEntry,
): Promise<PublishResult> {
  const { platform, socialAccount } = entry;

  try {
    // Decrypt the stored access token
    const accessToken = decrypt(socialAccount.accessToken);

    // Get platform-optimized media URLs
    const mediaUrls = getMediaUrlsForPlatform(post, platform);

    // Publish
    const externalPostId = await publishToPlatform(
      platform,
      post.content,
      post.hashtags,
      mediaUrls,
      accessToken,
      socialAccount.accountId,
    );

    // Update platform entry with success
    await setPlatformResult(entry.id, {
      status: "PUBLISHED",
      externalPostId,
    });

    console.log(
      `[publisher] Published post ${post.id} to ${platform} — externalId: ${externalPostId}`,
    );

    return {
      platform,
      success: true,
      externalPostId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Update platform entry with error
    await setPlatformResult(entry.id, {
      status: "FAILED",
      error: errorMessage,
    });

    console.error(
      `[publisher] Failed to publish post ${post.id} to ${platform}:`,
      errorMessage,
    );

    return {
      platform,
      success: false,
      error: errorMessage,
    };
  }
}
