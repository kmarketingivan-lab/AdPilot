import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "crypto";
import { publishPost } from "../src/server/services/social/publisher";
import { syncWorkspaceAnalytics } from "../src/server/services/analytics/sync";
import { sendBulkEmail } from "../src/server/services/email/ses-enhanced";
import { generatePdfReport, generateExcelReport } from "../src/server/services/analytics/report-generator";
import { executeDelivery } from "../src/server/services/crm/webhook";
import { evaluateAndSendWinner, type ABTestJobData } from "../src/server/services/email/ab-test";
import { executeNode, type AutomationJobData } from "../src/server/services/email/automation-engine";

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// ---------------------------------------------------------------------------
// Prisma client (standalone — worker runs as a separate process)
// ---------------------------------------------------------------------------

function createPrisma(): PrismaClient {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrisma();

// ---------------------------------------------------------------------------
// Encryption helpers (mirrored from src/lib/encryption.ts)
// ---------------------------------------------------------------------------

const ENC_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is required");
  return Buffer.from(key, "hex");
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ENC_ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(encryptedBase64, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);
  const decipher = createDecipheriv(ENC_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// Platform token refresh helpers
// ---------------------------------------------------------------------------

type Platform = "FACEBOOK" | "INSTAGRAM" | "LINKEDIN" | "TWITTER" | "TIKTOK" | "YOUTUBE";

interface SocialAccountRow {
  id: string;
  platform: Platform;
  accountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

async function refreshMetaToken(account: SocialAccountRow): Promise<TokenRefreshResult> {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  if (!clientId || !clientSecret) throw new Error("META_APP_ID / META_APP_SECRET not set");

  const currentToken = decrypt(account.accessToken);
  const url = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("fb_exchange_token", currentToken);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Meta refresh failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 60 * 24 * 60 * 60 };
}

async function refreshLinkedInToken(account: SocialAccountRow): Promise<TokenRefreshResult> {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET not set");
  if (!account.refreshToken) throw new Error("LinkedIn: no refresh token");

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
  if (!res.ok) throw new Error(`LinkedIn refresh failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
}

async function refreshTwitterToken(account: SocialAccountRow): Promise<TokenRefreshResult> {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET not set");
  if (!account.refreshToken) throw new Error("Twitter: no refresh token");

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
  if (!res.ok) throw new Error(`Twitter refresh failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
}

async function refreshTikTokToken(account: SocialAccountRow): Promise<TokenRefreshResult> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) throw new Error("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set");
  if (!account.refreshToken) throw new Error("TikTok: no refresh token");

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
  if (!res.ok) throw new Error(`TikTok refresh failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
}

async function refreshSingleAccount(account: SocialAccountRow): Promise<void> {
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

  const data: Record<string, unknown> = {
    accessToken: encrypt(result.accessToken),
    tokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000),
  };

  if (result.refreshToken) {
    data.refreshToken = encrypt(result.refreshToken);
  }

  await prisma.socialAccount.update({ where: { id: account.id }, data });
}

/**
 * Find all accounts expiring within 24 hours and refresh them.
 */
async function refreshAllExpiring(): Promise<{ refreshed: number; failed: number }> {
  const REFRESHABLE: Platform[] = ["FACEBOOK", "INSTAGRAM", "LINKEDIN", "TWITTER", "TIKTOK"];
  const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: { in: REFRESHABLE },
      tokenExpiresAt: { lte: threshold },
    },
  });

  console.log(`[token-refresh] Found ${accounts.length} accounts needing refresh`);

  let refreshed = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      await refreshSingleAccount(account as SocialAccountRow);
      refreshed++;
      console.log(`[token-refresh] Refreshed ${account.platform} account ${account.accountId}`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[token-refresh] Failed ${account.platform} account ${account.accountId}: ${msg}`);
    }
  }

  return { refreshed, failed };
}

// Social publish worker
const socialPublishWorker = new Worker(
  "social-publish",
  async (job) => {
    console.log(`[social-publish] Processing job ${job.id}:`, job.data);
    const { postId } = job.data as { postId: string; workspaceId: string };
    await publishPost(postId);
    console.log(`[social-publish] Published post ${postId}`);
  },
  { connection, concurrency: 5, lockDuration: 120000 }
);

// Token refresh worker
const tokenRefreshWorker = new Worker(
  "token-refresh",
  async (job) => {
    console.log(`[token-refresh] Processing job ${job.id}`);
    const { refreshed, failed } = await refreshAllExpiring();
    console.log(`[token-refresh] Done — refreshed: ${refreshed}, failed: ${failed}`);
    return { refreshed, failed };
  },
  { connection, concurrency: 1, lockDuration: 30000 }
);

// Schedule a repeatable token-refresh job every 8 hours
const tokenRefreshQueue = new Queue("token-refresh", {
  connection: new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  }),
});

(async () => {
  await tokenRefreshQueue.upsertJobScheduler(
    "token-refresh-recurring",
    { every: 8 * 60 * 60 * 1000 }, // 8 hours in ms
    { data: { trigger: "scheduled" } },
  );
  console.log("[token-refresh] Repeatable job scheduled (every 8h)");
})();

