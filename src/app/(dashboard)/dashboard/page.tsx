"use client";

import Link from "next/link";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc/client";
import {
  Share2,
  BarChart3,
  Sparkles,
  Users,
  Mail,
  Flame,
  Calendar,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WelcomeGuide } from "@/components/dashboard/welcome-guide";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-700 text-zinc-300",
  SCHEDULED: "bg-blue-900/30 text-blue-400",
  PUBLISHED: "bg-green-900/30 text-green-400",
  FAILED: "bg-red-900/30 text-red-400",
  LEAD: "bg-zinc-700 text-zinc-300",
  MQL: "bg-blue-900/30 text-blue-400",
  SQL: "bg-indigo-900/30 text-indigo-400",
  OPPORTUNITY: "bg-purple-900/30 text-purple-400",
  CUSTOMER: "bg-green-900/30 text-green-400",
};

export default function DashboardOverview() {
  const { workspace } = useWorkspace();

  const { data, isLoading } = trpc.overview.getWidgets.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace }
  );

  const stats = data?.stats;

  const statCards = [
    {
      label: "Post Pianificati",
      value: stats?.scheduledPosts ?? 0,
      icon: Calendar,
      color: "text-blue-400",
      href: "/dashboard/social",
    },
    {
      label: "Post Pubblicati",
      value: stats?.publishedPosts ?? 0,
      icon: Share2,
      color: "text-green-400",
      href: "/dashboard/social",
    },
    {
      label: "Campagne Attive",
      value: stats?.activeCampaigns ?? 0,
      icon: Sparkles,
      color: "text-purple-400",
      href: "/dashboard/ads",
    },
    {
      label: "Contatti",
      value: stats?.totalContacts ?? 0,
      icon: Users,
      color: "text-orange-400",
      href: "/dashboard/crm",
    },
    {
      label: "Email Inviate",
      value: stats?.totalEmailsSent ?? 0,
      icon: Mail,
      color: "text-pink-400",
      href: "/dashboard/email",
    },
    {
      label: "Sessioni Heatmap",
      value: stats?.heatmapSessions ?? 0,
      icon: Flame,
      color: "text-red-400",
      href: "/dashboard/heatmap",
    },
  ];

  return (
    <div>
      {/* Welcome Guide — dismissable */}
      <WelcomeGuide />

      <h1 className="mb-6 text-2xl font-bold">Overview</h1>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="border-zinc-800 bg-zinc-900/50 transition-colors hover:border-zinc-700">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">
                  {stat.label}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {isLoading ? "..." : stat.value.toLocaleString("it-IT")}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Failed Posts Alert */}
      {(stats?.failedPosts ?? 0) > 0 && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-red-900/50 bg-red-900/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-300">
              {stats!.failedPosts} post non pubblicati
            </p>
            <p className="text-xs text-zinc-500">
              Verifica gli errori nella sezione Social.
            </p>
          </div>
          <Link
            href="/dashboard/social"
            className="ml-auto text-sm text-red-400 hover:text-red-300"
          >
            Vedi dettagli
            <ArrowRight className="ml-1 inline h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Recent Activity */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Recent Posts */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Post Recenti</CardTitle>
            <Link
              href="/dashboard/social"
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Vedi tutti
              <ArrowRight className="ml-1 inline h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {data?.recentPosts.length === 0 ? (
              <p className="text-sm text-zinc-500">Nessun post ancora</p>
            ) : (
              <div className="space-y-3">
                {data?.recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-start justify-between gap-3"
                  >
                    <p className="line-clamp-1 text-sm text-zinc-300">
                      {post.content.slice(0, 80)}
                      {post.content.length > 80 ? "..." : ""}
                    </p>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] ${
                        STATUS_COLORS[post.status] ?? ""
                      }`}
                    >
                      {post.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Contacts */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Contatti Recenti</CardTitle>
            <Link
              href="/dashboard/crm"
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Vedi tutti
              <ArrowRight className="ml-1 inline h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {data?.recentContacts.length === 0 ? (
              <p className="text-sm text-zinc-500">Nessun contatto ancora</p>
            ) : (
              <div className="space-y-3">
                {data?.recentContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        {contact.firstName ?? ""} {contact.lastName ?? ""}
                      </p>
                      <p className="text-xs text-zinc-500">{contact.email}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        STATUS_COLORS[contact.stage] ?? ""
                      }`}
                    >
                      {contact.stage}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <div className="mt-6 flex items-center gap-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm text-zinc-400">
            {stats?.socialAccounts ?? 0} account social connessi
          </span>
        </div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-400" />
          <span className="text-sm text-zinc-400">
            {stats?.activeCampaigns ?? 0} campagne attive
          </span>
        </div>
      </div>
    </div>
  );
}
