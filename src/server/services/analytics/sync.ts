import type { AdsConnection, AdsPlatform, CampaignStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

// ---------------------------------------------------------------------------
// Types for platform service responses
// ---------------------------------------------------------------------------

export interface PlatformCampaign {
  externalId: string;
  name: string;
  status: CampaignStatus;
  objective?: string;
  budget?: number;
  budgetType?: "DAILY" | "LIFETIME";
  startDate?: Date;
  endDate?: Date;
}

export interface PlatformDailyMetric {
  date: Date;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  cpc?: number;
  ctr?: number;
  cpa?: number;
  roas?: number;
}

export interface PlatformCampaignData {
  campaign: PlatformCampaign;
  metrics: PlatformDailyMetric[];
}

// ---------------------------------------------------------------------------
// Platform service interfaces (implemented by google-ads.ts / meta-ads.ts)
// ---------------------------------------------------------------------------

interface PlatformAdsService {
  fetchCampaigns(
    accessToken: string,
    accountId: string,
    dateRange: { start: string; end: string },
  ): Promise<unknown[]>;
}

// Lazy-load platform services to avoid circular deps and allow other agents
// to create them independently.
async function getGoogleAdsService(): Promise<PlatformAdsService> {
  const mod = await import("./google-ads");
  return mod.googleAdsService;
}

async function getMetaAdsService(): Promise<PlatformAdsService> {
  const mod = await import("./meta-ads");
  return mod.metaAdsService;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function today(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Sync a single platform connection
// ---------------------------------------------------------------------------

async function syncGoogleAds(connection: AdsConnection): Promise<number> {
  const service = await getGoogleAdsService();
  const accessToken = decrypt(connection.accessToken);
  const dateRange = {
    start: formatDate(daysAgo(30)),
    end: formatDate(today()),
  };

  const campaigns = await service.fetchCampaigns(
    accessToken,
    connection.accountId,
    dateRange,
  );

  return upsertRawCampaigns(connection, "GOOGLE_ADS", campaigns);
}

async function syncMetaAds(connection: AdsConnection): Promise<number> {
  const service = await getMetaAdsService();
  const accessToken = decrypt(connection.accessToken);
  const dateRange = {
    start: formatDate(daysAgo(30)),
    end: formatDate(today()),
  };

  const campaigns = await service.fetchCampaigns(
    accessToken,
    connection.accountId,
    dateRange,
  );

  return upsertRawCampaigns(connection, "META_ADS", campaigns);
}

// ---------------------------------------------------------------------------
// Upsert raw campaigns from platform services
// ---------------------------------------------------------------------------

interface RawCampaignRecord {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

async function upsertRawCampaigns(
  connection: AdsConnection,
  platform: AdsPlatform,
  campaigns: unknown[],
): Promise<number> {
  let upserted = 0;

  for (const raw of campaigns) {
    const c = raw as RawCampaignRecord;
    const externalId = String(c.id);

    const existing = await prisma.campaign.findFirst({
      where: { externalId, connectionId: connection.id },
      select: { id: true },
    });

    const mapStatus = (s: string): CampaignStatus => {
      const upper = s.toUpperCase();
      if (upper === "ENABLED" || upper === "ACTIVE") return "ACTIVE";
      if (upper === "PAUSED") return "PAUSED";
      if (upper === "REMOVED" || upper === "DELETED" || upper === "ARCHIVED") return "ARCHIVED";
      return "ACTIVE";
    };

    const data = {
      name: c.name,
      status: mapStatus(c.status),
      objective: typeof c.objective === "string" ? c.objective : null,
    };

    if (existing) {
      await prisma.campaign.update({ where: { id: existing.id }, data });
    } else {
      await prisma.campaign.create({
        data: {
          ...data,
          externalId,
          platform,
          workspaceId: connection.workspaceId,
          connectionId: connection.id,
        },
      });
    }
    upserted++;
  }

  return upserted;
}

// ---------------------------------------------------------------------------
// Connection-level sync
// ---------------------------------------------------------------------------

export interface SyncConnectionResult {
  connectionId: string;
  platform: AdsPlatform;
  accountId: string;
  metricsUpserted: number;
  error?: string;
}

/**
 * Sync a single AdsConnection. Dispatches to the correct platform handler.
 */
export async function syncConnection(
  connection: AdsConnection,
): Promise<SyncConnectionResult> {
  try {
    let metricsUpserted: number;

    switch (connection.platform) {
      case "GOOGLE_ADS":
        metricsUpserted = await syncGoogleAds(connection);
        break;
      case "META_ADS":
        metricsUpserted = await syncMetaAds(connection);
        break;
      default:
        throw new Error(`Unsupported platform: ${connection.platform}`);
    }

    console.log(
      `[analytics-sync] Synced ${connection.platform} account ${connection.accountId}: ${metricsUpserted} metrics`,
    );

    return {
      connectionId: connection.id,
      platform: connection.platform,
      accountId: connection.accountId,
      metricsUpserted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[analytics-sync] Failed ${connection.platform} account ${connection.accountId}: ${message}`,
    );

    return {
      connectionId: connection.id,
      platform: connection.platform,
      accountId: connection.accountId,
      metricsUpserted: 0,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Workspace-level sync (entry point for the BullMQ worker)
// ---------------------------------------------------------------------------

export interface SyncWorkspaceResult {
  workspaceId: string;
  connections: SyncConnectionResult[];
  totalMetrics: number;
  succeeded: number;
  failed: number;
}

/**
 * Fetch all AdsConnections for a workspace and sync each one.
 * Errors in one connection do not stop others.
 */
export async function syncWorkspaceAnalytics(
  workspaceId: string,
): Promise<SyncWorkspaceResult> {
  const connections = await prisma.adsConnection.findMany({
    where: { workspaceId },
  });

  console.log(
    `[analytics-sync] Workspace ${workspaceId}: found ${connections.length} connections`,
  );

  const results: SyncConnectionResult[] = [];

  for (const connection of connections) {
    const result = await syncConnection(connection);
    results.push(result);
  }

  const succeeded = results.filter((r) => !r.error).length;
  const failed = results.filter((r) => !!r.error).length;
  const totalMetrics = results.reduce((sum, r) => sum + r.metricsUpserted, 0);

  console.log(
    `[analytics-sync] Workspace ${workspaceId} done: ${succeeded} ok, ${failed} failed, ${totalMetrics} metrics`,
  );

  return {
    workspaceId,
    connections: results,
    totalMetrics,
    succeeded,
    failed,
  };
}
