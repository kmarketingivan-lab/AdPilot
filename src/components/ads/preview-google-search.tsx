"use client";

import { cn } from "@/lib/utils";

interface GoogleSearchPreviewProps {
  headline: string;
  displayUrl: string;
  description: string;
  className?: string;
}

const CHAR_LIMITS = {
  headline: 30,
  description: 90,
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

export function GoogleSearchPreview({
  headline,
  displayUrl,
  description,
  className,
}: GoogleSearchPreviewProps) {
  const truncatedHeadline = headline.slice(0, CHAR_LIMITS.headline + 10);
  const truncatedDescription = description.slice(
    0,
    CHAR_LIMITS.description + 20
  );

  return (
    <div className={cn("w-full max-w-[600px]", className)}>
      {/* Character limit indicators */}
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
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

      {/* SERP Card */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        {/* Ad label + Display URL */}
        <div className="flex items-center gap-2">
          {/* Favicon placeholder */}
          <div className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="size-[18px] rounded-sm bg-zinc-300 dark:bg-zinc-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] leading-tight text-zinc-900 dark:text-zinc-100">
                {displayUrl
                  ? displayUrl.replace(/^https?:\/\//, "")
                  : "example.com"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-flex rounded border border-zinc-400 px-[3px] py-px text-[10px] font-bold leading-tight text-zinc-600 dark:border-zinc-500 dark:text-zinc-400">
                Sponsorizzato
              </span>
              <span className="truncate text-[12px] text-zinc-600 dark:text-zinc-400">
                {displayUrl || "https://example.com"}
              </span>
            </div>
          </div>
          {/* Three-dot menu */}
          <div className="ml-1 flex shrink-0 items-center">
            <svg
              className="text-zinc-500"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </div>
        </div>

        {/* Headline */}
        <h3 className="mt-2 cursor-pointer text-[20px] leading-[26px] font-normal text-[#1a0dab] hover:underline dark:text-[#8ab4f8]">
          {truncatedHeadline || "Your Ad Headline"}
        </h3>

        {/* Description */}
        <p className="mt-0.5 text-[14px] leading-[22px] text-zinc-600 dark:text-zinc-400">
          {truncatedDescription || "Your ad description will appear here. Write compelling copy to attract clicks."}
        </p>
      </div>
    </div>
  );
}

export { CHAR_LIMITS as GOOGLE_CHAR_LIMITS };
