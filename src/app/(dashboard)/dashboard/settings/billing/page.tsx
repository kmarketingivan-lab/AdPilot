"use client";

import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Check,
  Zap,
  TrendingUp,
  Building,
  ExternalLink,
} from "lucide-react";

const PLAN_ICONS: Record<string, React.ElementType> = {
  FREE: Zap,
  STARTER: TrendingUp,
  PRO: CreditCard,
  AGENCY: Building,
};

const PLAN_FEATURES: Record<string, string[]> = {
  FREE: [
    "10 post",
    "100 contatti",
    "2 account social",
    "500 email/mese",
    "1 membro",
    "1 sito heatmap",
  ],
  STARTER: [
    "100 post",
    "1.000 contatti",
    "5 account social",
    "5.000 email/mese",
    "3 membri",
    "3 siti heatmap",
  ],
  PRO: [
    "500 post",
    "10.000 contatti",
    "15 account social",
    "25.000 email/mese",
    "10 membri",
    "10 siti heatmap",
  ],
  AGENCY: [
    "Post illimitati",
    "Contatti illimitati",
    "Account illimitati",
    "100.000 email/mese",
    "Membri illimitati",
    "Siti illimitati",
  ],
};

export default function BillingPage() {
  const { workspace } = useWorkspace();
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "true";
  const canceled = searchParams.get("canceled") === "true";

  const { data: status, isLoading } = trpc.billing.getStatus.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace }
  );

  const { data: plans } = trpc.billing.getPlans.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace }
  );

  const checkoutMutation = trpc.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const portalMutation = trpc.billing.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  if (!workspace) return null;

  const formatLimit = (val: number) => (val === -1 ? "Illimitati" : val.toLocaleString("it-IT"));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-indigo-400" />
        <h1 className="text-2xl font-bold">Billing & Piano</h1>
      </div>

      {success && (
        <div className="rounded-lg border border-green-800/50 bg-green-900/20 p-4 text-green-300">
          <Check className="mr-2 inline h-4 w-4" />
          Pagamento completato! Il tuo piano e stato aggiornato.
        </div>
      )}

      {canceled && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-900/20 p-4 text-yellow-300">
          Checkout annullato. Non e stato effettuato alcun addebito.
        </div>
      )}

      {/* Current Plan & Usage */}
      {status && (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Piano Attuale: {status.planName}</span>
              <Badge
                variant="outline"
                className="border-indigo-500/30 text-indigo-400"
              >
                {status.price === 0 ? "Gratuito" : `$${status.price}/mese`}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Post", status.usage.posts, status.limits.posts],
                  ["Contatti", status.usage.contacts, status.limits.contacts],
                  [
                    "Account Social",
                    status.usage.socialAccounts,
                    status.limits.socialAccounts,
                  ],
                  ["Membri", status.usage.teamMembers, status.limits.teamMembers],
                  [
                    "Siti Heatmap",
                    status.usage.heatmapSites,
                    status.limits.heatmapSites,
                  ],
                ] as [string, number, number][]
              ).map(([label, used, limit]) => {
                const pct = limit === -1 ? 0 : (used / limit) * 100;
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">{label}</span>
                      <span className="text-zinc-300">
                        {used}/{formatLimit(limit)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct > 80 ? "bg-red-500" : "bg-indigo-500"
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {status.subscription && (
              <div className="mt-4 flex items-center gap-4">
                <span className="text-sm text-zinc-400">
                  {status.subscription.cancelAtPeriodEnd
                    ? "Cancellazione alla fine del periodo"
                    : `Prossimo rinnovo: ${new Date(
                        status.subscription.currentPeriodEnd * 1000
                      ).toLocaleDateString("it-IT")}`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    portalMutation.mutate({ workspaceId: workspace.id })
                  }
                  disabled={portalMutation.isPending}
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Gestisci Abbonamento
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Plan Comparison */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans?.map((plan) => {
          const Icon = PLAN_ICONS[plan.id] ?? Zap;
          const isCurrentPlan = plan.id === status?.plan;
          const features = PLAN_FEATURES[plan.id] ?? [];

          return (
            <Card
              key={plan.id}
              className={`border-zinc-800 bg-zinc-900/50 ${
                isCurrentPlan ? "ring-2 ring-indigo-500" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-indigo-400" />
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                </div>
                <p className="text-2xl font-bold">
                  {plan.price === 0 ? (
                    "Gratuito"
                  ) : (
                    <>
                      ${plan.price}
                      <span className="text-sm font-normal text-zinc-500">
                        /mese
                      </span>
                    </>
                  )}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  {features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-zinc-300"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {isCurrentPlan ? (
                  <Button disabled className="w-full" variant="outline">
                    Piano Attuale
                  </Button>
                ) : plan.id === "FREE" ? (
                  <Button disabled className="w-full" variant="outline">
                    Piano Base
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                    onClick={() =>
                      checkoutMutation.mutate({
                        workspaceId: workspace.id,
                        plan: plan.id as "STARTER" | "PRO" | "AGENCY",
                      })
                    }
                    disabled={checkoutMutation.isPending}
                  >
                    {checkoutMutation.isPending ? "Caricamento..." : "Upgrade"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
