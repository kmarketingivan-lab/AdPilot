"use client";

import { useState } from "react";
import { Sparkles, ExternalLink, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

export function GenerateLandingDialog() {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<{
    id: string;
    url: string;
    previewUrl: string;
  } | null>(null);

  const generateMutation = trpc.integrations.generateLanding.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success("Landing page generata con successo!");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deployMutation = trpc.integrations.deployLanding.useMutation({
    onSuccess: (data) => {
      toast.success("Landing page pubblicata!");
      setResult(null);
      setPrompt("");
      setOpen(false);
      window.open(data.url, "_blank");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleGenerate = () => {
    if (!workspace) return;
    generateMutation.mutate({
      workspaceId: workspace.id,
      prompt,
    });
  };

  const handleDeploy = () => {
    if (!workspace || !result) return;
    deployMutation.mutate({
      workspaceId: workspace.id,
      pageId: result.id,
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setResult(null);
      setPrompt("");
    }
  };

  const isLoading = generateMutation.isPending || deployMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            Genera Landing Page
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Genera Landing Page</DialogTitle>
          <DialogDescription>
            Descrivi la landing page che vuoi creare. Webby la generer&agrave;
            automaticamente dal tuo prompt in italiano.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Textarea
            placeholder="Es: Crea una landing page per un corso di marketing digitale con form di iscrizione, testimonianze e sezione prezzi..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            disabled={isLoading}
          />

          {result && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
              <p className="text-sm text-zinc-300">
                Anteprima disponibile:
              </p>
              <a
                href={result.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {result.previewUrl}
              </a>
            </div>
          )}
        </div>

        <DialogFooter>
          {!result ? (
            <Button
              onClick={handleGenerate}
              disabled={prompt.length < 10 || isLoading}
            >
              {generateMutation.isPending ? "Generazione..." : "Genera"}
            </Button>
          ) : (
            <Button onClick={handleDeploy} disabled={isLoading}>
              <Rocket className="mr-2 h-4 w-4" />
              {deployMutation.isPending ? "Pubblicazione..." : "Pubblica"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
