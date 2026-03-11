"use client";

import { cn } from "@/lib/utils";
import type { Platform, PostStatus } from "@prisma/client";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  TwitterIcon,
  YoutubeIcon,
  MusicIcon,
} from "lucide-react";

const STATUS_COLORS: Record<PostStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  REVIEW: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  PUBLISHING: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800",
  PUBLISHED: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800",
  FAILED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
};

function PlatformIcon({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  const iconClass = cn("size-3 shrink-0", className);
  switch (platform) {
    case "FACEBOOK":
      return <FacebookIcon className={iconClass} />;
    case "INSTAGRAM":
      return <InstagramIcon className={iconClass} />;
    case "LINKEDIN":
      return <LinkedinIcon className={iconClass} />;
    case "TWITTER":
      return <TwitterIcon className={iconClass} />;
    case "YOUTUBE":
      return <YoutubeIcon className={iconClass} />;
    case "TIKTOK":
      return <MusicIcon className={iconClass} />;
    default:
      return null;
  }
}

export interface PostChipProps {
  content: string;
  status: PostStatus;
  platforms: { platform: Platform }[];
  onClick?: () => void;
  className?: string;
}

export function PostChip({
  content,
  status,
  platforms,
  onClick,
  className,
}: PostChipProps) {
  const truncated =
    content.length > 30 ? content.slice(0, 30) + "..." : content;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:opacity-80",
        STATUS_COLORS[status],
        className
      )}
    >
      {platforms.length > 0 && (
        <PlatformIcon platform={platforms[0].platform} />
      )}
      {platforms.length > 1 && (
        <span className="text-[10px] opacity-60">+{platforms.length - 1}</span>
      )}
      <span className="min-w-0 truncate">{truncated}</span>
    </button>
  );
}

export { PlatformIcon, STATUS_COLORS };
