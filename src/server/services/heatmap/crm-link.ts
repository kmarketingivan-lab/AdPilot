import { prisma } from "@/lib/prisma";

/**
 * Link a heatmap session to a CRM contact by email.
 * If no contact exists for the given email+workspace, one is created automatically.
 */
export async function linkSessionToContact(
  sessionId: string,
  email: string,
  workspaceId: string
): Promise<{ contactId: string; created: boolean }> {
  // Verify session exists and belongs to the workspace
  const session = await prisma.heatmapSession.findUnique({
    where: { id: sessionId },
    include: { site: { select: { workspaceId: true } } },
  });

  if (!session || session.site.workspaceId !== workspaceId) {
    throw new Error("Session not found");
  }

  // Find or create contact
  let created = false;
  let contact = await prisma.contact.findUnique({
    where: { email_workspaceId: { email, workspaceId } },
  });

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        email,
        workspaceId,
        source: "ORGANIC",
        stage: "LEAD",
      },
    });
    created = true;
  }

  // Store the link by updating session metadata (recording JSON field)
  // We store the contactId inside the session's recording JSON
  const existingRecording =
    (session.recording as Record<string, unknown>) ?? {};

  await prisma.heatmapSession.update({
    where: { id: sessionId },
    data: {
      recording: {
        ...existingRecording,
        linkedContactId: contact.id,
        linkedEmail: email,
        linkedAt: new Date().toISOString(),
      },
    },
  });

  // Log a PAGE_VIEW activity on the contact
  await prisma.activity.create({
    data: {
      type: "PAGE_VIEW",
      description: `Heatmap session linked: ${session.pageUrl}`,
      metadata: {
        sessionId,
        pageUrl: session.pageUrl,
        duration: session.duration,
      },
      contactId: contact.id,
    },
  });

  return { contactId: contact.id, created };
}

/**
 * Get all heatmap sessions linked to a specific contact.
 */
export async function getContactSessions(
  contactId: string,
  workspaceId: string
): Promise<
  Array<{
    id: string;
    pageUrl: string;
    duration: number | null;
    startedAt: Date;
    eventCount: number;
    screenWidth: number;
    screenHeight: number;
    userAgent: string | null;
  }>
> {
  // Verify contact belongs to workspace
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { workspaceId: true, email: true },
  });

  if (!contact || contact.workspaceId !== workspaceId) {
    throw new Error("Contact not found");
  }

  // Find sessions where recording JSON contains linkedContactId
  const sessions = await prisma.heatmapSession.findMany({
    where: {
      site: { workspaceId },
      recording: {
        path: ["linkedContactId"],
        equals: contactId,
      },
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      pageUrl: true,
      duration: true,
      startedAt: true,
      screenWidth: true,
      screenHeight: true,
      userAgent: true,
      _count: { select: { events: true } },
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    pageUrl: s.pageUrl,
    duration: s.duration,
    startedAt: s.startedAt,
    eventCount: s._count.events,
    screenWidth: s.screenWidth,
    screenHeight: s.screenHeight,
    userAgent: s.userAgent,
  }));
}
