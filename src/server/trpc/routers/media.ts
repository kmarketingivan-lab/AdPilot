import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../init";
import { uploadImage, deleteImage } from "@/server/services/media/cloudinary";

export const mediaRouter = router({
  // List media files for workspace with pagination & search
  list: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(24),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, search } = input;

      const items = await ctx.prisma.mediaFile.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(search && {
            filename: { contains: search, mode: "insensitive" as const },
          }),
        },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  // Get single media file
  get: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const file = await ctx.prisma.mediaFile.findUnique({
        where: { id: input.id },
      });

      if (!file || file.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media file not found",
        });
      }

      return file;
    }),

  // Upload file (accepts base64 data, uploads to Cloudinary, saves to DB)
  upload: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
        base64Data: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");

      const result = await uploadImage(buffer, {
        folder: `adpilot/${input.workspaceId}`,
      });

      const mediaFile = await ctx.prisma.mediaFile.create({
        data: {
          filename: input.filename,
          url: result.url,
          cdnUrl: result.url,
          publicId: result.publicId,
          mimeType: input.mimeType,
          size: input.size,
          width: result.width,
          height: result.height,
          workspaceId: input.workspaceId,
        },
      });

      return mediaFile;
    }),

  // Delete media file (remove from Cloudinary + DB)
  delete: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.prisma.mediaFile.findUnique({
        where: { id: input.id },
      });

      if (!file || file.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media file not found",
        });
      }

      // Delete from Cloudinary if publicId exists
      if (file.publicId) {
        try {
          await deleteImage(file.publicId);
        } catch (error) {
          console.error("Failed to delete from Cloudinary:", error);
          // Continue with DB deletion even if Cloudinary fails
        }
      }

      await ctx.prisma.mediaFile.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
