import { z } from "zod";
import { router, protectedProcedure } from "../init";
import { markAsRead, markAllAsRead } from "@/server/services/notifications";

export const notificationsRouter = router({
  // List notifications for current user
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.notification.findMany({
        where: { userId: ctx.user.id! },
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  // Unread count
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.notification.count({
      where: { userId: ctx.user.id!, read: false },
    });
  }),

  // Mark single as read
  markRead: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await markAsRead(input.notificationId, ctx.user.id!);
      return { success: true };
    }),

  // Mark all as read
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllAsRead(ctx.user.id!);
    return { success: true };
  }),

  // Delete a notification
  delete: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.notification.deleteMany({
        where: { id: input.notificationId, userId: ctx.user.id! },
      });
      return { success: true };
    }),
});