// Analytics sync worker
const analyticsSyncWorker = new Worker(
  "analytics-sync",
  async (job) => {
    console.log(`[analytics-sync] Processing job ${job.id}:`, job.data);
    const { workspaceId } = job.data as { workspaceId: string; trigger?: string };
    const result = await syncWorkspaceAnalytics(workspaceId);
    console.log(`[analytics-sync] Workspace ${workspaceId}: ${result.succeeded} ok, ${result.failed} failed, ${result.totalMetrics} metrics`);
    return result;
  },
  { connection, concurrency: 2, lockDuration: 60000 }
);

// Email send worker
const emailSendWorker = new Worker(
  "email-send",
  async (job) => {
    console.log(`[email-send] Processing job ${job.id}:`, job.data);
    const { campaignId, subject, html, recipients, to, contactId } = job.data as {
      campaignId: string;
      subject?: string;
      html?: string;
      recipients?: Array<{ email: string; contactId?: string; variables?: Record<string, string> }>;
      to?: string;
      contactId?: string;
    };

    // Handle single email sends (from automation engine)
    if (to && !recipients) {
      const result = await sendBulkEmail({
        recipients: [{ email: to, contactId }],
        subject: subject ?? "No Subject",
        html: html ?? "",
        campaignId,
      });
      console.log(`[email-send] Single email to ${to}: sent=${result.sent}, failed=${result.failed}`);
      return result;
    }

    // Handle bulk email sends
    if (recipients) {
      const result = await sendBulkEmail({
        recipients,
        subject: subject ?? "No Subject",
        html: html ?? "",
        campaignId,
      });
      console.log(`[email-send] Bulk send for campaign ${campaignId}: sent=${result.sent}, failed=${result.failed}`);
      return result;
    }

    throw new Error("email-send job requires either 'to' or 'recipients' in job data");
  },
  { connection, concurrency: 10, lockDuration: 60000 }
);

// Report generation worker
const reportGenerateWorker = new Worker(
  "report-generate",
  async (job) => {
    console.log(`[report-generate] Processing job ${job.id}:`, job.data);
    const { workspaceId, type } = job.data as {
      workspaceId: string;
      userId?: string;
      type?: string;
    };

    // Default to last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const dateRange = { start, end };

    const format = type === "excel" ? "excel" : "pdf";
    let reportBuffer: Buffer;

    if (format === "excel") {
      reportBuffer = await generateExcelReport(workspaceId, dateRange);
    } else {
      reportBuffer = await generatePdfReport(workspaceId, dateRange);
    }

    console.log(`[report-generate] Generated ${format} report for workspace ${workspaceId} (${reportBuffer.length} bytes)`);
    return { format, size: reportBuffer.length };
  },
  { connection, concurrency: 2, lockDuration: 120000 }
);

// Webhook delivery worker
const webhookDeliveryWorker = new Worker(
  "webhook-delivery",
  async (job) => {
    console.log(`[webhook-delivery] Processing job ${job.id}:`, job.data);
    const result = await executeDelivery(job.data);
    console.log(`[webhook-delivery] Delivery ${job.data.deliveryId}: ${result.success ? "success" : "failed"}`);
    if (!result.success) {
      throw new Error(`Webhook delivery failed: ${result.statusCode ?? "unknown"}`);
    }
    return result;
  },
  { connection, concurrency: 10, lockDuration: 15000 }
);

// Email A/B test evaluation worker
const emailAbTestWorker = new Worker(
  "email-ab-test",
  async (job) => {
    console.log(`[email-ab-test] Processing job ${job.id}:`, job.data);
    const result = await evaluateAndSendWinner(job.data as ABTestJobData);
    console.log(`[email-ab-test] Winner: variant ${result.winner}, sent to ${result.sentToRemaining} remaining`);
    return result;
  },
  { connection, concurrency: 2, lockDuration: 60000 }
);

// Email automation workflow execution worker
const emailAutomationWorker = new Worker(
  "email-automation",
  async (job) => {
    console.log(`[email-automation] Processing job ${job.id}:`, job.data);
    await executeNode(job.data as AutomationJobData);
    console.log(`[email-automation] Node ${job.data.currentNodeId} executed for contact ${job.data.contactId}`);
  },
  { connection, concurrency: 5, lockDuration: 60000 }
);

const workers = [
  socialPublishWorker,
  tokenRefreshWorker,
  analyticsSyncWorker,
  emailSendWorker,
  reportGenerateWorker,
  webhookDeliveryWorker,
  emailAbTestWorker,
  emailAutomationWorker,
];

// Dead letter queue for forwarding permanently failed jobs
const deadLetterQueue = new Queue("dead-letter", {
  connection: new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  }),
});

for (const worker of workers) {
  worker.on("completed", (job) => {
    console.log(`[${worker.name}] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[${worker.name}] Job ${job?.id} failed:`, err.message);

    // Forward to dead letter queue when all attempts are exhausted
    if (job && job.attemptsMade >= (job.opts?.attempts ?? 1)) {
      deadLetterQueue.add(`dlq-${worker.name}-${job.id}`, {
        originalQueue: worker.name,
        originalJobId: job.id,
        originalJobData: job.data,
        error: err.message,
        failedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade,
      }).catch((dlqErr) => {
        console.error(`[${worker.name}] Failed to forward job ${job.id} to DLQ:`, dlqErr);
      });
    }
  });
}

console.log("AdPilot worker process started. Listening for jobs...");

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
