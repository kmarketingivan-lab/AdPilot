"use client";

import { useState } from "react";
import {
  PlusIcon,
  SendIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  MailIcon,
  EyeIcon,
  BarChart3Icon,
  PencilIcon,
  Trash2Icon,
  ArrowRightIcon,
  Loader2Icon,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import dynamic from "next/dynamic";
import { blocksToHtml } from "@/components/email/email-builder";
import { cn } from "@/lib/utils";

const EmailBuilder = dynamic(
  () => import("@/components/email/email-builder").then((m) => ({ default: m.EmailBuilder })),
  { loading: () => <Skeleton className="h-96" /> },
);

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof MailIcon }
> = {
  DRAFT: {
    label: "Draft",
    color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    icon: PencilIcon,
  },
  SCHEDULED: {
    label: "Scheduled",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    icon: ClockIcon,
  },
  SENDING: {
    label: "Sending",
    color:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    icon: Loader2Icon,
  },
  SENT: {
    label: "Sent",
    color:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    icon: CheckCircleIcon,
  },
  CANCELLED: {
    label: "Cancelled",
    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    icon: AlertCircleIcon,
  },
};

// ---------------------------------------------------------------------------
// Wizard steps
// ---------------------------------------------------------------------------

type WizardStep = "list" | "content" | "details" | "preview";

interface CampaignFormData {
  name: string;
  subject: string;
  preheader: string;
  listId: string;
  htmlContent: string;
  scheduledAt: string;
}

