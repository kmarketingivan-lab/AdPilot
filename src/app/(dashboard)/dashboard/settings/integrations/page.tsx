"use client";

import { useState } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plug,
  Key,
  Plus,
  Copy,
  Trash2,
  Check,
  Share2,
  BarChart3,
  Flame,
} from "lucide-react";

export default function IntegrationsPage() {
  const { workspace } = useWorkspace();
  const utils = trpc.useUtils();

  const { data: integrations } = trpc.settings.getIntegrations.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace }
  );

  const { data: apiKeys } = trpc.settings.listApiKeys.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace }
  );

  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createKeyMutation = trpc.settings.createApiKey.useMutation({
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setNewKeyName("");
      utils.settings.listApiKeys.invalidate();
    },
  });

  const revokeKeyMutation = trpc.settings.revokeApiKey.useMutation({
    onSuccess: () => {
      utils.settings.listApiKeys.invalidate();
    },
  });

  const handleCopy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!workspace) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Plug className="h-6 w-6 text-indigo-400" />
        <h1 className="text-2xl font-bold">Integrazioni & API Keys</h1>
      </div>

      {/* Connected Integrations */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plug className="h-5 w-5" />
            Connessioni Attive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Social Accounts */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Share2 className="h-4 w-4" />
              Account Social ({integrations?.socialAccounts.length ?? 0})
            </h3>
            {integrations?.socialAccounts.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Nessun account social connesso
              </p>
            ) : (
              <div className="space-y-2">
                {integrations?.socialAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between rounded border border-zinc-800 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {acc.platform}
                      </Badge>
                      <span className="text-sm">{acc.accountName}</span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {new Date(acc.createdAt).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ads Connections */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <BarChart3 className="h-4 w-4" />
              Connessioni Ads ({integrations?.adsConnections.length ?? 0})
            </h3>
            {integrations?.adsConnections.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Nessuna connessione ads attiva
              </p>
            ) : (
              <div className="space-y-2">
                {integrations?.adsConnections.map((conn) => (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between rounded border border-zinc-800 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {conn.platform}
                      </Badge>
                      <span className="text-sm">
                        {conn.accountName ?? conn.id}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Heatmap Sites */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Flame className="h-4 w-4" />
              Siti Heatmap ({integrations?.heatmapSites.length ?? 0})
            </h3>
            {integrations?.heatmapSites.length === 0 ? (
              <p className="text-sm text-zinc-500">Nessun sito configurato</p>
            ) : (
              <div className="space-y-2">
                {integrations?.heatmapSites.map((site) => (
                  <div
                    key={site.id}
                    className="flex items-center justify-between rounded border border-zinc-800 p-2"
                  >
                    <span className="text-sm">{site.domain}</span>
                    <code className="text-xs text-zinc-500">
                      {site.trackingId}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-400">
            Le API keys permettono l&apos;accesso programmatico al tuo
            workspace via REST API (POST /api/v1/posts, /api/v1/contacts, ecc.)
          </p>

          {/* Create new key */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="key-name" className="sr-only">
                Nome chiave
              </Label>
              <Input
                id="key-name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Nome chiave (es. Zapier Integration)"
                className="border-zinc-700 bg-zinc-800"
              />
            </div>
            <Button
              onClick={() =>
                createKeyMutation.mutate({
                  workspaceId: workspace.id,
                  name: newKeyName,
                })
              }
              disabled={!newKeyName || createKeyMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Crea
            </Button>
          </div>

          {/* Show newly created key */}
          {createdKey && (
            <div className="rounded-lg border border-amber-800/50 bg-amber-900/20 p-4">
              <p className="mb-2 text-sm font-medium text-amber-300">
                Copia la tua API key. Non verra mostrata di nuovo.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200">
                  {createdKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Existing keys */}
          {apiKeys && apiKeys.length > 0 && (
            <div className="space-y-2">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded border border-zinc-800 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{key.name}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <code>{key.keyPrefix}...</code>
                      <span>
                        Creata:{" "}
                        {new Date(key.createdAt).toLocaleDateString("it-IT")}
                      </span>
                      {key.lastUsedAt && (
                        <span>
                          Ultimo uso:{" "}
                          {new Date(key.lastUsedAt).toLocaleDateString("it-IT")}
                        </span>
                      )}
                      {key.expiresAt && (
                        <span>
                          Scade:{" "}
                          {new Date(key.expiresAt).toLocaleDateString("it-IT")}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      revokeKeyMutation.mutate({
                        workspaceId: workspace.id,
                        keyId: key.id,
                      })
                    }
                    className="h-8 w-8 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
