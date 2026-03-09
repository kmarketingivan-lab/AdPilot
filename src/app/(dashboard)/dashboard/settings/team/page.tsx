"use client";

import { useState } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, UserPlus, Shield, Trash2 } from "lucide-react";

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-amber-900/30 text-amber-400 border-amber-500/30",
  ADMIN: "bg-indigo-900/30 text-indigo-400 border-indigo-500/30",
  MEMBER: "bg-zinc-800 text-zinc-300 border-zinc-600",
  VIEWER: "bg-zinc-800 text-zinc-500 border-zinc-700",
};

export default function TeamPage() {
  const { workspace } = useWorkspace();
  const utils = trpc.useUtils();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">(
    "MEMBER"
  );

  const { data: members, isLoading } = trpc.settings.getMembers.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace }
  );

  const inviteMutation = trpc.workspace.invite.useMutation({
    onSuccess: () => {
      utils.settings.getMembers.invalidate();
      setInviteEmail("");
    },
  });

  const removeMutation = trpc.workspace.removeMember.useMutation({
    onSuccess: () => {
      utils.settings.getMembers.invalidate();
    },
  });

  const updateRoleMutation = trpc.settings.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.settings.getMembers.invalidate();
    },
  });

  if (!workspace) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-indigo-400" />
        <h1 className="text-2xl font-bold">Membri del Team</h1>
      </div>

      {/* Invite */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5" />
            Invita Membro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="collaboratore@email.com"
                className="border-zinc-700 bg-zinc-800"
              />
            </div>
            <div className="w-36 space-y-1">
              <Label>Ruolo</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) =>
                  setInviteRole(v as "ADMIN" | "MEMBER" | "VIEWER")
                }
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MEMBER">Membro</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {inviteMutation.error && (
            <p className="mt-2 text-sm text-red-400">
              {inviteMutation.error.message}
            </p>
          )}
          <Button
            onClick={() =>
              inviteMutation.mutate({
                workspaceId: workspace.id,
                email: inviteEmail,
                role: inviteRole,
              })
            }
            disabled={!inviteEmail || inviteMutation.isPending}
            className="mt-3 bg-indigo-600 hover:bg-indigo-700"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {inviteMutation.isPending ? "Invio..." : "Invita"}
          </Button>
        </CardContent>
      </Card>

      {/* Members List */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Membri ({members?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-zinc-500">Caricamento...</p>
          ) : (
            <div className="space-y-3">
              {members?.map((member) => {
                const initials = member.user.name
                  ? member.user.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)
                  : "U";

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={member.user.image ?? undefined} />
                        <AvatarFallback className="bg-indigo-600 text-xs text-white">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {member.user.name ?? "Utente"}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {member.user.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {member.role === "OWNER" ? (
                        <Badge
                          variant="outline"
                          className={ROLE_COLORS.OWNER}
                        >
                          Owner
                        </Badge>
                      ) : (
                        <>
                          <Select
                            value={member.role}
                            onValueChange={(v) =>
                              updateRoleMutation.mutate({
                                workspaceId: workspace.id,
                                memberId: member.id,
                                role: v as "ADMIN" | "MEMBER" | "VIEWER",
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-28 border-zinc-700 bg-zinc-800 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ADMIN">Admin</SelectItem>
                              <SelectItem value="MEMBER">Membro</SelectItem>
                              <SelectItem value="VIEWER">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              removeMutation.mutate({
                                workspaceId: workspace.id,
                                memberId: member.id,
                              })
                            }
                            className="h-8 w-8 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
