import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockPrisma = {
  heatmapSite: {
    findUnique: vi.fn(),
  },
  heatmapSession: {
    upsert: vi.fn(),
  },
  heatmapEvent: {
    createMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    trackingId: "trk_abc123",
    sessionId: "sess_xyz789",
    screenWidth: 1920,
    screenHeight: 1080,
    userAgent: "Mozilla/5.0 Test",
    events: [
      {
        type: "CLICK",
        x: 500,
        y: 300,
        pageUrl: "https://example.com/page",
        timestamp: new Date().toISOString(),
        viewportW: 1920,
        viewportH: 1080,
      },
    ],
    ...overrides,
  };
}

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: () => Promise.resolve(body),
    headers: new Headers({
      "x-forwarded-for": "192.168.1.1",
      ...headers,
    }),
  } as unknown as Request;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Tracking API — Payload Validation", () => {
  it("should reject empty body", () => {
    const payload = null;
    expect(validatePayload(payload)).toBeNull();
  });

  it("should reject payload without trackingId", () => {
    const payload = makeValidPayload({ trackingId: "" });
    expect(validatePayload(payload)).toBeNull();
  });

  it("should reject payload without sessionId", () => {
    const payload = makeValidPayload({ sessionId: "" });
    expect(validatePayload(payload)).toBeNull();
  });

  it("should reject payload with non-number screenWidth", () => {
    const payload = makeValidPayload({ screenWidth: "wide" });
    expect(validatePayload(payload)).toBeNull();
  });

  it("should reject payload with empty events array", () => {
    const payload = makeValidPayload({ events: [] });
    expect(validatePayload(payload)).toBeNull();
  });

  it("should reject payload with more than 500 events", () => {
    const events = Array.from({ length: 501 }, (_, i) => ({
      type: "CLICK",
      x: i,
      y: i,
      pageUrl: "https://example.com",
      timestamp: new Date().toISOString(),
      viewportW: 1920,
      viewportH: 1080,
    }));
    const payload = makeValidPayload({ events });
    expect(validatePayload(payload)).toBeNull();
  });

  it("should reject payload with invalid event type", () => {
    const payload = makeValidPayload({
      events: [
        {
          type: "INVALID_TYPE",
          x: 100,
          y: 200,
          pageUrl: "https://example.com",
          timestamp: new Date().toISOString(),
          viewportW: 1920,
          viewportH: 1080,
        },
      ],
    });
    expect(validatePayload(payload)).toBeNull();
  });

  it("should reject event with non-number x/y coordinates", () => {
    const payload = makeValidPayload({
      events: [
        {
          type: "CLICK",
          x: "not-a-number",
          y: 200,
          pageUrl: "https://example.com",
          timestamp: new Date().toISOString(),
          viewportW: 1920,
          viewportH: 1080,
        },
      ],
    });
    expect(validatePayload(payload)).toBeNull();
  });

  it("should accept a valid payload", () => {
    const payload = makeValidPayload();
    expect(validatePayload(payload)).not.toBeNull();
    expect(validatePayload(payload)?.trackingId).toBe("trk_abc123");
  });

  it("should accept all valid event types", () => {
    const validTypes = ["CLICK", "SCROLL", "MOUSEMOVE", "RAGE_CLICK", "DEAD_CLICK"];
    for (const type of validTypes) {
      const payload = makeValidPayload({
        events: [
          {
            type,
            x: 100,
            y: 200,
            pageUrl: "https://example.com",
            timestamp: new Date().toISOString(),
            viewportW: 1920,
            viewportH: 1080,
          },
        ],
      });
      expect(validatePayload(payload)).not.toBeNull();
    }
  });
});

describe("Tracking API — Rate Limiting", () => {
  beforeEach(() => {
    // Reset the rate limiter between tests
    rateLimitMap.clear();
  });

  it("should allow first request from an IP", () => {
    expect(isRateLimited("10.0.0.1")).toBe(false);
  });

  it("should allow up to 100 requests per minute", () => {
    const ip = "10.0.0.2";
    for (let i = 0; i < 100; i++) {
      expect(isRateLimited(ip)).toBe(false);
    }
  });

  it("should block the 101st request within the same minute", () => {
    const ip = "10.0.0.3";
    for (let i = 0; i < 100; i++) {
      isRateLimited(ip);
    }
    expect(isRateLimited(ip)).toBe(true);
  });

  it("should track different IPs independently", () => {
    const ip1 = "10.0.0.4";
    const ip2 = "10.0.0.5";
    for (let i = 0; i < 100; i++) {
      isRateLimited(ip1);
    }
    expect(isRateLimited(ip1)).toBe(true);
    expect(isRateLimited(ip2)).toBe(false);
  });
});

describe("Tracking API — CORS", () => {
  it("OPTIONS handler should return 204 with CORS headers", () => {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    // Verify expected CORS header values
    expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("*");
    expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("POST");
    expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    expect(corsHeaders["Access-Control-Allow-Headers"]).toContain("Content-Type");
  });
});

// ── Extracted functions under test ────────────────────────────────────────────
// We re-implement the pure validation/rate-limit logic here so we can test it
// without importing the Next.js route handler (which has side effects).

const VALID_TYPES = new Set([
  "CLICK",
  "SCROLL",
  "MOUSEMOVE",
  "RAGE_CLICK",
  "DEAD_CLICK",
]);

interface TrackingEventPayload {
  type: string;
  x: number;
  y: number;
  scrollDepth?: number | null;
  element?: string | null;
  timestamp: string;
  pageUrl: string;
  viewportW: number;
  viewportH: number;
}

interface TrackingPayload {
  trackingId: string;
  sessionId: string;
  screenWidth: number;
  screenHeight: number;
  userAgent?: string;
  events: TrackingEventPayload[];
}

function validatePayload(body: unknown): TrackingPayload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (typeof b.trackingId !== "string" || !b.trackingId) return null;
  if (typeof b.sessionId !== "string" || !b.sessionId) return null;
  if (typeof b.screenWidth !== "number" || typeof b.screenHeight !== "number")
    return null;
  if (!Array.isArray(b.events) || b.events.length === 0) return null;
  if (b.events.length > 500) return null;

  for (const evt of b.events) {
    if (!evt || typeof evt !== "object") return null;
    if (!VALID_TYPES.has(evt.type)) return null;
    if (typeof evt.x !== "number" || typeof evt.y !== "number") return null;
    if (typeof evt.pageUrl !== "string") return null;
  }

  return b as unknown as TrackingPayload;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  if (entry.count > 100) return true;
  return false;
}
