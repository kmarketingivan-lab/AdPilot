import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockPrisma = {
  heatmapSession: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  heatmapEvent: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  heatmapSite: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// ── Privacy Service (service logic extracted for testing) ─────────────────────

interface RetentionPolicy {
  maxAgeDays: number;
}

/**
 * Find sessions older than the retention period.
 */
async function findExpiredSessions(
  siteId: string,
  policy: RetentionPolicy
): Promise<string[]> {
  const cutoff = new Date(Date.now() - policy.maxAgeDays * 24 * 60 * 60 * 1000);
  const sessions = await mockPrisma.heatmapSession.findMany({
    where: {
      siteId,
      startedAt: { lt: cutoff },
    },
    select: { id: true },
  });
  return sessions.map((s: { id: string }) => s.id);
}

/**
 * Delete expired sessions and their events (data retention enforcement).
 */
async function enforceRetention(
  siteId: string,
  policy: RetentionPolicy
): Promise<{ deletedSessions: number; deletedEvents: number }> {
  const sessionIds = await findExpiredSessions(siteId, policy);

  if (sessionIds.length === 0) {
    return { deletedSessions: 0, deletedEvents: 0 };
  }

  // Delete events first (foreign key constraint)
  const eventsResult = await mockPrisma.heatmapEvent.deleteMany({
    where: { sessionId: { in: sessionIds } },
  });

  // Then delete sessions
  const sessionsResult = await mockPrisma.heatmapSession.deleteMany({
    where: { id: { in: sessionIds } },
  });

  return {
    deletedSessions: sessionsResult.count,
    deletedEvents: eventsResult.count,
  };
}

/**
 * Export all heatmap data for a specific visitor (GDPR data export).
 */
async function exportVisitorData(visitorId: string) {
  const sessions = await mockPrisma.heatmapSession.findMany({
    where: { visitorId },
    select: {
      id: true,
      visitorId: true,
      userAgent: true,
      screenWidth: true,
      screenHeight: true,
      pageUrl: true,
      startedAt: true,
      duration: true,
    },
  });

  const sessionIds = sessions.map((s: { id: string }) => s.id);

  const events =
    sessionIds.length > 0
      ? await mockPrisma.heatmapEvent.findMany({
          where: { sessionId: { in: sessionIds } },
          select: {
            type: true,
            x: true,
            y: true,
            scrollDepth: true,
            element: true,
            timestamp: true,
            sessionId: true,
          },
        })
      : [];

  return {
    exportedAt: new Date().toISOString(),
    visitorId,
    sessions,
    events,
    totalSessions: sessions.length,
    totalEvents: events.length,
  };
}

/**
 * Delete all data for a specific visitor (GDPR right to erasure).
 */
async function deleteVisitorData(
  visitorId: string
): Promise<{ deletedSessions: number; deletedEvents: number }> {
  const sessions = await mockPrisma.heatmapSession.findMany({
    where: { visitorId },
    select: { id: true },
  });

  const sessionIds = sessions.map((s: { id: string }) => s.id);

  if (sessionIds.length === 0) {
    return { deletedSessions: 0, deletedEvents: 0 };
  }

  const eventsResult = await mockPrisma.heatmapEvent.deleteMany({
    where: { sessionId: { in: sessionIds } },
  });

  const sessionsResult = await mockPrisma.heatmapSession.deleteMany({
    where: { id: { in: sessionIds } },
  });

  return {
    deletedSessions: sessionsResult.count,
    deletedEvents: eventsResult.count,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Privacy Service — Data Retention Deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should find sessions older than retention period", async () => {
    mockPrisma.heatmapSession.findMany.mockResolvedValue([
      { id: "sess_old_1" },
      { id: "sess_old_2" },
    ]);

    const expired = await findExpiredSessions("site_001", { maxAgeDays: 90 });
    expect(expired).toEqual(["sess_old_1", "sess_old_2"]);

    expect(mockPrisma.heatmapSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          siteId: "site_001",
          startedAt: expect.objectContaining({
            lt: expect.any(Date),
          }),
        }),
      })
    );
  });

  it("should delete events before sessions (foreign key order)", async () => {
    const callOrder: string[] = [];

    mockPrisma.heatmapSession.findMany.mockResolvedValue([
      { id: "sess_1" },
      { id: "sess_2" },
    ]);

    mockPrisma.heatmapEvent.deleteMany.mockImplementation(async () => {
      callOrder.push("deleteEvents");
      return { count: 10 };
    });

    mockPrisma.heatmapSession.deleteMany.mockImplementation(async () => {
      callOrder.push("deleteSessions");
      return { count: 2 };
    });

    const result = await enforceRetention("site_001", { maxAgeDays: 90 });

    expect(callOrder).toEqual(["deleteEvents", "deleteSessions"]);
    expect(result.deletedEvents).toBe(10);
    expect(result.deletedSessions).toBe(2);
  });

  it("should return zeros when no expired sessions found", async () => {
    mockPrisma.heatmapSession.findMany.mockResolvedValue([]);

    const result = await enforceRetention("site_001", { maxAgeDays: 90 });

    expect(result).toEqual({ deletedSessions: 0, deletedEvents: 0 });
    expect(mockPrisma.heatmapEvent.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.heatmapSession.deleteMany).not.toHaveBeenCalled();
  });

  it("should use correct cutoff date for retention policy", async () => {
    mockPrisma.heatmapSession.findMany.mockResolvedValue([]);

    const before = Date.now();
    await findExpiredSessions("site_001", { maxAgeDays: 30 });
    const after = Date.now();

    const call = mockPrisma.heatmapSession.findMany.mock.calls[0][0];
    const cutoff = call.where.startedAt.lt.getTime();

    // Cutoff should be approximately 30 days ago
    const expected30DaysAgo = before - 30 * 24 * 60 * 60 * 1000;
    expect(cutoff).toBeGreaterThanOrEqual(expected30DaysAgo - 1000);
    expect(cutoff).toBeLessThanOrEqual(after - 30 * 24 * 60 * 60 * 1000 + 1000);
  });
});

