"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type MetaVariant = "facebook" | "instagram";

interface MetaFeedPreviewProps {
  pageName: string;
  primaryText: string;
  headline: string;
  description: string;
  ctaText: string;
  imageUrl?: string;
  variant?: MetaVariant;
  className?: string;
}

const CHAR_LIMITS = {
  primaryText: 125,
  headline: 27,
  description: 27,
} as const;

function CharIndicator({
  current,
  max,
}: {
  current: number;
  max: number;
}) {
  const ratio = current / max;
  return (
    <span
      className={cn(
        "text-[11px] tabular-nums",
        ratio > 1
          ? "font-semibold text-red-500"
          : ratio > 0.9
            ? "text-amber-500"
            : "text-muted-foreground"
      )}
    >
      {current}/{max}
    </span>
  );
}

export function MetaFeedPreview({
  pageName,
  primaryText,
  headline,
  description,
  ctaText,
  imageUrl,
  variant = "facebook",
  className,
}: MetaFeedPreviewProps) {
  const isFacebook = variant === "facebook";

  return (
    <div className={cn("w-full max-w-[500px]", className)}>
      {/* Character limit indicators */}
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Primary:</span>
          <CharIndicator
            current={primaryText.length}
            max={CHAR_LIMITS.primaryText}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Headline:</span>
          <CharIndicator
            current={headline.length}
            max={CHAR_LIMITS.headline}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Description:</span>
          <CharIndicator
            current={description.length}
            max={CHAR_LIMITS.description}
          />
        </div>
      </div>

      {/* Feed Card */}
      <div
        className={cn(
          "overflow-hidden rounded-lg border shadow-sm",
          isFacebook
            ? "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-black"
        )}
      >
        {/* Header: avatar + page name + sponsored */}
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
          {/* Avatar */}
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
              isFacebook ? "bg-blue-600" : "bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400"
            )}
          >
            {pageName ? pageName.charAt(0).toUpperCase() : "P"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "truncate text-[15px] font-semibold",
                  isFacebook
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-900 dark:text-zinc-100"
                )}
              >
                {pageName || "Page Name"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[13px] text-zinc-500 dark:text-zinc-400">
              <span>Sponsorizzato</span>
              <span>·</span>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16A8 8 0 108 0a8 8 0 000 16zM4.5 7.5a1 1 0 112 0 1 1 0 01-2 0zm5 0a1 1 0 112 0 1 1 0 01-2 0z" opacity="0.6" />
              </svg>
            </div>
          </div>
          {/* More icon */}
          <button
            type="button"
            className="shrink-0 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            tabIndex={-1}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        </div>

        {/* Primary text */}
        <div className="px-4 pb-3">
          <p
            className={cn(
              "whitespace-pre-wrap text-[15px] leading-[20px]",
              isFacebook
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-900 dark:text-zinc-100"
            )}
          >
            {primaryText || "Your primary text goes here. Make it engaging and relevant to your audience."}
          </p>
        </div>

        {/* Image area */}
        <div className="relative aspect-square w-full bg-zinc-100 dark:bg-zinc-800">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt="Ad creative"
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <span className="text-sm font-medium">Ad Image</span>
              <span className="text-xs">1080 x 1080 px</span>
            </div>
          )}
        </div>

        {/* Below-image section */}
        <div
          className={cn(
            "border-t px-4 py-3",
            isFacebook
              ? "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50"
              : "border-zinc-200 dark:border-zinc-700"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {isFacebook && description && (
                <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                  {description}
                </p>
              )}
              <p
                className={cn(
                  "truncate font-semibold",
                  isFacebook
                    ? "text-[15px] text-zinc-900 dark:text-zinc-100"
                    : "text-[14px] text-zinc-900 dark:text-zinc-100"
                )}
              >
                {headline || "Your Headline"}
              </p>
              {!isFacebook && description && (
                <p className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                  {description}
                </p>
              )}
            </div>
            {/* CTA button */}
            <button
              type="button"
              tabIndex={-1}
              className={cn(
                "shrink-0 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
                isFacebook
                  ? "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-500"
                  : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              )}
            >
              {ctaText || "Learn More"}
            </button>
          </div>
        </div>

        {/* Engagement bar (Facebook only) */}
        {isFacebook && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 text-[13px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-0.5">
                <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-blue-500 text-[10px] text-white ring-2 ring-white dark:ring-zinc-900">
                  👍
                </span>
                <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-red-500 text-[10px] text-white ring-2 ring-white dark:ring-zinc-900">
                  ❤️
                </span>
              </div>
              <span>42</span>
            </div>
            <span>12 comments · 5 shares</span>
          </div>
        )}
      </div>
    </div>
  );
}

export { CHAR_LIMITS as META_CHAR_LIMITS };
export type { MetaVariant };
