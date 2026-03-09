"use client";

import { useState } from "react";
import {
  MailIcon,
  NewspaperIcon,
  MegaphoneIcon,
  BellIcon,
  CalendarIcon,
  RocketIcon,
  MessageSquareIcon,
  HeartIcon,
  PlusIcon,
  EyeIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import dynamic from "next/dynamic";
import { blocksToHtml, type EmailBlock } from "@/components/email/email-builder";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const EmailBuilder = dynamic(
  () => import("@/components/email/email-builder").then((m) => ({ default: m.EmailBuilder })),
  { loading: () => <Skeleton className="h-96" /> },
);

// ---------------------------------------------------------------------------
// Predefined template metadata (matches the router's PREDEFINED_TEMPLATES)
// ---------------------------------------------------------------------------

const TEMPLATE_ICONS: Record<string, typeof MailIcon> = {
  welcome: MailIcon,
  newsletter: NewspaperIcon,
  promo: MegaphoneIcon,
  announcement: BellIcon,
  "event-invite": CalendarIcon,
  "product-launch": RocketIcon,
  feedback: MessageSquareIcon,
  "re-engagement": HeartIcon,
};

const TEMPLATE_COLORS: Record<string, string> = {
  welcome: "bg-blue-500",
  newsletter: "bg-slate-700",
  promo: "bg-purple-600",
  announcement: "bg-gray-900",
  "event-invite": "bg-emerald-600",
  "product-launch": "bg-red-600",
  feedback: "bg-amber-500",
  "re-engagement": "bg-indigo-500",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EmailTemplatesPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderInitialHtml, setBuilderInitialHtml] = useState<string>("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [pendingSaveHtml, setPendingSaveHtml] = useState("");

  // Queries
  const predefinedQuery = trpc.email["templates.listPredefined"].useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const customQuery = trpc.email["templates.listCustom"].useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const predefinedDetailQuery = trpc.email["templates.getPredefined"].useQuery(
    { workspaceId, id: previewTemplateId ?? "" },
    { enabled: !!workspaceId && !!previewTemplateId }
  );

  // Mutations
  const saveCustomMutation = trpc.email["templates.saveCustom"].useMutation({
    onSuccess: () => {
      customQuery.refetch();
      setSaveDialogOpen(false);
      setSaveName("");
    },
  });

  const deleteCustomMutation = trpc.email["templates.deleteCustom"].useMutation({
    onSuccess: () => customQuery.refetch(),
  });

  const utils = trpc.useUtils();

  const handleUseTemplate = (html: string) => {
    setBuilderInitialHtml(html);
    setPreviewTemplateId(null);
    setBuilderOpen(true);
  };

  const handleSaveFromBuilder = (html: string) => {
    setPendingSaveHtml(html);
    setSaveDialogOpen(true);
  };

  const confirmSave = () => {
    if (!saveName.trim()) return;
    saveCustomMutation.mutate({
      workspaceId,
      name: saveName,
      category: "custom",
      html: pendingSaveHtml,
    });
  };

  // ─── Builder full-screen view ───
  if (builderOpen) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between p-3 border-b">
          <h2 className="font-semibold">Email Builder</h2>
          <Button variant="outline" size="sm" onClick={() => setBuilderOpen(false)}>
            <XIcon className="h-4 w-4 mr-1" />
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">
          <EmailBuilder
            initialHtml={builderInitialHtml}
            onSave={handleSaveFromBuilder}
          />
        </div>

        {/* Save dialog */}
        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save as Template</DialogTitle>
              <DialogDescription>
                Give your template a name to save it for future use.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label>Template Name</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="My custom template"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={confirmSave}
                disabled={!saveName.trim() || saveCustomMutation.isPending}
              >
                {saveCustomMutation.isPending ? "Saving..." : "Save Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Template gallery ───
  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
          <p className="text-muted-foreground">
            Choose a template to get started or build from scratch.
          </p>
        </div>
        <Button onClick={() => { setBuilderInitialHtml(""); setBuilderOpen(true); }}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Build from Scratch
        </Button>
      </div>

      {/* Predefined templates */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Starter Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {predefinedQuery.data?.map((template) => {
            const Icon = TEMPLATE_ICONS[template.id] ?? MailIcon;
            const color = TEMPLATE_COLORS[template.id] ?? "bg-gray-500";

            return (
              <div
                key={template.id}
                className="group border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              >
                {/* Thumbnail area */}
                <div className={cn("h-32 flex items-center justify-center", color)}>
                  <Icon className="h-12 w-12 text-white/80" />
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold">{template.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {template.description}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewTemplateId(template.id)}
                    >
                      <EyeIcon className="h-3 w-3 mr-1" />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        // Fetch full template then open builder
                        utils.email["templates.getPredefined"]
                          .fetch({ workspaceId, id: template.id })
                          .then((t) => handleUseTemplate(t.html));
                      }}
                    >
                      Use Template
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Custom templates */}
      <section>
        <h2 className="text-lg font-semibold mb-4">My Templates</h2>
        {customQuery.data && customQuery.data.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {customQuery.data.map((template) => (
              <div
                key={template.id}
                className="group border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="h-32 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-950 dark:to-indigo-950 flex items-center justify-center">
                  <MailIcon className="h-10 w-10 text-blue-500/50" />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">{template.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {new Date(template.createdAt).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={() => handleUseTemplate(template.htmlContent)}
                    >
                      Use Template
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        deleteCustomMutation.mutate({
                          workspaceId,
                          id: template.id,
                        })
                      }
                    >
                      <Trash2Icon className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            <MailIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No custom templates yet. Save one from the builder.</p>
          </div>
        )}
      </section>

      {/* Preview modal */}
      <Dialog
        open={!!previewTemplateId}
        onOpenChange={(open) => {
          if (!open) setPreviewTemplateId(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              Preview how this template will look in an email client.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-md">
            {predefinedDetailQuery.data && (
              <iframe
                srcDoc={predefinedDetailQuery.data.html}
                title="Template Preview"
                className="w-full border-0"
                style={{ minHeight: "400px" }}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplateId(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (predefinedDetailQuery.data) {
                  handleUseTemplate(predefinedDetailQuery.data.html);
                }
              }}
            >
              Use This Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