const INITIAL_FORM: CampaignFormData = {
  name: "",
  subject: "",
  preheader: "",
  listId: "",
  htmlContent: "",
  scheduledAt: "",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EmailCampaignsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  // State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("list");
  const [formData, setFormData] = useState<CampaignFormData>(INITIAL_FORM);
  const [statsDialogId, setStatsDialogId] = useState<string | null>(null);
  const [previewCampaignId, setPreviewCampaignId] = useState<string | null>(null);

  // Queries
  const campaignsQuery = trpc.email["campaigns.list"].useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const listsQuery = trpc.email["lists.list"].useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const statsQuery = trpc.email["campaigns.getStats"].useQuery(
    { workspaceId, id: statsDialogId ?? "" },
    { enabled: !!workspaceId && !!statsDialogId }
  );

  const campaignDetailQuery = trpc.email["campaigns.get"].useQuery(
    { workspaceId, id: previewCampaignId ?? "" },
    { enabled: !!workspaceId && !!previewCampaignId }
  );

  // Mutations
  const createMutation = trpc.email["campaigns.create"].useMutation({
    onSuccess: () => {
      campaignsQuery.refetch();
      setWizardOpen(false);
      setFormData(INITIAL_FORM);
      setWizardStep("list");
    },
  });

  const sendMutation = trpc.email["campaigns.send"].useMutation({
    onSuccess: () => campaignsQuery.refetch(),
  });

  const scheduleMutation = trpc.email["campaigns.schedule"].useMutation({
    onSuccess: () => {
      campaignsQuery.refetch();
      setWizardOpen(false);
      setFormData(INITIAL_FORM);
      setWizardStep("list");
    },
  });

  const handleCreateAndSend = () => {
    createMutation.mutate(
      {
        workspaceId,
        name: formData.name,
        subject: formData.subject,
        preheader: formData.preheader || undefined,
        htmlContent: formData.htmlContent,
        listId: formData.listId,
      },
      {
        onSuccess: (campaign) => {
          if (formData.scheduledAt) {
            scheduleMutation.mutate({
              workspaceId,
              id: campaign.id,
              scheduledAt: new Date(formData.scheduledAt).toISOString(),
            });
          } else {
            sendMutation.mutate({ workspaceId, id: campaign.id });
          }
        },
      }
    );
  };

  const handleSaveDraft = () => {
    createMutation.mutate({
      workspaceId,
      name: formData.name,
      subject: formData.subject,
      preheader: formData.preheader || undefined,
      htmlContent: formData.htmlContent,
      listId: formData.listId,
    });
  };

  const selectedList = listsQuery.data?.find((l) => l.id === formData.listId);

  const openWizard = () => {
    setFormData(INITIAL_FORM);
    setWizardStep("list");
    setWizardOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Wizard view
  // ---------------------------------------------------------------------------

  if (wizardOpen) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Wizard header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">New Campaign</h1>
          <Button
            variant="outline"
            onClick={() => {
              setWizardOpen(false);
              setFormData(INITIAL_FORM);
              setWizardStep("list");
            }}
          >
            Cancel
          </Button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2">
          {(["list", "content", "details", "preview"] as WizardStep[]).map(
            (step, i) => {
              const steps: WizardStep[] = ["list", "content", "details", "preview"];
              const currentIndex = steps.indexOf(wizardStep);
              const isActive = step === wizardStep;
              const isDone = i < currentIndex;

              return (
                <div key={step} className="flex items-center gap-2">
                  {i > 0 && (
                    <div
                      className={cn(
                        "h-px w-8",
                        isDone || isActive ? "bg-primary" : "bg-border"
                      )}
                    />
                  )}
                  <button
                    onClick={() => {
                      if (isDone) setWizardStep(step);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                      isActive && "bg-primary text-primary-foreground",
                      isDone &&
                        "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20",
                      !isActive && !isDone && "text-muted-foreground"
                    )}
                  >
                    <span className="w-5 h-5 rounded-full border flex items-center justify-center text-xs">
                      {i + 1}
                    </span>
                    {step === "list"
                      ? "Select List"
                      : step === "content"
                        ? "Content"
                        : step === "details"
                          ? "Details"
                          : "Preview"}
                  </button>
                </div>
              );
            }
          )}
        </div>

        {/* Step: Select List */}
        {wizardStep === "list" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Select Email List</h2>
            {listsQuery.data && listsQuery.data.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {listsQuery.data.map((list) => (
                  <button
                    key={list.id}
                    onClick={() =>
                      setFormData((f) => ({ ...f, listId: list.id }))
                    }
                    className={cn(
                      "border rounded-lg p-4 text-left transition-all hover:shadow-sm",
                      formData.listId === list.id &&
                        "border-primary ring-2 ring-primary/20"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{list.name}</h3>
                      <Badge variant="secondary">
                        {list.subscriberCount} subscribers
                      </Badge>
                    </div>
                    {list.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {list.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                <p>No email lists found. Create one first.</p>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                disabled={!formData.listId}
                onClick={() => setWizardStep("content")}
              >
                Next
                <ArrowRightIcon className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Content (email builder) */}
        {wizardStep === "content" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Design Your Email</h2>
            <div className="h-[500px]">
              <EmailBuilder
                initialHtml={formData.htmlContent || undefined}
                onChange={(html) =>
                  setFormData((f) => ({ ...f, htmlContent: html }))
                }
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWizardStep("list")}>
                Back
              </Button>
              <Button
                disabled={!formData.htmlContent}
                onClick={() => setWizardStep("details")}
              >
                Next
                <ArrowRightIcon className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Details */}
        {wizardStep === "details" && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-semibold">Campaign Details</h2>
            <div>
              <Label>Campaign Name</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g., March Newsletter"
              />
            </div>
            <div>
              <Label>Subject Line</Label>
              <Input
                value={formData.subject}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, subject: e.target.value }))
                }
                placeholder="e.g., Check out our latest updates!"
              />
            </div>
            <div>
              <Label>Preheader (optional)</Label>
              <Input
                value={formData.preheader}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, preheader: e.target.value }))
                }
                placeholder="Preview text shown after the subject"
              />
            </div>
            <div>
              <Label>Schedule (optional — leave empty to send now)</Label>
              <Input
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, scheduledAt: e.target.value }))
                }
              />
            </div>
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setWizardStep("content")}
              >
                Back
              </Button>
              <Button
                disabled={!formData.name || !formData.subject}
                onClick={() => setWizardStep("preview")}
              >
                Next
                <ArrowRightIcon className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Preview & Send */}
        {wizardStep === "preview" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Preview & Send</h2>

            {/* Summary */}
            <div className="border rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Campaign</span>
                <span className="font-medium">{formData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subject</span>
                <span className="font-medium">{formData.subject}</span>
              </div>
              {formData.preheader && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Preheader</span>
                  <span className="font-medium">{formData.preheader}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sending to</span>
                <span className="font-medium">
                  {selectedList?.name} ({selectedList?.subscriberCount}{" "}
                  subscribers)
                </span>
              </div>
              {formData.scheduledAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scheduled for</span>
                  <span className="font-medium">
                    {new Date(formData.scheduledAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Email preview */}
            <div className="border rounded-lg overflow-hidden">
              <iframe
                srcDoc={formData.htmlContent}
                title="Campaign Preview"
                className="w-full border-0"
                style={{ minHeight: "400px" }}
              />
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setWizardStep("details")}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={createMutation.isPending}
                >
                  Save as Draft
                </Button>
                <Button
                  onClick={handleCreateAndSend}
                  disabled={
                    createMutation.isPending ||
                    sendMutation.isPending ||
                    scheduleMutation.isPending
                  }
                >
                  {createMutation.isPending ||
                  sendMutation.isPending ||
                  scheduleMutation.isPending ? (
                    <>
                      <Loader2Icon className="h-4 w-4 mr-1 animate-spin" />
                      Processing...
                    </>
                  ) : formData.scheduledAt ? (
                    <>
                      <ClockIcon className="h-4 w-4 mr-1" />
                      Schedule
                    </>
                  ) : (
                    <>
                      <SendIcon className="h-4 w-4 mr-1" />
                      Send Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Campaign list view
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Campaigns</h1>
          <p className="text-muted-foreground">
            Create, schedule, and track your email campaigns.
          </p>
        </div>
        <Button onClick={openWizard}>
          <PlusIcon className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {/* Campaigns table */}
      {campaignsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : !campaignsQuery.data || campaignsQuery.data.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <MailIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No campaigns yet</p>
          <p className="text-sm mt-1">
            Create your first email campaign to get started.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4 font-medium">Campaign</th>
                <th className="text-left py-3 px-4 font-medium">List</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Events</th>
                <th className="text-left py-3 px-4 font-medium">Date</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaignsQuery.data.map((campaign) => {
                const statusConf =
                  STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.DRAFT;
                const StatusIcon = statusConf.icon;

                return (
                  <tr
                    key={campaign.id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {campaign.subject}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {campaign.listName}
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={cn("gap-1", statusConf.color)}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConf.label}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {campaign.eventCount}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">
                      {campaign.sentAt
                        ? new Date(campaign.sentAt).toLocaleDateString()
                        : campaign.scheduledAt
                          ? `Scheduled: ${new Date(campaign.scheduledAt).toLocaleDateString()}`
                          : new Date(campaign.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1 justify-end">
                        {campaign.status === "DRAFT" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              sendMutation.mutate({
                                workspaceId,
                                id: campaign.id,
                              })
                            }
                          >
                            <SendIcon className="h-3 w-3 mr-1" />
                            Send
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatsDialogId(campaign.id)}
                        >
                          <BarChart3Icon className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewCampaignId(campaign.id)}
                        >
                          <EyeIcon className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats Dialog */}
      <Dialog
        open={!!statsDialogId}
        onOpenChange={(open) => {
          if (!open) setStatsDialogId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Campaign Stats</DialogTitle>
            <DialogDescription>
              Performance metrics for this campaign.
            </DialogDescription>
          </DialogHeader>
          {statsQuery.isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : statsQuery.data ? (
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 border rounded-lg">
                  <p className="text-2xl font-bold">{statsQuery.data.sent}</p>
                  <p className="text-xs text-muted-foreground">Sent</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <p className="text-2xl font-bold">
                    {statsQuery.data.delivered}
                  </p>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <p className="text-2xl font-bold">{statsQuery.data.opened}</p>
                  <p className="text-xs text-muted-foreground">Opened</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 border rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">
                    {statsQuery.data.openRate}%
                  </p>
                  <p className="text-xs text-muted-foreground">Open Rate</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <p className="text-2xl font-bold text-green-600">
                    {statsQuery.data.clickRate}%
                  </p>
                  <p className="text-xs text-muted-foreground">Click Rate</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <p className="text-2xl font-bold text-red-600">
                    {statsQuery.data.bounceRate}%
                  </p>
                  <p className="text-xs text-muted-foreground">Bounce Rate</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="flex justify-between px-2">
                  <span className="text-muted-foreground">Clicked</span>
                  <span>{statsQuery.data.clicked}</span>
                </div>
                <div className="flex justify-between px-2">
                  <span className="text-muted-foreground">Bounced</span>
                  <span>{statsQuery.data.bounced}</span>
                </div>
                <div className="flex justify-between px-2">
                  <span className="text-muted-foreground">Unsubs</span>
                  <span>{statsQuery.data.unsubscribed}</span>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatsDialogId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog
        open={!!previewCampaignId}
        onOpenChange={(open) => {
          if (!open) setPreviewCampaignId(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {campaignDetailQuery.data?.name ?? "Campaign Preview"}
            </DialogTitle>
            <DialogDescription>
              Subject: {campaignDetailQuery.data?.subject}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-md">
            {campaignDetailQuery.data && (
              <iframe
                srcDoc={campaignDetailQuery.data.htmlContent}
                title="Campaign Preview"
                className="w-full border-0"
                style={{ minHeight: "400px" }}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewCampaignId(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
