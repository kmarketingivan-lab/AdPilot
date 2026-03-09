import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  userId: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      type: input.type,
      title: input.title,
      body: input.body,
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
    },
  });
}

export async function createBulkNotifications(
  inputs: CreateNotificationInput[]
) {
  return prisma.notification.createMany({
    data: inputs.map((input) => ({
      type: input.type,
      title: input.title,
      body: input.body,
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
    })),
  });
}

export async function notifyWorkspaceMembers(
  workspaceId: string,
  notification: Omit<CreateNotificationInput, "userId" | "workspaceId">,
  excludeUserId?: string
) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true },
  });

  const inputs = members
    .filter((m) => m.userId !== excludeUserId)
    .map((m) => ({
      ...notification,
      userId: m.userId,
      workspaceId,
    }));

  if (inputs.length > 0) {
    await createBulkNotifications(inputs);
  }
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}

export async function markAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}
