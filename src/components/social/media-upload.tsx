"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, FileImage, FileVideo, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  preview?: string;
}

interface MediaFile {
  id: string;
  filename: string;
  url: string;
  cdnUrl: string | null;
  publicId: string | null;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  workspaceId: string;
  createdAt: Date;
}

interface MediaUploadProps {
  onUploadComplete?: (files: MediaFile[]) => void;
  maxFiles?: number;
  className?: string;
}

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaUpload({
  onUploadComplete,
  maxFiles = 10,
  className,
}: MediaUploadProps) {
  const { workspace } = useWorkspace();
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [completedFiles, setCompletedFiles] = useState<MediaFile[]>([]);

  const uploadFile = useCallback(
    async (file: File, fileId: string) => {
      if (!workspace) return;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspaceId", workspace.id);

      try {
        const xhr = new XMLHttpRequest();

        const uploadPromise = new Promise<MediaFile>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setUploadingFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId ? { ...f, progress } : f
                )
              );
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.error || "Upload failed"));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Network error during upload"));
          });

          xhr.open("POST", "/api/upload");
          xhr.send(formData);
        });

        const mediaFile = await uploadPromise;

        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: "done" as const, progress: 100 } : f
          )
        );

        return mediaFile;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upload failed";
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, status: "error" as const, error: message }
              : f
          )
        );
        return null;
      }
    },
    [workspace]
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!workspace) return;

      const newUploading: UploadingFile[] = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        progress: 0,
        status: "uploading" as const,
        preview: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined,
      }));

      setUploadingFiles((prev) => [...prev, ...newUploading]);

      const results = await Promise.all(
        newUploading.map((uf) => uploadFile(uf.file, uf.id))
      );

      const successfulUploads = results.filter(
        (r): r is MediaFile => r !== null
      );

      if (successfulUploads.length > 0) {
        setCompletedFiles((prev) => {
          const updated = [...prev, ...successfulUploads];
          onUploadComplete?.(updated);
          return updated;
        });
      }
    },
    [workspace, uploadFile, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_TYPES,
      maxSize: MAX_FILE_SIZE,
      maxFiles,
      disabled: !workspace,
    });

  const removeFile = (fileId: string) => {
    setUploadingFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== fileId);
    });
  };

  const activeUploads = uploadingFiles.filter((f) => f.status !== "done" || f.preview);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        aria-label="Upload media files by dragging and dropping or clicking to select"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          !workspace && "pointer-events-none opacity-50"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mb-3 size-8 text-muted-foreground" />
        {isDragActive ? (
          <p className="text-sm font-medium">Drop files here...</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              Drag & drop files here, or click to select
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, GIF, WebP, MP4, MOV — max {MAX_FILE_SIZE / 1024 / 1024}
              MB
            </p>
          </>
        )}
      </div>

      {/* File rejections */}
      {fileRejections.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="size-4" />
            Some files were rejected
          </div>
          <ul className="mt-1 space-y-1">
            {fileRejections.map(({ file, errors }) => (
              <li key={file.name} className="text-xs text-muted-foreground">
                <span className="font-medium">{file.name}</span>:{" "}
                {errors.map((e) => e.message).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload progress / previews */}
      {activeUploads.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {activeUploads.map((uf) => (
            <div
              key={uf.id}
              className="group relative overflow-hidden rounded-lg border bg-muted/30"
            >
              {/* Preview */}
              <div className="relative aspect-square">
                {uf.preview ? (
                  <Image
                    src={uf.preview}
                    alt={uf.file.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    {uf.file.type.startsWith("video/") ? (
                      <FileVideo className="size-8 text-muted-foreground" />
                    ) : (
                      <FileImage className="size-8 text-muted-foreground" />
                    )}
                  </div>
                )}

                {/* Uploading overlay */}
                {uf.status === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                    <Loader2 className="mb-2 size-5 animate-spin text-white" />
                    <span className="text-xs font-medium text-white">
                      {uf.progress}%
                    </span>
                    {/* Progress bar */}
                    <div
                      role="progressbar"
                      aria-valuenow={uf.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Uploading ${uf.file.name}`}
                      className="mt-1 h-1 w-3/4 overflow-hidden rounded-full bg-white/30"
                    >
                      <div
                        className="h-full rounded-full bg-white transition-all"
                        style={{ width: `${uf.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error overlay */}
                {uf.status === "error" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 p-2">
                    <AlertCircle className="mb-1 size-5 text-red-400" />
                    <span className="text-center text-xs text-red-300">
                      {uf.error}
                    </span>
                  </div>
                )}
              </div>

              {/* File info */}
              <div className="p-2">
                <p className="truncate text-xs font-medium">{uf.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(uf.file.size)}
                </p>
              </div>

              {/* Remove button */}
              {(uf.status === "done" || uf.status === "error") && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(uf.id);
                  }}
                >
                  <X className="size-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
