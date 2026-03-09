"use client";

import { useState, useCallback } from "react";
import {
  Search,
  Upload,
  Trash2,
  ImageIcon,
  FileVideo,
  Loader2,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaUpload } from "@/components/social/media-upload";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc/client";
import Image from "next/image";
import { cn } from "@/lib/utils";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export default function MediaLibraryPage() {
  const { workspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    id: string;
    filename: string;
    url: string;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    createdAt: Date | string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.media.list.useInfiniteQuery(
      {
        workspaceId: workspace?.id ?? "",
        limit: 24,
        ...(search && { search }),
      },
      {
        enabled: !!workspace,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => {
      utils.media.list.invalidate();
    },
  });

  const handleDelete = useCallback(
    async (id: string) => {
      if (!workspace) return;
      setDeletingId(id);
      try {
        await deleteMutation.mutateAsync({
          workspaceId: workspace.id,
          id,
        });
        // Close preview if we just deleted the previewed file
        if (previewFile?.id === id) {
          setPreviewFile(null);
        }
      } finally {
        setDeletingId(null);
      }
    },
    [workspace, deleteMutation, previewFile]
  );

  const handleUploadComplete = useCallback(() => {
    utils.media.list.invalidate();
    setUploadOpen(false);
  }, [utils]);

  const allFiles = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Media Library</h1>
          <p className="text-sm text-muted-foreground">
            Manage your images and videos
          </p>
        </div>

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger
            render={
              <Button>
                <Upload className="size-4" data-icon="inline-start" />
                Upload
              </Button>
            }
          />
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload Media</DialogTitle>
              <DialogDescription>
                Upload images or videos to your media library.
              </DialogDescription>
            </DialogHeader>
            <MediaUpload onUploadComplete={handleUploadComplete} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Search bar */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by filename..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && allFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16">
          <ImagePlus className="mb-4 size-12 text-muted-foreground/50" />
          <h3 className="mb-1 text-lg font-medium">No media files yet</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {search
              ? "No files match your search. Try a different query."
              : "Upload your first image or video to get started."}
          </p>
          {!search && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="size-4" data-icon="inline-start" />
              Upload Files
            </Button>
          )}
        </div>
      )}

      {/* Media grid */}
      {!isLoading && allFiles.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {allFiles.map((file) => (
              <div
                key={file.id}
                className="group relative cursor-pointer overflow-hidden rounded-lg border bg-muted/30 transition-shadow hover:ring-2 hover:ring-primary/50"
                onClick={() => setPreviewFile(file)}
              >
                {/* Thumbnail */}
                <div className="relative aspect-square">
                  {file.mimeType.startsWith("image/") ? (
                    <Image
                      src={file.cdnUrl ?? file.url}
                      alt={file.filename}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-muted">
                      <FileVideo className="size-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* Type badge */}
                  <Badge
                    variant="secondary"
                    className="absolute top-1.5 left-1.5 text-[10px]"
                  >
                    {file.mimeType.startsWith("video/") ? "Video" : "Image"}
                  </Badge>

                  {/* Delete button */}
                  <Button
                    variant="destructive"
                    size="icon-xs"
                    className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(file.id);
                    }}
                    disabled={deletingId === file.id}
                  >
                    {deletingId === file.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </Button>
                </div>

                {/* File info */}
                <div className="p-2">
                  <p className="truncate text-xs font-medium">
                    {file.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Load more */}
          {hasNextPage && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2
                      className="size-4 animate-spin"
                      data-icon="inline-start"
                    />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Preview dialog */}
      <Dialog
        open={!!previewFile}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          {previewFile && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8">
                  {previewFile.filename}
                </DialogTitle>
                <DialogDescription>
                  {formatFileSize(previewFile.size)}
                  {previewFile.width && previewFile.height
                    ? ` — ${previewFile.width} x ${previewFile.height}`
                    : ""}
                  {" — "}
                  {formatDate(previewFile.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-center overflow-hidden rounded-lg bg-muted">
                {previewFile.mimeType.startsWith("image/") ? (
                  <Image
                    src={previewFile.url}
                    alt={previewFile.filename}
                    width={800}
                    height={600}
                    className="max-h-[60vh] w-full object-contain"
                  />
                ) : previewFile.mimeType.startsWith("video/") ? (
                  <video
                    src={previewFile.url}
                    controls
                    className="max-h-[60vh] w-full"
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <ImageIcon className="mb-2 size-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Preview not available
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(previewFile.id)}
                  disabled={deletingId === previewFile.id}
                >
                  {deletingId === previewFile.id ? (
                    <Loader2
                      className="size-4 animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <Trash2 className="size-4" data-icon="inline-start" />
                  )}
                  Delete
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
