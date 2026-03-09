"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { type Platform } from "@prisma/client";
import {
  Sparkles,
  CalendarIcon,
  Clock,
  Save,
  Send,
  Loader2,
  X,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

import { PlatformSelector, PLATFORM_CONFIG } from "@/components/social/platform-selector";
import { PostPreview } from "@/components/social/post-preview";

type Tone = "professional" | "casual" | "humorous" | "inspirational";

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "humorous", label: "Humorous" },
  { value: "inspirational", label: "Inspirational" },
];

export default function ComposePostPage() {
  const router = useRouter();
  const { workspace } = useWorkspace();

  // Form state
  const [content, setContent] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [useSchedule, setUseSchedule] = useState(false);

  // AI generation state
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState<Tone>("professional");
  const [showAiPanel, setShowAiPanel] = useState(false);

  // tRPC mutations
  const createPost = trpc.post.create.useMutation({
    onSuccess: () => {
      toast.success("Post created successfully");
      router.push("/dashboard/social");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const generateCaption = trpc.post.generateCaption.useMutation({
    onSuccess: (data) => {
      setContent(data.caption);
      setShowAiPanel(false);
      toast.success("Caption generated!");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Derived state
  const contentLength = content.length;

  const minCharLimit = useMemo(() => {
    if (selectedPlatforms.length === 0) return Infinity;
    return Math.min(
      ...selectedPlatforms.map((p) => PLATFORM_CONFIG[p].charLimit)
    );
  }, [selectedPlatforms]);

  const isOverAnyLimit = useMemo(() => {
    return selectedPlatforms.some(
      (p) => contentLength > PLATFORM_CONFIG[p].charLimit
    );
  }, [selectedPlatforms, contentLength]);

  const canSubmit =
    content.trim().length > 0 &&
    selectedPlatforms.length > 0 &&
    !isOverAnyLimit &&
    !createPost.isPending;

  // Handlers
  const handleAddHashtag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter" && e.key !== ",") return;
      e.preventDefault();

      const raw = hashtagInput.trim().replace(/^#/, "").replace(/,$/g, "");
      if (!raw) return;

      // Support comma-separated input
      const tags = raw
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter((t) => t.length > 0 && !hashtags.includes(t));

      if (tags.length > 0) {
        setHashtags((prev) => [...prev, ...tags]);
      }
      setHashtagInput("");
    },
    [hashtagInput, hashtags]
  );

  const handleRemoveHashtag = useCallback((tag: string) => {
    setHashtags((prev) => prev.filter((t) => t !== tag));
  }, []);

  function getScheduledAt(): string | undefined {
    if (!useSchedule || !scheduleDate) return undefined;
    const [hours, minutes] = scheduleTime.split(":").map(Number);
    const dt = new Date(scheduleDate);
    dt.setHours(hours, minutes, 0, 0);
    return dt.toISOString();
  }

  function handleSaveDraft() {
    if (!workspace) return;
    createPost.mutate({
      workspaceId: workspace.id,
      content,
      hashtags,
      platforms: selectedPlatforms,
      scheduledAt: getScheduledAt(),
      status: "DRAFT",
    });
  }

  function handleSchedule() {
    if (!workspace || !scheduleDate) {
      toast.error("Select a date and time to schedule");
      return;
    }
    createPost.mutate({
      workspaceId: workspace.id,
      content,
      hashtags,
      platforms: selectedPlatforms,
      scheduledAt: getScheduledAt(),
      status: "SCHEDULED",
    });
  }

  function handlePublishNow() {
    if (!workspace) return;
    createPost.mutate({
      workspaceId: workspace.id,
      content,
      hashtags,
      platforms: selectedPlatforms,
      status: "PUBLISHING",
    });
  }

  function handleGenerateCaption() {
    if (!workspace) return;
    if (!aiTopic.trim()) {
      toast.error("Enter a topic for the AI caption");
      return;
    }
    generateCaption.mutate({
      workspaceId: workspace.id,
      platform: selectedPlatforms[0] ?? "INSTAGRAM",
      topic: aiTopic,
      tone: aiTone,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compose Post</h1>
          <p className="text-sm text-muted-foreground">
            Create and schedule a new social media post
          </p>
        </div>
        <StatusIndicator
          hasContent={content.trim().length > 0}
          hasPlatforms={selectedPlatforms.length > 0}
          isOverLimit={isOverAnyLimit}
          isScheduled={useSchedule && !!scheduleDate}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left column: Editor */}
        <div className="space-y-6">
          {/* Content editor */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Content</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowAiPanel(!showAiPanel)}
                >
                  <Sparkles className="size-3.5 text-purple-400" />
                  Generate with AI
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* AI Generation Panel */}
              {showAiPanel && (
                <div className="space-y-3 rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-purple-300">
                      AI Caption Generator
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setShowAiPanel(false)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Describe what your post is about..."
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {TONES.map((tone) => (
                      <Button
                        key={tone.value}
                        type="button"
                        variant={aiTone === tone.value ? "default" : "outline"}
                        size="xs"
                        onClick={() => setAiTone(tone.value)}
                      >
                        {tone.label}
                      </Button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={handleGenerateCaption}
                    disabled={generateCaption.isPending || !aiTopic.trim()}
                  >
                    {generateCaption.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {generateCaption.isPending ? "Generating..." : "Generate Caption"}
                  </Button>
                </div>
              )}

              {/* Textarea */}
              <div className="relative">
                <Textarea
                  placeholder="What's on your mind?"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-40 resize-y border-zinc-700 bg-zinc-800/50"
                  rows={6}
                />
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      isOverAnyLimit
                        ? "font-semibold text-red-400"
                        : contentLength > minCharLimit * 0.9
                          ? "text-yellow-400"
                          : "text-muted-foreground"
                    )}
                  >
                    {contentLength.toLocaleString()}
                    {selectedPlatforms.length > 0 && (
                      <> / {minCharLimit.toLocaleString()}</>
                    )}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Hashtags */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">
                  Hashtags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveHashtag(tag)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-zinc-600"
                      >
                        <X className="size-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  placeholder="Add hashtags (press Enter or use commas)"
                  value={hashtagInput}
                  onChange={(e) => setHashtagInput(e.target.value)}
                  onKeyDown={handleAddHashtag}
                  className="border-zinc-700 bg-zinc-800/50"
                />
              </div>
            </CardContent>
          </Card>

          {/* Platform selector */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="pt-4">
              <PlatformSelector
                selected={selectedPlatforms}
                onChange={setSelectedPlatforms}
                contentLength={contentLength}
                disabled={createPost.isPending}
              />
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-zinc-400" />
                Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant={!useSchedule ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUseSchedule(false)}
                >
                  Publish Now
                </Button>
                <Button
                  type="button"
                  variant={useSchedule ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUseSchedule(true)}
                >
                  <CalendarIcon className="size-3.5" />
                  Schedule
                </Button>
              </div>

              {useSchedule && (
                <div className="flex flex-wrap gap-3">
                  <Popover>
                    <PopoverTrigger>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-[200px] justify-start gap-2"
                      >
                        <CalendarIcon className="size-3.5 text-zinc-400" />
                        {scheduleDate ? (
                          scheduleDate.toLocaleDateString("it-IT", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        ) : (
                          <span className="text-muted-foreground">
                            Pick a date
                          </span>
                        )}
                        <ChevronDown className="ml-auto size-3 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={setScheduleDate}
                        disabled={(date) => date < new Date()}
                      />
                    </PopoverContent>
                  </Popover>

                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-[130px] border-zinc-700 bg-zinc-800/50"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={handleSaveDraft}
              disabled={!canSubmit}
            >
              {createPost.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Save as Draft
            </Button>

            {useSchedule ? (
              <Button
                type="button"
                className="gap-1.5"
                onClick={handleSchedule}
                disabled={!canSubmit || !scheduleDate}
              >
                {createPost.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CalendarIcon className="size-3.5" />
                )}
                Schedule Post
              </Button>
            ) : (
              <Button
                type="button"
                className="gap-1.5"
                onClick={handlePublishNow}
                disabled={!canSubmit}
              >
                {createPost.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Publish Now
              </Button>
            )}
          </div>
        </div>

        {/* Right column: Preview */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-300">Preview</h2>
          <PostPreview
            content={content}
            hashtags={hashtags}
            platforms={selectedPlatforms}
          />
        </div>
      </div>
    </div>
  );
}

function StatusIndicator({
  hasContent,
  hasPlatforms,
  isOverLimit,
  isScheduled,
}: {
  hasContent: boolean;
  hasPlatforms: boolean;
  isOverLimit: boolean;
  isScheduled: boolean;
}) {
  let label: string;
  let dotClass: string;

  if (isOverLimit) {
    label = "Over limit";
    dotClass = "bg-red-400";
  } else if (!hasContent && !hasPlatforms) {
    label = "Empty";
    dotClass = "bg-zinc-500";
  } else if (!hasContent) {
    label = "No content";
    dotClass = "bg-yellow-400";
  } else if (!hasPlatforms) {
    label = "No platforms";
    dotClass = "bg-yellow-400";
  } else if (isScheduled) {
    label = "Ready to schedule";
    dotClass = "bg-blue-400";
  } else {
    label = "Ready";
    dotClass = "bg-green-400";
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-1">
      <div className={cn("size-2 rounded-full", dotClass)} />
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  );
}
