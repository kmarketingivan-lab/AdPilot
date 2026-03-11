"use client";

import { useState } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  Building2,
  Save,
  Trash2,
  AlertTriangle,
} from "lucide-react";

export default function SettingsGeneralPage() {
  const { workspace } = useWorkspace();
  const utils = trpc.useUtils();

  const { data: settings, isLoading } = trpc.settings.getGeneral.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace }
  );

  const updateMutation = trpc.settings.updateGeneral.useMutation({
    onSuccess: () => {
      utils.settings.getGeneral.invalidate();
      utils.workspace.list.invalidate();
    },
  });

  const deleteMutation = trpc.settings.deleteWorkspace.useMutation({
    onSuccess: () => {
      window.location.href = "/dashboard";
    },
  });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  // Sync from server
  const initialized = name || slug;
  if (settings && !initialized) {
    setName(settings.name);
    setSlug(settings.slug);
  }

  if (!workspace) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-indigo-400" />
        <h1 className="text-2xl font-bold">Impostazioni Generali</h1>
      </div>

      {/* Workspace Info */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Nome</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome workspace"
              className="border-zinc-700 bg-zinc-800"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-slug">Slug</Label>
            <Input
              id="ws-slug"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              placeholder="workspace-slug"
              className="border-zinc-700 bg-zinc-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-indigo-500/30 text-indigo-400"
            >
              Piano: {settings?.plan ?? "FREE"}
            </Badge>
            {settings?.createdAt && (
              <span className="text-xs text-zinc-500">
                Creato il{" "}
                {new Date(settings.createdAt).toLocaleDateString("it-IT")}
              </span>
            )}
          </div>

          <Button
            onClick={() =>
              updateMutation.mutate({
                workspaceId: workspace.id,
                name: name || undefined,
                slug: slug || undefined,
              })
            }
            disabled={updateMutation.isPending || isLoading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? "Salvataggio..." : "Salva modifiche"}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-900/50 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Zona Pericolosa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-400">
            L&apos;eliminazione del workspace rimuove permanentemente tutti i
            dati, post, contatti e impostazioni.
          </p>

          {!showDelete ? (
            <Button
              variant="outline"
              onClick={() => setShowDelete(true)}
              className="border-red-800 text-red-400 hover:bg-red-900/20"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina Workspace
            </Button>
          ) : (
            <div className="space-y-3 rounded-lg border border-red-800/50 p-4">
              <p className="text-sm text-red-300">
                Digita <strong>{settings?.slug}</strong> per confermare:
              </p>
              <Input
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                placeholder={settings?.slug}
                className="border-red-800 bg-zinc-800"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDelete(false);
                    setConfirmSlug("");
                  }}
                >
                  Annulla
                </Button>
                <Button
                  onClick={() =>
                    deleteMutation.mutate({
                      workspaceId: workspace.id,
                      confirmSlug,
                    })
                  }
                  disabled={
                    confirmSlug !== settings?.slug || deleteMutation.isPending
                  }
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleteMutation.isPending
                    ? "Eliminazione..."
                    : "Conferma Eliminazione"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
