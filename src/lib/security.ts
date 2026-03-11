/**
 * Security Utilities
 *
 * CSRF tokens, input sanitization, CSP headers, and rate limiting.
 */

import { randomBytes, createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
// Lazy import to avoid connecting to Redis at build time
let _redis: import("ioredis").default | null = null;
function getRedis() {
  if (!_redis) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { redisConnection } = require("@/server/queue/connection") as { redisConnection: import("ioredis").default };
    _redis = redisConnection;
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// CSRF Token Generation & Validation
// ---------------------------------------------------------------------------

function getCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) throw new Error("CSRF_SECRET environment variable is required");
  return secret;
}
const CSRF_TOKEN_HEADER = "x-csrf-token";
const CSRF_COOKIE_NAME = "__adpilot_csrf";

/**
 * Generate a signed CSRF token.
 * Returns { token, cookie } — token goes into a meta tag / hidden field,
 * cookie is set as httpOnly.
 */
export function generateCsrfToken(): { token: string; cookie: string } {
  const nonce = randomBytes(32).toString("hex");
  const signature = createHmac("sha256", getCsrfSecret())
    .update(nonce)
    .digest("hex");
  const token = `${nonce}.${signature}`;
  return { token, cookie: token };
}

/**
 * Validate that a CSRF token is well-formed and its signature matches.
 */
export function validateCsrfToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [nonce, signature] = parts;
  const expected = createHmac("sha256", getCsrfSecret())
    .update(nonce)
    .digest("hex");

  // Constant-time comparison
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Middleware helper: verify CSRF token from header matches the cookie.
 */
export function verifyCsrfFromRequest(req: NextRequest): boolean {
  const headerToken = req.headers.get(CSRF_TOKEN_HEADER);
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!headerToken || !cookieToken) return false;
  if (headerToken !== cookieToken) return false;
  return validateCsrfToken(headerToken);
}

// ---------------------------------------------------------------------------
// Input Sanitization
// ---------------------------------------------------------------------------

const HTML_TAG_RE = /<[^>]*>/g;
const SCRIPT_RE =
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_RE = /\bon\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_PROTO_RE = /javascript\s*:/gi;

/**
 * Strip HTML tags and XSS vectors from a string.
 * Safe for user-generated text content.
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(SCRIPT_RE, "")
    .replace(EVENT_HANDLER_RE, "")
    .replace(JAVASCRIPT_PROTO_RE, "")
    .replace(HTML_TAG_RE, "")
    .trim();
}

/**
 * Sanitize all string values in an object (shallow).
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === "string") {
      (result as Record<string, unknown>)[key] = sanitizeInput(
        result[key] as string,
      );
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Content Security Policy
// ---------------------------------------------------------------------------

export function getCspHeaders(): Record<string, string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' is kept for script-src because Next.js injects inline
    // scripts for hydration; a nonce-based approach requires custom server
    // configuration. 'unsafe-eval' has been removed to block eval()-based XSS.
    `script-src 'self' 'unsafe-inline' ${appUrl}`,
    // 'unsafe-inline' is required for styled-components / Emotion CSS-in-JS runtime styles.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://res.cloudinary.com`,
    `connect-src 'self' ${appUrl} https://api.stripe.com`,
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  return {
    "Content-Security-Policy": directives.join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  };
}

// ---------------------------------------------------------------------------
// API Rate Limiting (Redis-backed)
// ---------------------------------------------------------------------------

interface RateLimitConfig {
  /** Max number of requests in the window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch seconds
}

/**
 * Check and consume a rate-limit token for the given identifier.
 * Uses Redis sliding window with a sorted set.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const key = `adpilot:ratelimit:${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;

  const pipeline = getRedis().pipeline();
  // Remove expired entries
  pipeline.zremrangebyscore(key, 0, windowStart);
  // Count current entries
  pipeline.zcard(key);
  // Add the current request
  pipeline.zadd(key, now, `${now}:${Math.random()}`);
  // Set expiry on the key
  pipeline.expire(key, config.windowSeconds);

  const results = await pipeline.exec();
  const currentCount = (results?.[1]?.[1] as number) ?? 0;

  const allowed = currentCount < config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - currentCount - 1);
  const resetAt = Math.ceil((now + config.windowSeconds * 1000) / 1000);

  if (!allowed) {
    // Remove the entry we just added since the request is denied
    await getRedis().zremrangebyscore(key, now, now);
  }

  return { allowed, remaining, resetAt };
}

// ---------------------------------------------------------------------------
// Rate limit presets
// ---------------------------------------------------------------------------

export const RateLimits = {
  /** General API: 100 requests per minute */
  API: { maxRequests: 100, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Auth endpoints: 10 requests per minute */
  AUTH: { maxRequests: 10, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Webhook endpoints: 200 requests per minute */
  WEBHOOK: { maxRequests: 200, windowSeconds: 60 } satisfies RateLimitConfig,
} as const;

// ---------------------------------------------------------------------------
// Security Middleware Factory
// ---------------------------------------------------------------------------

/**
 * Create a security middleware for Next.js API routes.
 *
 * @example
 * // In an API route:
 * import { withSecurity } from "@/lib/security";
 *
 * export const POST = withSecurity(
 *   async (req) => { ... },
 *   { rateLimit: RateLimits.API, csrf: true }
 * );
 */
export function withSecurity(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse,
  options: {
    rateLimit?: RateLimitConfig;
    csrf?: boolean;
  } = {},
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // CSRF check for mutating methods
    if (
      options.csrf &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
    ) {
      if (!verifyCsrfFromRequest(req)) {
        return NextResponse.json(
          { error: "Invalid CSRF token" },
          { status: 403 },
        );
      }
    }

    // Rate limiting
    if (options.rateLimit) {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        "unknown";
      const identifier = `${req.method}:${req.nextUrl.pathname}:${ip}`;
      const result = await checkRateLimit(identifier, options.rateLimit);

      if (!result.allowed) {
        return NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "Retry-After": String(result.resetAt - Math.ceil(Date.now() / 1000)),
              "X-RateLimit-Remaining": "0",
            },
          },
        );
      }
    }

    // Apply security headers
    const response = await handler(req);
    const securityHeaders = getCspHeaders();
    for (const [name, value] of Object.entries(securityHeaders)) {
      response.headers.set(name, value);
    }
    return response;
  };
}
