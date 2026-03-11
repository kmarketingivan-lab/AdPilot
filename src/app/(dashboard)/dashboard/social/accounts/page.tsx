"use client";

import { useState } from "react";
import { Platform } from "@prisma/client";
import {
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  Music2,
  Youtube,
  Plus,
  Unplug,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Platform config
// ---------------------------------------------------------------------------

interface PlatformConfig {
  label: string;
  icon: typeof Facebook;
  color: string;
  bgColor: string;
}

const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  FACEBOOK: {
    label: "Facebook",
    icon: Facebook,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  INSTAGRAM: {
    label: "Instagram",
    icon: Instagram,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
  LINKEDIN: {
    label: "LinkedIn",
    icon: Linkedin,
    color: "text-sky-600",
    bgColor: "bg-sky-600/10",
  },
  TWITTER: {
    label: "X (Twitter)",
    icon: Twitter,
    color: "text-zinc-100",
    bgColor: "bg-zinc-500/10",
  },
  TIKTOK: {
    label: "TikTok",
    icon: Music2,
    color: "text-rose-400",
    bgColor: "bg-rose-400/10",
  },
  YOUTUBE: {
    label: "YouTube",
    icon: Youtube,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
};

// Platforms available for connection (excluding YouTube as per task)
const CONNECTABLE_PLATFORMS: Platform[] = [
  "INSTAGRAM",
  "FACEBOOK",
  "LINKEDIN",
  "TWITTER",
  "TIKTOK",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConnectionStatus(tokenExpiresAt: Date | null): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (!tokenExpiresAt) {
    return { label: "Connected", variant: "default" };
  }

  const now = new Date();
  const expiresAt = new Date(tokenExpiresAt);
  const daysUntilExpiry = Math.ceil(
    (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry <= 0) {
    return { label: "Expired", variant: "destructive" };
  }

  if (daysUntilExpiry <= 7) {
    return { label: `Expires in ${daysUntilExpiry}d`, variant: "outline" };
  }

  return { label: "Connected", variant: "default" };
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function AccountCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-3 w-36" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-8 w-24" />
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Account card
// ---------------------------------------------------------------------------

interface AccountCardProps {
  account: {
    id: string;
    platform: Platform;
    accountName: string;
    tokenExpiresAt: Date | null;
    createdAt: Date;
  };
  onDisconnect: (id: string) => void;
  isDisconnecting: boolean;
}

function AccountCard({ account, onDisconnect, isDisconnecting }: AccountCardProps) {
  const config = PLATFORM_CONFIG[account.platform];
  const status = getConnectionStatus(account.tokenExpiresAt);
  const Icon = config?.icon ?? Facebook;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${config?.bgColor ?? "bg-muted"}`}
        >
          <Icon className={`size-5 ${config?.color ?? "text-muted-foreground"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{account.accountName}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {config?.label ?? account.platform}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          Connected {formatDate(account.createdAt)}
        </p>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={isDisconnecting}
          onClick={() => onDisconnect(account.id)}
        >
          <Unplug className="size-3.5" />
          {isDisconnecting ? "Disconnecting..." : "Disconnect"}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Connect dialog
// ---------------------------------------------------------------------------

function ConnectDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);

  const authUrl = trpc.social.getAuthUrl.useQuery(
    { workspaceId, platform: selectedPlatform! },
    { enabled: !!selectedPlatform }
  );

  function handlePlatformSelect(platform: Platform) {
    setSelectedPlatform(platform);
  }

  function handleConnect() {
    if (authUrl.data?.url) {
      window.location.href = authUrl.data.url;
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="lg" />}
      >
        <Plus className="size-4" />
        Connect Account
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a Social Account</DialogTitle>
          <DialogDescription>
            Select a platform to connect via OAuth. You will be redirected to
            authorize access.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          {CONNECTABLE_PLATFORMS.map((platform) => {
            const config = PLATFORM_CONFIG[platform];
            if (!config) return null;
            const Icon = config.icon;
            const isSelected = selectedPlatform === platform;

            return (
              <button
                key={platform}
                type="button"
                onClick={() => handlePlatformSelect(platform)}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border"
                }`}
              >
                <div
                  className={`flex size-9 items-center justify-center rounded-lg ${config.bgColor}`}
                >
                  <Icon className={`size-4 ${config.color}`} />
                </div>
                <span className="flex-1 text-sm font-medium">
                  {config.label}
                </span>
                {isSelected && (
                  <ExternalLink className="size-4 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button
            disabled={!selectedPlatform || authUrl.isLoading}
            onClick={handleConnect}
          >
            {authUrl.isLoading ? "Preparing..." : "Continue with OAuth"}
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SocialAccountsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const accounts = trpc.social.list.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const utils = trpc.useUtils();

  const disconnect = trpc.social.disconnect.useMutation({
    onSuccess: () => {
      utils.social.list.invalidate({ workspaceId });
    },
  });

  function handleDisconnect(accountId: string) {
    if (!workspaceId) return;
    disconnect.mutate({ workspaceId, accountId });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Social Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect and manage your social media accounts.
          </p>
        </div>
        {workspaceId && <ConnectDialog workspaceId={workspaceId} />}
      </div>

      {/* Loading state */}
      {accounts.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <AccountCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {accounts.data && accounts.data.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-12">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <Unplug className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No accounts connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect your first social media account to start publishing.
              </p>
            </div>
            {workspaceId && <ConnectDialog workspaceId={workspaceId} />}
          </CardContent>
        </Card>
      )}

      {/* Account grid */}
      {accounts.data && accounts.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.data.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onDisconnect={handleDisconnect}
              isDisconnecting={
                disconnect.isPending &&
                disconnect.variables?.accountId === account.id
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