describe("Privacy Service — GDPR Data Export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export all sessions and events for a visitor", async () => {
    mockPrisma.heatmapSession.findMany.mockResolvedValue([
      {
        id: "sess_001",
        visitorId: "vis_abc",
        userAgent: "Mozilla/5.0",
        screenWidth: 1920,
        screenHeight: 1080,
        pageUrl: "https://example.com",
        startedAt: new Date("2026-03-01"),
        duration: 10000,
      },
    ]);

    mockPrisma.heatmapEvent.findMany.mockResolvedValue([
      {
        type: "CLICK",
        x: 100,
        y: 200,
        scrollDepth: null,
        element: "button.cta",
        timestamp: new Date("2026-03-01T10:00:00Z"),
        sessionId: "sess_001",
      },
      {
        type: "SCROLL",
        x: 0,
        y: 0,
        scrollDepth: 50,
        element: null,
        timestamp: new Date("2026-03-01T10:00:05Z"),
        sessionId: "sess_001",
      },
    ]);

    const exported = await exportVisitorData("vis_abc");

    expect(exported.visitorId).toBe("vis_abc");
    expect(exported.totalSessions).toBe(1);
    expect(exported.totalEvents).toBe(2);
    expect(exported.sessions).toHaveLength(1);
    expect(exported.events).toHaveLength(2);
    expect(exported.exportedAt).toBeDefined();
  });

  it("should return empty export for unknown visitor", async () => {
    mockPrisma.heatmapSession.findMany.mockResolvedValue([]);

    const exported = await exportVisitorData("vis_unknown");

    expect(exported.totalSessions).toBe(0);
    expect(exported.totalEvents).toBe(0);
    expect(exported.sessions).toEqual([]);
    expect(exported.events).toEqual([]);
  });

  it("should query events only for visitor's sessions", async () => {
    mockPrisma.heatmapSession.findMany.mockResolvedValue([
      { id: "sess_A", visitorId: "vis_target", userAgent: null, screenWidth: 1080, screenHeight: 720, pageUrl: "/", startedAt: new Date(), duration: null },
      { id: "sess_B", visitorId: "vis_target", userAgent: null, screenWidth: 1080, screenHeight: 720, pageUrl: "/about", startedAt: new Date(), duration: null },
    ]);

    mockPrisma.heatmapEvent.findMany.mockResolvedValue([]);

    await exportVisitorData("vis_target");

    expect(mockPrisma.heatmapEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: { in: ["sess_A", "sess_B"] } },
      })
    );
  });
});

describe("Privacy Service — GDPR Right to Erasure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete all visitor data", async () => {
    mockPrisma.heatmapSession.findMany.mockResolvedValue([
      { id: "sess_001" },
      { id: "sess_002" },
    ]);
    mockPrisma.heatmapEvent.deleteMany.mockResolvedValue({ count: 25 });
    mockPrisma.heatmapSession.deleteMany.mockResolvedValue({ count: 2 });

    const result = await deleteVisitorData("vis_abc");

    expect(result.deletedSessions).toBe(2);
    expect(result.deletedEvents).toBe(25);
  });

  it("should delete events before sessions", async () => {
    const callOrder: string[] = [];

    mockPrisma.heatmapSession.findMany.mockResolvedValue([{ id: "sess_001" }]);
    mockPrisma.heatmapEvent.deleteMany.mockImplementation(async () => {
      callOrder.push("events");
      return { count: 5 };
    });
    mockPrisma.heatmapSession.deleteMany.mockImplementation(async () => {
      callOrder.push("sessions");
      return { count: 1 };
    });

    await deleteVisitorData("vis_abc");

    expect(callOrder).toEqual(["events", "sessions"]);
  });

  it("should handle visitor with no data gracefully", async () => {
    mockPrisma.heatmapSession.findMany.mockResolvedValue([]);

    const result = await deleteVisitorData("vis_nonexistent");

    expect(result).toEqual({ deletedSessions: 0, deletedEvents: 0 });
    expect(mockPrisma.heatmapEvent.deleteMany).not.toHaveBeenCalled();
  });
});
