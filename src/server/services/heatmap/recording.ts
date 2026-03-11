import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single rrweb-compatible event (or any DOM snapshot event). */
export interface RecordingEvent {
  type: number;
  data: unknown;
  timestamp: number;
}

/** Metadata extracted from a recording for quick querying. */
export interface RecordingMeta {
  eventsCount: number;
  clicksCount: number;
  rageClicksCount: number;
  pagesVisited: string[];
  duration: number; // ms
  compressedSizeBytes: number;
}

export interface StoredRecording {
  sessionId: string;
  events: RecordingEvent[];
  meta: RecordingMeta;
}

// ---------------------------------------------------------------------------
// Compression helpers
// ---------------------------------------------------------------------------

/**
 * Compress an array of recording events to a Base64-encoded gzip string.
 * Stored as JSON in the database `recording` column.
 */
export async function compressRecording(
  events: RecordingEvent[],
): Promise<string> {
  const json = JSON.stringify(events);
  const compressed = await gzipAsync(Buffer.from(json, "utf-8"));
  return compressed.toString("base64");
}

/**
 * Decompress a Base64-encoded gzip string back to recording events.
 */
export async function decompressRecording(
  data: string,
): Promise<RecordingEvent[]> {
  const buffer = Buffer.from(data, "base64");
  const decompressed = await gunzipAsync(buffer);
  return JSON.parse(decompressed.toString("utf-8")) as RecordingEvent[];
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extract lightweight metadata from a set of recording events.
 * This metadata is stored alongside the compressed data for fast queries
 * without needing to decompress the full recording.
 */
export function extractRecordingMeta(
  events: RecordingEvent[],
  compressedSizeBytes: number,
): RecordingMeta {
  let clicksCount = 0;
  let rageClicksCount = 0;
  const pagesVisited = new Set<string>();

  // Track click timestamps per position for rage click detection
  const recentClicks: { x: number; y: number; ts: number }[] = [];
  const RAGE_CLICK_THRESHOLD = 3; // clicks within radius
  const RAGE_CLICK_WINDOW_MS = 1000; // within 1s
  const RAGE_CLICK_RADIUS = 30; // pixels

  for (const event of events) {
    const eventData = event.data as Record<string, unknown> | undefined;

    // rrweb event type 3 = IncrementalSnapshot, source 2 = MouseInteraction
    // Also support a simplified { type: "click" } format
    if (eventData) {
      // Detect clicks - rrweb uses source:2, type:2 for clicks
      const isClick =
        (event.type === 3 &&
          (eventData as Record<string, unknown>).source === 2 &&
          (eventData as Record<string, unknown>).type === 2) ||
        (eventData as Record<string, unknown>).eventType === "click";

      if (isClick) {
        clicksCount++;

        const x = ((eventData as Record<string, unknown>).x as number) ?? 0;
        const y = ((eventData as Record<string, unknown>).y as number) ?? 0;
        const ts = event.timestamp;

        // Check for rage clicks: multiple rapid clicks in same area
        const nowWindow = recentClicks.filter(
          (c) =>
            ts - c.ts < RAGE_CLICK_WINDOW_MS &&
            Math.abs(c.x - x) < RAGE_CLICK_RADIUS &&
            Math.abs(c.y - y) < RAGE_CLICK_RADIUS,
        );

        if (nowWindow.length >= RAGE_CLICK_THRESHOLD - 1) {
          rageClicksCount++;
        }

        recentClicks.push({ x, y, ts });
      }

      // Detect page navigation events
      const href = (eventData as Record<string, unknown>).href as
        | string
        | undefined;
      if (href) {
        try {
          const url = new URL(href);
          pagesVisited.add(url.pathname);
        } catch {
          pagesVisited.add(href);
        }
      }
    }
  }

  // Compute duration from first to last event
  const timestamps = events.map((e) => e.timestamp).filter(Boolean);
  const duration =
    timestamps.length >= 2
      ? Math.max(...timestamps) - Math.min(...timestamps)
      : 0;

  return {
    eventsCount: events.length,
    clicksCount,
    rageClicksCount,
    pagesVisited: Array.from(pagesVisited),
    duration,
    compressedSizeBytes,
  };
}

// ---------------------------------------------------------------------------
// Storage service
// ---------------------------------------------------------------------------

/**
 * Store a session recording, compressing the events and saving metadata.
 */
export async function storeRecording(
  sessionId: string,
  events: RecordingEvent[],
): Promise<RecordingMeta> {
  const compressed = await compressRecording(events);
  const compressedSizeBytes = Buffer.byteLength(compressed, "utf-8");
  const meta = extractRecordingMeta(events, compressedSizeBytes);

  // Duration in seconds for the HeatmapSession.duration field
  const durationSeconds = Math.round(meta.duration / 1000);

  await prisma.heatmapSession.update({
    where: { id: sessionId },
    data: {
      recording: JSON.parse(JSON.stringify({
        compressed,
        meta,
      })) as Prisma.InputJsonValue,
      duration: durationSeconds,
    },
  });

  return meta;
}

/**
 * Retrieve and decompress a session recording.
 */
export async function getRecording(
  sessionId: string,
): Promise<StoredRecording | null> {
  const session = await prisma.heatmapSession.findUnique({
    where: { id: sessionId },
    select: { recording: true },
  });

  if (!session?.recording) {
    return null;
  }

  const recordingData = session.recording as unknown as {
    compressed: string;
    meta: RecordingMeta;
  };

  if (!recordingData.compressed) {
    return null;
  }

  const events = await decompressRecording(recordingData.compressed);

  return {
    sessionId,
    events,
    meta: recordingData.meta,
  };
}

/**
 * Get just the metadata for a recording without decompressing events.
 */
export async function getRecordingMeta(
  sessionId: string,
): Promise<RecordingMeta | null> {
  const session = await prisma.heatmapSession.findUnique({
    where: { id: sessionId },
    select: { recording: true },
  });

  if (!session?.recording) {
    return null;
  }

  const recordingData = session.recording as {
    meta?: RecordingMeta;
  };

  return recordingData.meta ?? null;
}

/**
 * Delete a session recording (set to null).
 */
export async function deleteRecording(sessionId: string): Promise<void> {
  await prisma.heatmapSession.update({
    where: { id: sessionId },
    data: {
      recording: undefined,
    },
  });
}

/**
 * List sessions that have recordings for a given site, with metadata.
 * Used by the session list page.
 */
export async function listRecordingSessions(
  siteId: string,
  options: {
    skip?: number;
    take?: number;
    minDuration?: number; // seconds
    deviceType?: "mobile" | "tablet" | "desktop";
  } = {},
) {
  const { skip = 0, take = 20, minDuration, deviceType } = options;

  // Build where clause
  const where: Record<string, unknown> = {
    siteId,
    recording: { not: null },
  };

  if (minDuration !== undefined) {
    where.duration = { gte: minDuration };
  }

  // Device type filtering by screen width heuristics
  if (deviceType === "mobile") {
    where.screenWidth = { lt: 768 };
  } else if (deviceType === "tablet") {
    where.screenWidth = { gte: 768, lt: 1024 };
  } else if (deviceType === "desktop") {
    where.screenWidth = { gte: 1024 };
  }

  const [sessions, total] = await Promise.all([
    prisma.heatmapSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        visitorId: true,
        userAgent: true,
        screenWidth: true,
        screenHeight: true,
        pageUrl: true,
        duration: true,
        startedAt: true,
        recording: true,
      },
    }),
    prisma.heatmapSession.count({ where }),
  ]);

  // Extract metadata from each session's recording without decompressing
  const sessionsWithMeta = sessions.map((s) => {
    const recordingData = s.recording as {
      meta?: RecordingMeta;
    } | null;

    return {
      id: s.id,
      visitorId: s.visitorId,
      userAgent: s.userAgent,
      screenWidth: s.screenWidth,
      screenHeight: s.screenHeight,
      pageUrl: s.pageUrl,
      duration: s.duration,
      startedAt: s.startedAt,
      meta: recordingData?.meta ?? null,
    };
  });

  return {
    sessions: sessionsWithMeta,
    total,
    hasMore: skip + take < total,
  };
}
