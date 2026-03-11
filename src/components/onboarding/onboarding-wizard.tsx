"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  Share2,
  UserPlus,
  Rocket,
  Check,
  ChevronRight,
  ArrowLeft,
  SkipForward,
} from "lucide-react";

const STEPS = [
  {
    id: "workspace",
    title: "Crea il tuo Workspace",
    description: "Scegli un nome e uno slug per il tuo workspace.",
    icon: Building2,
  },
  {
    id: "social",
    title: "Connetti Account Social",
    description: "Collega i tuoi profili social per iniziare a pubblicare.",
    icon: Share2,
  },
  {
    id: "team",
    title: "Invita il tuo Team",
    description: "Aggiungi collaboratori al tuo workspace.",
    icon: UserPlus,
  },
  {
    id: "ready",
    title: "Tutto Pronto!",
    description: "Hai completato la configurazione iniziale.",
    icon: Rocket,
  },
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [step, setStep] = useState(0);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);

  const createWorkspace = trpc.onboarding.createWorkspace.useMutation({
    onSuccess: (data) => {
      setWorkspaceId(data.id);
      utils.workspace.list.invalidate();
      setStep(1);
    },
  });

  const inviteMutation = trpc.workspace.invite.useMutation({
    onSuccess: () => {
      setInvitedEmails((prev) => [...prev, inviteEmail]);
      setInviteEmail("");
    },
  });

  const completeMutation = trpc.onboarding.complete.useMutation({
    onSuccess: () => {
      router.push("/dashboard");
      router.refresh();
    },
  });

  const skipMutation = trpc.onboarding.skip.useMutation({
    onSuccess: () => {
      router.push("/dashboard");
      router.refresh();
    },
  });

  const currentStep = STEPS[step];

  const handleNameChange = (value: string) => {
    setWorkspaceName(value);
    setWorkspaceSlug(
      value
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  i < step
                    ? "bg-indigo-600 text-white"
                    : i === step
                    ? "bg-indigo-600/20 text-indigo-400 ring-2 ring-indigo-500"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px w-8 ${
                    i < step ? "bg-indigo-600" : "bg-zinc-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10">
              <currentStep.icon className="h-6 w-6 text-indigo-400" />
            </div>
            <CardTitle className="text-xl">{currentStep.title}</CardTitle>
            <p className="text-sm text-zinc-400">{currentStep.description}</p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Step 0: Create Workspace */}
            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ob-name">Nome Workspace</Label>
                  <Input
                    id="ob-name"
                    value={workspaceName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="La mia agenzia"
                    className="border-zinc-700 bg-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ob-slug">Slug</Label>
                  <Input
                    id="ob-slug"
                    value={workspaceSlug}
                    onChange={(e) =>
                      setWorkspaceSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "")
                      )
                    }
                    placeholder="la-mia-agenzia"
                    className="border-zinc-700 bg-zinc-800"
                  />
                </div>
                {createWorkspace.error && (
                  <p className="text-sm text-red-400">
                    {createWorkspace.error.message}
                  </p>
                )}
                <div className="flex justify-between pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => skipMutation.mutate()}
                    className="text-zinc-500"
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    Salta
                  </Button>
                  <Button
                    onClick={() =>
                      createWorkspace.mutate({
                        name: workspaceName,
                        slug: workspaceSlug,
                      })
                    }
                    disabled={
                      !workspaceName ||
                      !workspaceSlug ||
                      createWorkspace.isPending
                    }
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {createWorkspace.isPending ? "Creazione..." : "Continua"}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* Step 1: Connect Social (info only, redirect to social accounts page) */}
            {step === 1 && (
              <>
                <p className="text-sm text-zinc-400">
                  Puoi connettere i tuoi account social dalla sezione Social del
                  dashboard. Supportiamo Instagram, Facebook, LinkedIn, Twitter,
                  TikTok e YouTube.
                </p>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(0)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Indietro
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep(2)}>
                      Dopo
                    </Button>
                    <Button
                      onClick={() => {
                        router.push("/dashboard/social/accounts");
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      Connetti Account
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Invite Team */}
            {step === 2 && (
              <>
                <div className="flex gap-2">
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="collaboratore@email.com"
                    type="email"
                    className="border-zinc-700 bg-zinc-800"
                  />
                  <Button
                    onClick={() => {
                      if (workspaceId) {
                        inviteMutation.mutate({
                          workspaceId,
                          email: inviteEmail,
                          role: "MEMBER",
                        });
                      }
                    }}
                    disabled={!inviteEmail || inviteMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    Invita
                  </Button>
                </div>

                {inviteMutation.error && (
                  <p className="text-sm text-red-400">
                    {inviteMutation.error.message}
                  </p>
                )}

                {invitedEmails.length > 0 && (
                  <div className="space-y-1">
                    {invitedEmails.map((email) => (
                      <div
                        key={email}
                        className="flex items-center gap-2 text-sm text-zinc-300"
                      >
                        <Check className="h-3 w-3 text-green-400" />
                        {email}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Indietro
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    Continua
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* Step 3: All Done */}
            {step === 3 && (
              <>
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600/10">
                    <Check className="h-8 w-8 text-green-400" />
                  </div>
                  <p className="text-zinc-400">
                    Il tuo workspace e pronto. Puoi iniziare a creare post,
                    analizzare dati e gestire le tue campagne.
                  </p>
                </div>
                <div className="flex justify-center pt-2">
                  <Button
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Rocket className="mr-2 h-4 w-4" />
                    {completeMutation.isPending
                      ? "Caricamento..."
                      : "Vai al Dashboard"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
