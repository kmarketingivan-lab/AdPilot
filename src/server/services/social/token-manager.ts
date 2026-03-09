import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import type { SocialAccount, Platform } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenExpiryStatus {
  isExpired: boolean;
  expiresIn: number | null; // seconds until expiry, null if no expiry set
  needsRefresh: boolean;
}

interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number; // seconds
}

// 24 hours in milliseconds — threshold for proactive refresh
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Token Expiry Check
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a social account's token is expired or close to expiring.
 * `needsRefresh` is true when the token expires within 24 hours.
 */
export function checkTokenExpiry(account: SocialAccount): TokenExpiryStatus {
  if (!account.tokenExpiresAt) {
    return { isExpired: false, expiresIn: null, needsRefresh: false };
  }

  const now = Date.now();
  const expiresAtMs = account.tokenExpiresAt.getTime();
  const diffMs = expiresAtMs - now;
  const expiresIn = Math.max(0, Math.floor(diffMs / 1000));

  return {
    isExpired: diffMs <= 0,
    expiresIn,
    needsRefresh: diffMs <= REFRESH_THRESHOLD_MS,
  };
}

// ---------------------------------------------------------------------------
// Decrypt helper
// ---------------------------------------------------------------------------

/** Decrypt the stored access token. */
export function getDecryptedToken(account: SocialAccount): string {
  return decrypt(account.accessToken);
}

// ---------------------------------------------------------------------------
// Encrypt & Save
// ---------------------------------------------------------------------------

/**
 * Encrypt tokens and persist them to the database.
 */
export async function encryptAndSave(
  accountId: string,
  accessToken: string,
  refreshToken?: string | null,
  expiresAt?: Date | null,
): Promise<void> {
  const data: Record<string, unknown> = {
    accessToken: encrypt(accessToken),
  };

  if (refreshToken !== undefined && refreshToken !== null) {
    data.refreshToken = encrypt(refreshToken);
  }

  if (expiresAt !== undefined) {
    data.tokenExpiresAt = expiresAt;
  }

  await prisma.socialAccount.update({
    where: { id: accountId },
    data,
  });
}

// ---------------------------------------------------------------------------
// Platform-specific refresh logic (uses fetch directly)
// ---------------------------------------------------------------------------

async function refreshMetaToken(account: SocialAccount): Promise<TokenRefreshResult> {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("META_APP_ID and META_APP_SECRET must be set");
  }

  const currentToken = getDecryptedToken(account);
  const url = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("fb_exchange_token", currentToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta token refresh failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in?: number;
  };

  return {
    accessToken: json.access_token,
    // Meta long-lived tokens default to 60 days if expires_in is absent
    expiresIn: json.expires_in ?? 60 * 24 * 60 * 60,
  };
}

async function refreshLinkedInToken(account: SocialAccount): Promise<TokenRefreshResult> {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be set");
  }

  if (!account.refreshToken) {
    throw new Error("LinkedIn account has no refresh token");
  }

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(account.refreshToken),
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn token refresh failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

async function refreshTwitterToken(account: SocialAccount): Promise<TokenRefreshResult> {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET must be set");
  }

  if (!account.refreshToken) {
    throw new Error("Twitter account has no refresh token");
  }

  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(account.refreshToken),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter token refresh failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

async function refreshTikTokToken(account: SocialAccount): Promise<TokenRefreshResult> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error("TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET must be set");
  }

  if (!account.refreshToken) {
    throw new Error("TikTok account has no refresh token");
  }

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: decrypt(account.refreshToken),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TikTok token refresh failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

// ---------------------------------------------------------------------------
// Refresh dispatcher
// ---------------------------------------------------------------------------

const REFRESHABLE_PLATFORMS: Platform[] = ["FACEBOOK", "INSTAGRAM", "LINKEDIN", "TWITTER", "TIKTOK"];

/**
 * Refresh a single account's token using the appropriate platform endpoint.
 * Encrypts the new tokens and saves them to the database.
 */
export async function refreshToken(account: SocialAccount): Promise<void> {
  let result: TokenRefreshResult;

  switch (account.platform) {
    case "FACEBOOK":
    case "INSTAGRAM":
      result = await refreshMetaToken(account);
      break;
    case "LINKEDIN":
      result = await refreshLinkedInToken(account);
      break;
    case "TWITTER":
      result = await refreshTwitterToken(account);
      break;
    case "TIKTOK":
      result = await refreshTikTokToken(account);
      break;
    default:
      throw new Error(`Token refresh not supported for platform: ${account.platform}`);
  }

  const expiresAt = new Date(Date.now() + result.expiresIn * 1000);

  await encryptAndSave(
    account.id,
    result.accessToken,
    result.refreshToken,
    expiresAt,
  );
}

// ---------------------------------------------------------------------------
// Bulk refresh
// ---------------------------------------------------------------------------

/**
 * Find all social accounts whose tokens expire within 24 hours and refresh
 * them. Returns a summary of successes and failures.
 */
export async function refreshAllExpiring(): Promise<{
  refreshed: number;
  failed: { accountId: string; platform: Platform; error: string }[];
}> {
  const threshold = new Date(Date.now() + REFRESH_THRESHOLD_MS);

  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: { in: REFRESHABLE_PLATFORMS },
      tokenExpiresAt: { lte: threshold },
    },
  });

  let refreshed = 0;
  const failed: { accountId: string; platform: Platform; error: string }[] = [];

  for (const account of accounts) {
    try {
      await refreshToken(account);
      refreshed++;
      console.log(
        `[token-manager] Refreshed token for ${account.platform} account ${account.accountId}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[token-manager] Failed to refresh ${account.platform} account ${account.accountId}: ${message}`,
      );
      failed.push({
        accountId: account.id,
        platform: account.platform,
        error: message,
      });
    }
  }

  return { refreshed, failed };
}
