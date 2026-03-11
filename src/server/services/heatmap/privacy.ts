import { prisma } from "@/lib/prisma";

// ── Sensitive field selectors that should be auto-masked ──────────────────────

/**
 * CSS selectors for elements whose content must be masked in recordings.
 * The tracking.js script should check these client-side, but this list
 * can also be used server-side to scrub stored data.
 */
export const SENSITIVE_SELECTORS = [
  'input[type="password"]',
  'input[type="tel"]',
  'input[autocomplete="cc-number"]',
  'input[autocomplete="cc-exp"]',
  'input[autocomplete="cc-csc"]',
  'input[autocomplete="cc-name"]',
  'input[name*="card"]',
  'input[name*="credit"]',
  'input[name*="cvv"]',
  'input[name*="cvc"]',
  'input[name*="ssn"]',
  'input[data-hm-mask]',
  "[data-hm-mask]",
] as const;

/**
 * Check whether an element selector matches a sensitive pattern.
 */
export function isSensitiveElement(selector: string): boolean {
  const lower = selector.toLowerCase();
  return (
    lower.includes('type="password"') ||
    lower.includes("password") ||
    lower.includes("credit") ||
    lower.includes("card-number") ||
    lower.includes("cc-") ||
    lower.includes("cvv") ||
    lower.includes("cvc") ||
    lower.includes("ssn") ||
    lower.includes("data-hm-mask")
  );
}

/**
 * Scrub sensitive element data from an event's element selector string.
 * Returns "[MASKED]" if the element matches a sensitive pattern.
 */
export function maskSensitiveElement(
  element: string | null
): string | null {
  if (!element) return element;
  return isSensitiveElement(element) ? "[MASKED]" : element;
}

// ── Cookie-free tracking documentation ───────────────────────────────────────
//
// The heatmap tracking script (tracking.js) uses sessionStorage exclusively
// for visitor identification. No cookies are set by the tracker.
//
// - Visitor ID: generated once per browser tab session via sessionStorage
// - Session ID: generated once per page load
// - No cross-domain tracking
// - Data is discarded when the tab/browser is closed
//
// This approach is compliant with ePrivacy Directive and GDPR requirements
// for "strictly necessary" storage, as sessionStorage is ephemeral and
// no personal data is stored client-side.

// ── Data retention ───────────────────────────────────────────────────────────

/**
 * Delete heatmap sessions (and cascading events) older than `retentionDays`.
 * Returns the number of sessions deleted.
 */
export async function deleteExpiredSessions(
  workspaceId: string,
  retentionDays: number
): Promise<number> {
  if (retentionDays < 1) {
    throw new Error("retentionDays must be at least 1");
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  // Get site IDs for this workspace
  const sites = await prisma.heatmapSite.findMany({
    where: { workspaceId },
    select: { id: true },
  });

  if (sites.length === 0) return 0;

  const siteIds = sites.map((s) => s.id);

  // Delete sessions older than cutoff (events cascade via onDelete)
  const result = await prisma.heatmapSession.deleteMany({
    where: {
      siteId: { in: siteIds },
      startedAt: { lt: cutoff },
    },
  });

  return result.count;
}

// ── GDPR data export ─────────────────────────────────────────────────────────

export interface GdprExportData {
  email: string;
  exportedAt: string;
  sessions: Array<{
    id: string;
    pageUrl: string;
    startedAt: string;
    duration: number | null;
    userAgent: string | null;
    screenWidth: number;
    screenHeight: number;
    events: Array<{
      id: string;
      type: string;
      x: number;
      y: number;
      scrollDepth: number | null;
      element: string | null;
      timestamp: string;
    }>;
  }>;
}

/**
 * Export all heatmap tracking data associated with an email address.
 * Searches for sessions linked to the email via the recording JSON field.
 * Returns a structured object suitable for GDPR data portability requests.
 */
export async function exportUserData(email: string): Promise<GdprExportData> {
  // Find all sessions linked to this email (via recording.linkedEmail)
  const sessions = await prisma.heatmapSession.findMany({
    where: {
      recording: {
        path: ["linkedEmail"],
        equals: email,
      },
    },
    include: {
      events: {
        orderBy: { timestamp: "asc" },
        select: {
          id: true,
          type: true,
          x: true,
          y: true,
          scrollDepth: true,
          element: true,
          timestamp: true,
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return {
    email,
    exportedAt: new Date().toISOString(),
    sessions: sessions.map((s) => ({
      id: s.id,
      pageUrl: s.pageUrl,
      startedAt: s.startedAt.toISOString(),
      duration: s.duration,
      userAgent: s.userAgent,
      screenWidth: s.screenWidth,
      screenHeight: s.screenHeight,
      events: s.events.map((e) => ({
        id: e.id,
        type: e.type,
        x: e.x,
        y: e.y,
        scrollDepth: e.scrollDepth,
        element: maskSensitiveElement(e.element),
        timestamp: e.timestamp.toISOString(),
      })),
    })),
  };
}
