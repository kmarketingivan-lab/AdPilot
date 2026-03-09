"use client";

import { type Platform } from "@prisma/client";
import {
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  Music2,
  Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const PLATFORM_CONFIG: Record<
  Platform,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    charLimit: number;
  }
> = {
  FACEBOOK: {
    label: "Facebook",
    icon: Facebook,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20",
    charLimit: 63206,
  },
  INSTAGRAM: {
    label: "Instagram",
    icon: Instagram,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10 border-pink-500/30 hover:bg-pink-500/20",
    charLimit: 2200,
  },
  LINKEDIN: {
    label: "LinkedIn",
    icon: Linkedin,
    color: "text-sky-600",
    bgColor: "bg-sky-600/10 border-sky-600/30 hover:bg-sky-600/20",
    charLimit: 3000,
  },
  TWITTER: {
    label: "Twitter / X",
    icon: Twitter,
    color: "text-zinc-300",
    bgColor: "bg-zinc-400/10 border-zinc-400/30 hover:bg-zinc-400/20",
    charLimit: 280,
  },
  TIKTOK: {
    label: "TikTok",
    icon: Music2,
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10 border-emerald-400/30 hover:bg-emerald-400/20",
    charLimit: 2200,
  },
  YOUTUBE: {
    label: "YouTube",
    icon: Youtube,
    color: "text-red-500",
    bgColor: "bg-red-500/10 border-red-500/30 hover:bg-red-500/20",
    charLimit: 5000,
  },
};

interface PlatformSelectorProps {
  selected: Platform[];
  onChange: (platforms: Platform[]) => void;
  contentLength?: number;
  disabled?: boolean;
}

export function PlatformSelector({
  selected,
  onChange,
  contentLength = 0,
  disabled = false,
}: PlatformSelectorProps) {
  function togglePlatform(platform: Platform) {
    if (disabled) return;
    if (selected.includes(platform)) {
      onChange(selected.filter((p) => p !== platform));
    } else {
      onChange([...selected, platform]);
    }
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-zinc-300">Platforms</label>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PLATFORM_CONFIG) as Platform[]).map((platform) => {
          const config = PLATFORM_CONFIG[platform];
          const isSelected = selected.includes(platform);
          const isOverLimit = contentLength > config.charLimit;
          const Icon = config.icon;

          return (
            <Button
              key={platform}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className={cn(
                "gap-1.5 border transition-all",
                isSelected && config.bgColor,
                isSelected && "border-current",
                !isSelected && "opacity-50"
              )}
              onClick={() => togglePlatform(platform)}
            >
              <Icon
                className={cn("size-3.5", isSelected && config.color)}
              />
              <span className={cn(isSelected && config.color)}>
                {config.label}
              </span>
              {isSelected && contentLength > 0 && (
                <span
                  className={cn(
                    "ml-1 text-[10px] tabular-nums",
                    isOverLimit
                      ? "font-semibold text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  {contentLength}/{config.charLimit}
                </span>
              )}
            </Button>
          );
        })}
      </div>
      {selected.length > 0 && contentLength > 0 && (
        <CharLimitWarnings
          selected={selected}
          contentLength={contentLength}
        />
      )}
    </div>
  );
}

function CharLimitWarnings({
  selected,
  contentLength,
}: {
  selected: Platform[];
  contentLength: number;
}) {
  const overLimitPlatforms = selected.filter(
    (p) => contentLength > PLATFORM_CONFIG[p].charLimit
  );

  if (overLimitPlatforms.length === 0) return null;

  return (
    <div className="space-y-1">
      {overLimitPlatforms.map((platform) => {
        const config = PLATFORM_CONFIG[platform];
        const over = contentLength - config.charLimit;
        return (
          <p
            key={platform}
            className="text-xs text-red-400"
          >
            {config.label}: {over} characters over limit ({config.charLimit} max)
          </p>
        );
      })}
    </div>
  );
}
