"use client";

import { type Platform } from "@prisma/client";
import { PLATFORM_CONFIG } from "./platform-selector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PostPreviewProps {
  content: string;
  hashtags: string[];
  platforms: Platform[];
}

export function PostPreview({ content, hashtags, platforms }: PostPreviewProps) {
  if (platforms.length === 0) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Select a platform to see the preview
          </p>
        </CardContent>
      </Card>
    );
  }

  const defaultPlatform = platforms[0];

  return (
    <Tabs defaultValue={defaultPlatform}>
      <TabsList variant="line">
        {platforms.map((platform) => {
          const config = PLATFORM_CONFIG[platform];
          const Icon = config.icon;
          return (
            <TabsTrigger key={platform} value={platform}>
              <Icon className={cn("size-3.5", config.color)} />
              <span className="hidden sm:inline">{config.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {platforms.map((platform) => (
        <TabsContent key={platform} value={platform}>
          <PlatformPreviewCard
            platform={platform}
            content={content}
            hashtags={hashtags}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PlatformPreviewCard({
  platform,
  content,
  hashtags,
}: {
  platform: Platform;
  content: string;
  hashtags: string[];
}) {
  const config = PLATFORM_CONFIG[platform];
  const Icon = config.icon;
  const isOverLimit = content.length > config.charLimit;
  const fullText = buildFullText(content, hashtags);

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardContent className="space-y-3">
        {/* Mock platform header */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-full bg-zinc-800"
            )}
          >
            <Icon className={cn("size-5", config.color)} />
          </div>
          <div>
            <p className="text-sm font-medium">Your Account</p>
            <p className="text-xs text-muted-foreground">Just now</p>
          </div>
        </div>

        {/* Content preview */}
        <div className="min-h-20 rounded-lg bg-zinc-800/50 p-3">
          {fullText ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {truncateForPlatform(fullText, config.charLimit)}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              Start writing to see the preview...
            </p>
          )}
        </div>

        {/* Character count */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {hashtags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                #{tag}
              </Badge>
            ))}
            {hashtags.length > 5 && (
              <Badge variant="outline" className="text-[10px]">
                +{hashtags.length - 5}
              </Badge>
            )}
          </div>
          <span
            className={cn(
              "text-xs tabular-nums",
              isOverLimit ? "font-semibold text-red-400" : "text-muted-foreground"
            )}
          >
            {content.length} / {config.charLimit}
          </span>
        </div>

        {isOverLimit && (
          <p className="text-xs text-red-400">
            Content exceeds {config.label} character limit by{" "}
            {content.length - config.charLimit} characters
          </p>
        )}

        {/* Mock engagement bar */}
        <div className="flex gap-6 border-t border-zinc-700 pt-3 text-xs text-muted-foreground">
          {platform === "TWITTER" ? (
            <>
              <span>Reply</span>
              <span>Repost</span>
              <span>Like</span>
              <span>Share</span>
            </>
          ) : platform === "LINKEDIN" ? (
            <>
              <span>Like</span>
              <span>Comment</span>
              <span>Repost</span>
              <span>Send</span>
            </>
          ) : (
            <>
              <span>Like</span>
              <span>Comment</span>
              <span>Share</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function buildFullText(content: string, hashtags: string[]): string {
  if (hashtags.length === 0) return content;
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return content ? `${content}\n\n${hashtagStr}` : hashtagStr;
}

function truncateForPlatform(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 3) + "...";
}
