"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const labelMap: Record<string, string> = {
  dashboard: "Dashboard",
  social: "Social",
  analytics: "Analytics",
  ads: "AI Ads",
  crm: "CRM",
  email: "Email",
  heatmap: "Heatmap",
  settings: "Impostazioni",
  compose: "Componi",
  accounts: "Account",
  library: "Libreria",
  campaigns: "Campagne",
  reports: "Report",
  generate: "Genera",
  preview: "Anteprima",
  pipeline: "Pipeline",
  import: "Importa",
  automations: "Automazioni",
  lists: "Liste",
  sessions: "Sessioni",
  billing: "Fatturazione",
  team: "Team",
  integrations: "Integrazioni",
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-sm">
      {segments.map((segment, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        const label = labelMap[segment] ?? segment;

        return (
          <span key={href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-600" />}
            {isLast ? (
              <span className="font-medium text-zinc-100">{label}</span>
            ) : (
              <Link
                href={href}
                className="text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
