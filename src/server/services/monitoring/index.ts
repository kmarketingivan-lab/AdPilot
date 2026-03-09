/**
 * Monitoring & Logging Service
 *
 * Provides structured error logging, performance metrics tracking,
 * and system health checks.
 */

import { prisma } from "@/lib/prisma";
import { redisConnection as redis } from "@/server/queue/connection";

// ---------------------------------------------------------------------------
// Error Logging
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
  timestamp: string;
  service?: string;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const MIN_LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LOG_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.service ? `[${entry.service}]` : "",
    entry.message,
  ].filter(Boolean);

  if (entry.context) {
    parts.push(JSON.stringify(entry.context));
  }

  if (entry.error?.stack) {
    parts.push(`\n${entry.error.stack}`);
  }

  return parts.join(" ");
}

function log(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;

  const formatted = formatEntry(entry);

  switch (entry.level) {
    case "error":
    case "fatal":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }

  // Store errors in Redis for recent-error dashboard (last 100)
  if (entry.level === "error" || entry.level === "fatal") {
    storeRecentError(entry).catch(() => {
      // Silently fail — logging should never crash the app
    });
  }
}

async function storeRecentError(entry: LogEntry): Promise<void> {
  const key = "adpilot:monitoring:recent_errors";
  const serialized = JSON.stringify({
    level: entry.level,
    message: entry.message,
    context: entry.context,
    error: entry.error
      ? { message: entry.error.message, stack: entry.error.stack }
      : undefined,
    timestamp: entry.timestamp,
    service: entry.service,
  });

  await redis.lpush(key, serialized);
  await redis.ltrim(key, 0, 99); // Keep last 100 errors
  await redis.expire(key, 86400 * 7); // 7 day TTL
}

/**
 * Create a logger scoped to a service name.
 */
export function createLogger(service: string) {
  const makeEntry = (
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): LogEntry => ({
    level,
    message,
    context,
    error,
    timestamp: new Date().toISOString(),
    service,
  });

  return {
    debug: (msg: string, ctx?: Record<string, unknown>) =>
      log(makeEntry("debug", msg, ctx)),
    info: (msg: string, ctx?: Record<string, unknown>) =>
      log(makeEntry("info", msg, ctx)),
    warn: (msg: string, ctx?: Record<string, unknown>) =>
      log(makeEntry("warn", msg, ctx)),
    error: (msg: string, err?: Error, ctx?: Record<string, unknown>) =>
      log(makeEntry("error", msg, ctx, err)),
    fatal: (msg: string, err?: Error, ctx?: Record<string, unknown>) =>
      log(makeEntry("fatal", msg, ctx, err)),
  };
}

// ---------------------------------------------------------------------------
// Performance Metrics
// ---------------------------------------------------------------------------

const METRICS_KEY_PREFIX = "adpilot:metrics:";

/**
 * Record a timing metric (e.g. API response time).
 */
export async function recordTiming(
  name: string,
  durationMs: number,
): Promise<void> {
  const key = `${METRICS_KEY_PREFIX}timing:${name}`;
  const now = Date.now();

  await redis.zadd(key, now, `${durationMs}:${now}`);
  // Keep only last hour of data
  await redis.zremrangebyscore(key, 0, now - 3600_000);
  await redis.expire(key, 7200);
}

/**
 * Record a counter metric (e.g. number of API calls).
 */
export async function incrementCounter(name: string): Promise<number> {
  const key = `${METRICS_KEY_PREFIX}counter:${name}`;
  const count = await redis.incr(key);
  // Auto-expire counters after 24 hours if not refreshed
  await redis.expire(key, 86400);
  return count;
}

/**
 * Get recent timing metrics (average, p50, p95, p99 over last hour).
 */
export async function getTimingStats(
  name: string,
): Promise<{ avg: number; p50: number; p95: number; p99: number; count: number } | null> {
  const key = `${METRICS_KEY_PREFIX}timing:${name}`;
  const cutoff = Date.now() - 3600_000;
  const entries = await redis.zrangebyscore(key, cutoff, "+inf");

  if (entries.length === 0) return null;

  const values = entries
    .map((e) => parseFloat(e.split(":")[0]))
    .sort((a, b) => a - b);

  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    avg: Math.round(sum / count),
    p50: values[Math.floor(count * 0.5)],
    p95: values[Math.floor(count * 0.95)],
    p99: values[Math.floor(count * 0.99)],
    count,
  };
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: "up" | "down"; latencyMs?: number };
    redis: { status: "up" | "down"; latencyMs?: number };
    queues: { status: "up" | "down"; activeJobs?: number };
  };
}

const startTime = Date.now();

export async function getHealthStatus(): Promise<HealthStatus> {
  const checks: HealthStatus["checks"] = {
    database: { status: "down" },
    redis: { status: "down" },
    queues: { status: "down" },
  };

  // Check database
  try {
    const dbStart = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.database = { status: "up", latencyMs: Date.now() - dbStart };
  } catch {
    checks.database = { status: "down" };
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    await redis.ping();
    checks.redis = { status: "up", latencyMs: Date.now() - redisStart };
  } catch {
    checks.redis = { status: "down" };
  }

  // Check queues (via Redis key pattern)
  try {
    const queueKeys = await redis.keys("bull:*:active");
    let activeJobs = 0;
    for (const key of queueKeys) {
      activeJobs += await redis.llen(key);
    }
    checks.queues = { status: "up", activeJobs };
  } catch {
    checks.queues = { status: "down" };
  }

  // Determine overall status
  const allUp = Object.values(checks).every((c) => c.status === "up");
  const anyDown = Object.values(checks).some((c) => c.status === "down");

  return {
    status: allUp ? "healthy" : anyDown ? "unhealthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };
}
