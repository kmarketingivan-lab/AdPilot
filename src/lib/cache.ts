/**
 * Redis Caching Layer
 *
 * Provides cacheGet / cacheSet / cacheInvalidate utilities backed by ioredis.
 * Uses the same Redis connection as BullMQ queues.
 */

import { redisConnection as redis } from "@/server/queue/connection";

// ---------------------------------------------------------------------------
// Predefined TTL presets (seconds)
// ---------------------------------------------------------------------------

export const CacheTTL = {
  /** Dashboard KPI cards — refresh every 5 minutes */
  DASHBOARD_KPIS: 300,
  /** Analytics data — refresh every 15 minutes */
  ANALYTICS: 900,
  /** Short-lived cache — 1 minute */
  SHORT: 60,
  /** Long-lived cache — 1 hour */
  LONG: 3600,
} as const;

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

const KEY_PREFIX = "adpilot:cache:";

function prefixedKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

/**
 * Get a cached value. Returns `null` if the key does not exist or has expired.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(prefixedKey(key));
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupted data — delete and return null
    await redis.del(prefixedKey(key));
    return null;
  }
}

/**
 * Set a cached value with a TTL (in seconds).
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const raw = JSON.stringify(value);
  await redis.set(prefixedKey(key), raw, "EX", ttlSeconds);
}

/**
 * Invalidate (delete) one or more cache keys.
 * Supports glob patterns — e.g. `cacheInvalidate("dashboard:*")`.
 */
export async function cacheInvalidate(pattern: string): Promise<number> {
  const fullPattern = prefixedKey(pattern);

  // If the pattern contains wildcards, use SCAN to find matching keys
  if (fullPattern.includes("*")) {
    let deleted = 0;
    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        fullPattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } while (cursor !== "0");

    return deleted;
  }

  // Single key deletion
  return redis.del(fullPattern);
}

/**
 * Cache-through helper: returns cached value if available, otherwise calls
 * the factory function, caches the result, and returns it.
 */
export async function cacheThrough<T>(
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const fresh = await factory();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}

// ---------------------------------------------------------------------------
// Key builders — consistent key patterns for common queries
// ---------------------------------------------------------------------------

export const CacheKeys = {
  dashboardKpis: (workspaceId: string, from: string, to: string) =>
    `dashboard:kpis:${workspaceId}:${from}:${to}`,
  analytics: (workspaceId: string, query: string) =>
    `analytics:${workspaceId}:${query}`,
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
} as const;
