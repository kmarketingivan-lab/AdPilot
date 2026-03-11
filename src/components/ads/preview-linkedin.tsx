"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface LinkedInPreviewProps {
  companyName: string;
  introText: string;
  headline: string;
  imageUrl?: string;
  className?: string;
}

const CHAR_LIMITS = {
  introText: 150,
  headline: 70,
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

export function LinkedInPreview({
  companyName,
  introText,
  headline,
  imageUrl,
  className,
}: LinkedInPreviewProps) {
  return (
    <div className={cn("w-full max-w-[550px]", className)}>
      {/* Character limit indicators */}
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Intro:</span>
          <CharIndicator
            current={introText.length}
            max={CHAR_LIMITS.introText}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Headline:</span>
          <CharIndicator
            current={headline.length}
            max={CHAR_LIMITS.headline}
          />
        </div>
      </div>

      {/* LinkedIn Post Card */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header: logo + company + promoted */}
        <div className="flex items-start gap-2.5 px-4 pt-3 pb-2">
          {/* Company logo placeholder */}
          <div className="flex size-12 shrink-0 items-center justify-center rounded bg-[#0a66c2] text-base font-bold text-white">
            {companyName ? companyName.charAt(0).toUpperCase() : "C"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">
              {companyName || "Company Name"}
            </p>
            <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
              12,345 followers
            </p>
            <div className="flex items-center gap-1 text-[12px] text-zinc-500 dark:text-zinc-400">
              <span>Promoted</span>
              <span>·</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="text-zinc-400"
              >
                <path d="M8 1a7 7 0 107 7A7 7 0 008 1zm0 12.5A5.5 5.5 0 1113.5 8 5.51 5.51 0 018 13.5z" />
                <path d="M8 4a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-3.5A.75.75 0 008 4zM8 10a1 1 0 101 1 1 1 0 00-1-1z" opacity="0" />
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

        {/* Intro text */}
        <div className="px-4 pb-3">
          <p className="whitespace-pre-wrap text-[14px] leading-[20px] text-zinc-900 dark:text-zinc-100">
            {introText || "Your intro text goes here. Share something compelling about your product or service."}
          </p>
        </div>

        {/* Image area */}
        <div className="relative aspect-[1.91/1] w-full bg-zinc-100 dark:bg-zinc-800">
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
              <span className="text-xs">1200 x 628 px</span>
            </div>
          )}
        </div>

        {/* Below-image headline */}
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <p className="text-[14px] font-semibold leading-[18px] text-zinc-900 dark:text-zinc-100">
            {headline || "Your Ad Headline"}
          </p>
        </div>

        {/* Engagement bar */}
        <div className="border-t border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between px-4 py-1 text-[12px] text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-1">
              <span className="text-[14px]">👍</span>
              <span>38</span>
            </div>
            <span>6 comments</span>
          </div>
          <div className="grid grid-cols-4 border-t border-zinc-200 dark:border-zinc-700">
            {[
              { icon: "👍", label: "Like" },
              { icon: "💬", label: "Comment" },
              { icon: "🔄", label: "Repost" },
              { icon: "📨", label: "Send" },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                tabIndex={-1}
                className="flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <span>{action.icon}</span>
                <span className="hidden sm:inline">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { CHAR_LIMITS as LINKEDIN_CHAR_LIMITS };
