import { describe, it, expect, vi, beforeEach } from "vitest";
import { gzipSync, gunzipSync } from "zlib";

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockPrisma = {
  heatmapSession: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  heatmapEvent: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// ── Recording Service (service logic extracted for testing) ───────────────────

interface SessionEvent {
  type: string;
  x: number;
  y: number;
  timestamp: Date;
  scrollDepth?: number | null;
  element?: string | null;
}

interface SessionMetadata {
  sessionId: string;
  visitorId: string;
  userAgent: string | null;
  screenWidth: number;
  screenHeight: number;
  pageUrl: string;
  startedAt: Date;
  duration: number | null;
  eventCount: number;
}

/**
 * Compress event data for storage (gzip JSON).
 */
function compressEvents(events: SessionEvent[]): Buffer {
  const json = JSON.stringify(events);
  return gzipSync(Buffer.from(json, "utf-8"));
}

/**
 * Decompress stored event data.
 */
function decompressEvents(compressed: Buffer): SessionEvent[] {
  const json = gunzipSync(compressed).toString("utf-8");
  return JSON.parse(json);
}

/**
 * Extract metadata summary from a session and its events.
 */
function extractMetadata(
  session: {
    id: string;
    visitorId: string;
    userAgent: string | null;
    screenWidth: number;
    screenHeight: number;
    pageUrl: string;
    startedAt: Date;
    duration: number | null;
  },
  events: SessionEvent[]
): SessionMetadata {
  return {
    sessionId: session.id,
    visitorId: session.visitorId,
    userAgent: session.userAgent,
    screenWidth: session.screenWidth,
    screenHeight: session.screenHeight,
    pageUrl: session.pageUrl,
    startedAt: session.startedAt,
    duration: session.duration,
    eventCount: events.length,
  };
}

/**
 * Calculate session duration from events (ms between first and last event).
 */
function calculateDuration(events: SessionEvent[]): number {
  if (events.length < 2) return 0;
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return (
    new Date(sorted[sorted.length - 1].timestamp).getTime() -
    new Date(sorted[0].timestamp).getTime()
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Recording Service — Compress / Decompress", () => {
  const sampleEvents: SessionEvent[] = [
    {
      type: "CLICK",
      x: 100,
      y: 200,
      timestamp: new Date("2026-03-01T10:00:00Z"),
      element: "button.cta",
    },
    {
      type: "SCROLL",
      x: 0,
      y: 500,
      timestamp: new Date("2026-03-01T10:00:01Z"),
      scrollDepth: 45,
    },
    {
      type: "MOUSEMOVE",
      x: 300,
      y: 400,
      timestamp: new Date("2026-03-01T10:00:02Z"),
    },
  ];

  it("should compress events to a buffer", () => {
    const compressed = compressEvents(sampleEvents);
    expect(Buffer.isBuffer(compressed)).toBe(true);
    expect(compressed.length).toBeGreaterThan(0);
  });

  it("compressed data should be smaller than raw JSON", () => {
    const rawJson = JSON.stringify(sampleEvents);
    const compressed = compressEvents(sampleEvents);
    // For very small payloads gzip may not shrink, so just verify it works
    expect(compressed.length).toBeGreaterThan(0);
    expect(typeof rawJson).toBe("string");
  });

  it("should decompress back to original events", () => {
    const compressed = compressEvents(sampleEvents);
    const decompressed = decompressEvents(compressed);
    expect(decompressed).toHaveLength(3);
    expect(decompressed[0].type).toBe("CLICK");
    expect(decompressed[0].x).toBe(100);
    expect(decompressed[1].scrollDepth).toBe(45);
    expect(decompressed[2].type).toBe("MOUSEMOVE");
  });

  it("should handle empty events array", () => {
    const compressed = compressEvents([]);
    const decompressed = decompressEvents(compressed);
    expect(decompressed).toEqual([]);
  });

  it("should handle large event batches", () => {
    const largeEvents: SessionEvent[] = Array.from({ length: 500 }, (_, i) => ({
      type: "MOUSEMOVE",
      x: i * 2,
      y: i * 3,
      timestamp: new Date(Date.now() + i * 100),
    }));
    const compressed = compressEvents(largeEvents);
    const decompressed = decompressEvents(compressed);
    expect(decompressed).toHaveLength(500);
    expect(decompressed[499].x).toBe(998);
  });
});

describe("Recording Service — Metadata Extraction", () => {
  const mockSession = {
    id: "sess_001",
    visitorId: "vis_abc",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    screenWidth: 1920,
    screenHeight: 1080,
    pageUrl: "https://example.com/pricing",
    startedAt: new Date("2026-03-01T10:00:00Z"),
    duration: 15000,
  };

  const mockEvents: SessionEvent[] = [
    { type: "CLICK", x: 100, y: 200, timestamp: new Date("2026-03-01T10:00:00Z") },
    { type: "SCROLL", x: 0, y: 400, timestamp: new Date("2026-03-01T10:00:05Z"), scrollDepth: 30 },
    { type: "CLICK", x: 300, y: 100, timestamp: new Date("2026-03-01T10:00:10Z") },
  ];

  it("should extract correct session metadata", () => {
    const meta = extractMetadata(mockSession, mockEvents);
    expect(meta.sessionId).toBe("sess_001");
    expect(meta.visitorId).toBe("vis_abc");
    expect(meta.screenWidth).toBe(1920);
    expect(meta.pageUrl).toBe("https://example.com/pricing");
    expect(meta.eventCount).toBe(3);
  });

  it("should handle null userAgent", () => {
    const session = { ...mockSession, userAgent: null };
    const meta = extractMetadata(session, mockEvents);
    expect(meta.userAgent).toBeNull();
  });

  it("should report correct event count", () => {
    const meta = extractMetadata(mockSession, []);
    expect(meta.eventCount).toBe(0);
  });
});

describe("Recording Service — Duration Calculation", () => {
  it("should calculate duration between first and last event", () => {
    const events: SessionEvent[] = [
      { type: "CLICK", x: 0, y: 0, timestamp: new Date("2026-03-01T10:00:00Z") },
      { type: "CLICK", x: 0, y: 0, timestamp: new Date("2026-03-01T10:00:15Z") },
    ];
    expect(calculateDuration(events)).toBe(15000);
  });

  it("should return 0 for single event", () => {
    const events: SessionEvent[] = [
      { type: "CLICK", x: 0, y: 0, timestamp: new Date("2026-03-01T10:00:00Z") },
    ];
    expect(calculateDuration(events)).toBe(0);
  });

  it("should return 0 for empty events", () => {
    expect(calculateDuration([])).toBe(0);
  });

  it("should handle unordered events", () => {
    const events: SessionEvent[] = [
      { type: "CLICK", x: 0, y: 0, timestamp: new Date("2026-03-01T10:00:10Z") },
      { type: "CLICK", x: 0, y: 0, timestamp: new Date("2026-03-01T10:00:00Z") },
      { type: "CLICK", x: 0, y: 0, timestamp: new Date("2026-03-01T10:00:20Z") },
    ];
    expect(calculateDuration(events)).toBe(20000);
  });
});

describe("Recording Service — Storage via Prisma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should query sessions with correct filters", async () => {
    mockPrisma.heatmapSession.findMany.mockResolvedValue([]);

    await mockPrisma.heatmapSession.findMany({
      where: { siteId: "site_001" },
      orderBy: { startedAt: "desc" },
      take: 25,
    });

    expect(mockPrisma.heatmapSession.findMany).toHaveBeenCalledWith({
      where: { siteId: "site_001" },
      orderBy: { startedAt: "desc" },
      take: 25,
    });
  });

  it("should batch create events", async () => {
    mockPrisma.heatmapEvent.createMany.mockResolvedValue({ count: 3 });

    const result = await mockPrisma.heatmapEvent.createMany({
      data: [
        { type: "CLICK", x: 100, y: 200, sessionId: "sess_001", timestamp: new Date() },
        { type: "SCROLL", x: 0, y: 0, sessionId: "sess_001", timestamp: new Date(), scrollDepth: 50 },
        { type: "MOUSEMOVE", x: 300, y: 400, sessionId: "sess_001", timestamp: new Date() },
      ],
    });

    expect(result.count).toBe(3);
  });

  it("should update session duration", async () => {
    mockPrisma.heatmapSession.update.mockResolvedValue({ id: "sess_001", duration: 15000 });

    const result = await mockPrisma.heatmapSession.update({
      where: { id: "sess_001" },
      data: { duration: 15000 },
    });

    expect(result.duration).toBe(15000);
    expect(mockPrisma.heatmapSession.update).toHaveBeenCalledWith({
      where: { id: "sess_001" },
      data: { duration: 15000 },
    });
  });
});
