"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  PlusIcon,
  MinusIcon,
  XIcon,
  MailIcon,
  PhoneIcon,
  BuildingIcon,
  BriefcaseIcon,
  Trash2Icon,
} from "lucide-react";
import type { PipelineStage, ActivityType } from "@prisma/client";

import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { NotesPanel } from "@/components/crm/notes-panel";
import { ContactSessions } from "@/components/crm/contact-sessions";

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGES: PipelineStage[] = [
  "LEAD",
  "MQL",
  "SQL",
  "OPPORTUNITY",
  "CUSTOMER",
  "LOST",
];

const STAGE_COLORS: Record<PipelineStage, string> = {
  LEAD: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  MQL: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  SQL: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  OPPORTUNITY: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  CUSTOMER: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  LOST: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: "CALL", label: "Call" },
  { value: "MEETING", label: "Meeting" },
  { value: "NOTE", label: "Note" },
  { value: "EMAIL_SENT", label: "Email Sent" },
];

function getInitials(first?: string | null, last?: string | null): string {
  return [first?.[0], last?.[0]].filter(Boolean).join("").toUpperCase() || "?";
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const [tagInput, setTagInput] = useState("");
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);

  const utils = trpc.useUtils();

  // ─── Queries ───────────────────────────────────────────────────────────────

  const contactQuery = trpc.crm.getContact.useQuery(
    { workspaceId, contactId: id },
    { enabled: !!workspaceId && !!id }
  );

  const timelineQuery = trpc.crm.getTimeline.useQuery(
    { workspaceId, contactId: id, limit: 20 },
    { enabled: !!workspaceId && !!id }
  );

  const contact = contactQuery.data;

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const updateMutation = trpc.crm.updateContact.useMutation({
    onSuccess: () => utils.crm.getContact.invalidate(),
  });

  const addActivityMutation = trpc.crm.addActivity.useMutation({
    onSuccess: () => {
      setActivityDialogOpen(false);
      utils.crm.getTimeline.invalidate();
    },
  });

  const deleteMutation = trpc.crm.deleteContact.useMutation({
    onSuccess: () => router.push("/dashboard/crm"),
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleStageChange = useCallback(
    (stage: string) => {
      if (!contact) return;
      updateMutation.mutate({
        workspaceId,
        contactId: id,
        stage: stage as PipelineStage,
      });
    },
    [contact, workspaceId, id, updateMutation]
  );

  const handleScoreChange = useCallback(
    (delta: number) => {
      if (!contact) return;
      const newScore = Math.max(0, contact.score + delta);
      updateMutation.mutate({
        workspaceId,
        contactId: id,
        score: newScore,
      });
    },
    [contact, workspaceId, id, updateMutation]
  );

  const handleAddTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter" || !tagInput.trim() || !contact) return;
      e.preventDefault();
      const newTag = tagInput.trim();
      if (contact.tags.includes(newTag)) {
        setTagInput("");
        return;
      }
      updateMutation.mutate({
        workspaceId,
        contactId: id,
        tags: [...contact.tags, newTag],
      });
      setTagInput("");
    },
    [tagInput, contact, workspaceId, id, updateMutation]
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      if (!contact) return;
      updateMutation.mutate({
        workspaceId,
        contactId: id,
        tags: contact.tags.filter((t) => t !== tag),
      });
    },
    [contact, workspaceId, id, updateMutation]
  );

  const handleLogActivity = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      addActivityMutation.mutate({
        workspaceId,
        contactId: id,
        type: formData.get("type") as ActivityType,
        description: (formData.get("description") as string) || undefined,
      });
    },
    [workspaceId, id, addActivityMutation]
  );

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (contactQuery.isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-6">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">Contact not found.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/crm")}>
          <ArrowLeftIcon className="size-4" />
          Back to Contacts
        </Button>
      </div>
    );
  }

  const fullName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.email;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => router.push("/dashboard/crm")}
      >
        <ArrowLeftIcon className="size-4" />
        Back to Contacts
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar size="lg">
            {contact.avatarUrl && (
              <AvatarImage src={contact.avatarUrl} alt={fullName} />
            )}
            <AvatarFallback>
              {getInitials(contact.firstName, contact.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {fullName}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {contact.email && (
                <span className="flex items-center gap-1">
                  <MailIcon className="size-3.5" />
                  {contact.email}
                </span>
              )}
              {contact.phone && (
                <span className="flex items-center gap-1">
                  <PhoneIcon className="size-3.5" />
                  {contact.phone}
                </span>
              )}
              {contact.company && (
                <span className="flex items-center gap-1">
                  <BuildingIcon className="size-3.5" />
                  {contact.company}
                </span>
              )}
              {contact.jobTitle && (
                <span className="flex items-center gap-1">
                  <BriefcaseIcon className="size-3.5" />
                  {contact.jobTitle}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={activityDialogOpen} onOpenChange={setActivityDialogOpen}>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <PlusIcon className="size-4" />
              Log Activity
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log Activity</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleLogActivity} className="flex flex-col gap-3">
                <select
                  name="type"
                  required
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Textarea
                  name="description"
                  placeholder="Add details..."
                  className="min-h-20"
                />
                <DialogFooter>
                  <Button type="submit" disabled={addActivityMutation.isPending}>
                    {addActivityMutation.isPending ? "Saving..." : "Log Activity"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Button
            variant="destructive"
            size="icon-sm"
            onClick={() => {
              if (confirm("Delete this contact?")) {
                deleteMutation.mutate({ workspaceId, contactId: id });
              }
            }}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>

      {/* Stage + Score + Tags row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Stage */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Stage:
          </span>
          <Select value={contact.stage} onValueChange={(v) => v && handleStageChange(v)}>
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  <Badge
                    className={cn(
                      "border-transparent font-medium",
                      STAGE_COLORS[s]
                    )}
                  >
                    {s}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Score */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Score:
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => handleScoreChange(-1)}
              disabled={contact.score <= 0}
            >
              <MinusIcon className="size-3" />
            </Button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">
              {contact.score}
            </span>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => handleScoreChange(1)}
            >
              <PlusIcon className="size-3" />
            </Button>
          </div>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">
            Tags:
          </span>
          {contact.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="ml-0.5 rounded-full hover:bg-foreground/10"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
          <Input
            placeholder="Add tag..."
            className="h-6 w-24 text-xs"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
          />
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        {/* ─── Overview tab ─────────────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid gap-4 pt-4 md:grid-cols-2">
            {/* Contact info card */}
            <Card size="sm">
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="font-medium">{contact.email}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-medium">{contact.phone || "\u2014"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Company</dt>
                    <dd className="font-medium">
                      {contact.company || "\u2014"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Job Title</dt>
                    <dd className="font-medium">
                      {contact.jobTitle || "\u2014"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd>
                      {contact.source ? (
                        <Badge variant="outline">
                          {contact.source.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        "\u2014"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="font-medium">
                      {new Date(contact.createdAt).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {/* Recent activity card */}
            <Card size="sm">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {contact.activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No recent activity.
                  </p>
                ) : (
                  <ActivityTimeline
                    activities={contact.activities.slice(0, 5)}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Timeline tab ─────────────────────────────────────────────── */}
        <TabsContent value="timeline">
          <div className="pt-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {timelineQuery.isLoading ? (
                  <div className="flex flex-col gap-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="size-8 rounded-full" />
                        <div className="flex flex-col gap-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ActivityTimeline
                    activities={timelineQuery.data?.activities ?? []}
                    hasMore={!!timelineQuery.data?.nextCursor}
                    onLoadMore={() => {
                      // For cursor-based pagination, refetch with the cursor
                      // In a real app you'd accumulate pages; simplified here
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Notes tab ─────────────────────────────────────────────── */}
        <TabsContent value="notes">
          <NotesPanel contactId={id} />
        </TabsContent>

        {/* ─── Sessions tab (heatmap sessions linked to contact) ─────── */}
        <TabsContent value="sessions">
          <ContactSessions contactId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
