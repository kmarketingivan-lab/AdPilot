import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HeatmapEventType } from "@prisma/client";

// ── Rate limiter (in-memory, per IP, 100 req/min) ─────────────────────────

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

// Clean up stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 60_000);

// ── CORS headers ───────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// ── OPTIONS (preflight) ────────────────────────────────────────────────────

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── Validation ─────────────────────────────────────────────────────────────

const VALID_TYPES = new Set<string>([
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
  if (b.events.length > 500) return null; // cap batch size

  for (const evt of b.events) {
    if (!evt || typeof evt !== "object") return null;
    if (!VALID_TYPES.has(evt.type)) return null;
    if (typeof evt.x !== "number" || typeof evt.y !== "number") return null;
    if (typeof evt.pageUrl !== "string") return null;
  }

  return b as unknown as TrackingPayload;
}

// ── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    // Parse body
    const body = await request.json();
    const payload = validatePayload(body);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Resolve trackingId → HeatmapSite
    const site = await prisma.heatmapSite.findUnique({
      where: { trackingId: payload.trackingId },
      select: { id: true },
    });

    if (!site) {
      return NextResponse.json(
        { error: "Unknown trackingId" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Get the page URL from the first event (all events in a batch share the same page)
    const pageUrl = payload.events[0].pageUrl;

    // Upsert session (find existing or create new)
    const session = await prisma.heatmapSession.upsert({
      where: { id: payload.sessionId },
      update: {},
      create: {
        id: payload.sessionId,
        visitorId: payload.sessionId,
        userAgent: payload.userAgent ?? null,
        screenWidth: payload.screenWidth,
        screenHeight: payload.screenHeight,
        pageUrl,
        siteId: site.id,
      },
    });

    // Batch insert events
    await prisma.heatmapEvent.createMany({
      data: payload.events.map((evt) => ({
        type: evt.type as HeatmapEventType,
        x: Math.round(evt.x),
        y: Math.round(evt.y),
        scrollDepth: evt.scrollDepth ?? null,
        element: evt.element ?? null,
        sessionId: session.id,
        timestamp: new Date(evt.timestamp),
      })),
    });

    return NextResponse.json(
      { ok: true, events: payload.events.length },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[tracking] Error processing events:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
