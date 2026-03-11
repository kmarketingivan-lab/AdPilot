"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Check,
  CheckCheck,
  Share2,
  AlertTriangle,
  Mail,
  Users,
  CreditCard,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, React.ElementType> = {
  POST_PUBLISHED: Share2,
  POST_FAILED: AlertTriangle,
  CAMPAIGN_ENDED: Info,
  EMAIL_SENT: Mail,
  CONTACT_IMPORTED: Users,
  BILLING_WARNING: CreditCard,
  TEAM_INVITE: Users,
  SYSTEM: Info,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 30_000 } // Poll every 30s
  );

  const { data, isLoading } = trpc.notifications.list.useQuery(
    { limit: 15 },
    { enabled: open }
  );

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const deleteMutation = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const notifications = data?.items ?? [];
  const count = unreadCount ?? 0;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative text-zinc-400 hover:text-zinc-100"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>

      {open && (
        <>
          {/* Overlay to close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h3 className="text-sm font-semibold">Notifiche</h3>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllReadMutation.mutate()}
                    className="h-7 text-xs text-zinc-400 hover:text-zinc-100"
                  >
                    <CheckCheck className="mr-1 h-3 w-3" />
                    Segna tutte lette
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  className="h-7 w-7 text-zinc-500"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Notification list */}
            <div className="max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="p-6 text-center text-sm text-zinc-500">
                  Caricamento...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-zinc-500">
                  Nessuna notifica
                </div>
              ) : (
                notifications.map((notification) => {
                  const Icon =
                    TYPE_ICONS[notification.type] ?? Info;

                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        "flex gap-3 border-b border-zinc-800/50 px-4 py-3 transition-colors last:border-0",
                        !notification.read && "bg-indigo-600/5"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          notification.read
                            ? "bg-zinc-800 text-zinc-500"
                            : "bg-indigo-600/10 text-indigo-400"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-200">
                          {notification.title}
                        </p>
                        <p className="text-xs text-zinc-500 line-clamp-2">
                          {notification.body}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-600">
                          {formatRelativeTime(notification.createdAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-start gap-1">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              markReadMutation.mutate({
                                notificationId: notification.id,
                              })
                            }
                            className="h-6 w-6 text-zinc-500 hover:text-indigo-400"
                            title="Segna come letta"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            deleteMutation.mutate({
                              notificationId: notification.id,
                            })
                          }
                          className="h-6 w-6 text-zinc-500 hover:text-red-400"
                          title="Elimina"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Ora";
  if (diffMin < 60) return `${diffMin}m fa`;
  if (diffHr < 24) return `${diffHr}h fa`;
  if (diffDay < 7) return `${diffDay}g fa`;
  return d.toLocaleDateString("it-IT");
}
