"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Share2,
  BarChart3,
  Sparkles,
  Users,
  Mail,
  Flame,
  ChevronRight,
  X,
  Zap,
  Settings,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "adpilot-welcome-dismissed";

interface GuideStep {
  id: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  title: string;
  description: string;
  href: string;
  action: string;
  tip: string;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: "social",
    icon: Share2,
    color: "text-blue-400",
    bgColor: "bg-blue-600/10",
    title: "1. Social Media Manager",
    description:
      "Pianifica e pubblica post su Instagram, Facebook, LinkedIn, Twitter e TikTok da un unico calendario.",
    href: "/dashboard/social",
    action: "Apri Social",
    tip: "Inizia connettendo un account social da Social > Account per abilitare la pubblicazione.",
  },
  {
    id: "crm",
    icon: Users,
    color: "text-orange-400",
    bgColor: "bg-orange-600/10",
    title: "2. CRM & Contatti",
    description:
      "Gestisci i tuoi contatti, organizzali nella pipeline kanban e traccia ogni interazione.",
    href: "/dashboard/crm",
    action: "Apri CRM",
    tip: "Aggiungi il tuo primo contatto cliccando il bottone + nella lista contatti.",
  },
  {
    id: "email",
    icon: Mail,
    color: "text-pink-400",
    bgColor: "bg-pink-600/10",
    title: "3. Email Marketing",
    description:
      "Crea campagne email con il builder drag & drop, gestisci liste iscritti e automazioni.",
    href: "/dashboard/email",
    action: "Apri Email",
    tip: "Crea una lista iscritti, poi usa i template per comporre la tua prima campagna.",
  },
  {
    id: "ads",
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-600/10",
    title: "4. AI Ads Copy Generator",
    description:
      "Genera copy per Google Ads e Meta Ads. Confronta varianti, salva nella libreria e anteprima live.",
    href: "/dashboard/ads",
    action: "Apri AI Ads",
    tip: "L'AI non e' attiva in locale. Puoi generare copy con Claude Code e incollarlo qui.",
  },
  {
    id: "analytics",
    icon: BarChart3,
    color: "text-green-400",
    bgColor: "bg-green-600/10",
    title: "5. Analytics & Report",
    description:
      "Dashboard unificata con KPI, grafici, confronto campagne e report esportabili in PDF.",
    href: "/dashboard/analytics",
    action: "Apri Analytics",
    tip: "I dati si popolano automaticamente man mano che usi Social, Email e Ads.",
  },
  {
    id: "heatmap",
    icon: Flame,
    color: "text-red-400",
    bgColor: "bg-red-600/10",
    title: "6. Heatmap & Session Recording",
    description:
      "Visualizza dove cliccano gli utenti sul tuo sito, registra sessioni e analizza i funnel.",
    href: "/dashboard/heatmap",
    action: "Apri Heatmap",
    tip: "Aggiungi lo script tracking.js al tuo sito per iniziare a raccogliere dati.",
  },
  {
    id: "settings",
    icon: Settings,
    color: "text-zinc-400",
    bgColor: "bg-zinc-600/10",
    title: "7. Impostazioni",
    description:
      "Configura integrazioni (Meta, Google, LinkedIn), gestisci il team e le API keys.",
    href: "/dashboard/settings/integrations",
    action: "Apri Impostazioni",
    tip: "Collega le API delle piattaforme per sbloccare tutte le funzionalita'.",
  },
];

export function WelcomeGuide() {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setDismissed(saved === "true");
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  const handleReset = () => {
    setDismissed(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  if (dismissed) {
    return (
      <button
        onClick={handleReset}
        className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-4 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
      >
        <Zap className="h-4 w-4" />
        Mostra guida introduttiva
      </button>
    );
  }

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Zap className="h-5 w-5 text-indigo-400" />
            Benvenuto in AdPilot
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Il tuo Digital Marketing Hub. Ecco cosa puoi fare con ogni modulo.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          title="Nascondi guida"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Quick start banner */}
      <div className="mb-4 rounded-xl border border-indigo-500/20 bg-indigo-600/5 p-4">
        <p className="text-sm text-indigo-300">
          <strong>Per iniziare subito:</strong> Vai su{" "}
          <Link href="/dashboard/crm" className="underline hover:text-indigo-200">
            CRM
          </Link>{" "}
          per aggiungere i tuoi contatti, poi su{" "}
          <Link href="/dashboard/social" className="underline hover:text-indigo-200">
            Social
          </Link>{" "}
          per pianificare il primo post. Le analytics si popoleranno da sole.
        </p>
      </div>

      {/* Module cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {GUIDE_STEPS.map((step) => {
          const isExpanded = expandedStep === step.id;
          return (
            <Card
              key={step.id}
              className="group relative border-zinc-800 bg-zinc-900/50 transition-all hover:border-zinc-700"
            >
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${step.bgColor}`}
                  >
                    <step.icon className={`h-4 w-4 ${step.color}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-200">
                    {step.title}
                  </h3>
                </div>

                <p className="mb-3 text-xs leading-relaxed text-zinc-400">
                  {step.description}
                </p>

                {/* Expandable tip */}
                <button
                  onClick={() =>
                    setExpandedStep(isExpanded ? null : step.id)
                  }
                  className="mb-3 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
                >
                  {isExpanded ? "Nascondi suggerimento" : "Come iniziare?"}
                </button>

                {isExpanded && (
                  <div className="mb-3 rounded-lg bg-zinc-800/50 p-2.5 text-xs leading-relaxed text-zinc-300">
                    {step.tip}
                  </div>
                )}

                <Link
                  href={step.href}
                  className={`flex items-center gap-1.5 text-xs font-medium ${step.color} transition-colors hover:brightness-125`}
                >
                  {step.action}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Architecture note */}
      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
        <p className="text-xs text-zinc-500">
          <strong className="text-zinc-400">Modalita' locale</strong> — Stai usando AdPilot
          in self-hosted senza AI backend. Per generare copy e testi, usa Claude Code (questa CLI).
          Per collegare i social, aggiungi le API keys nel file{" "}
          <code className="rounded bg-zinc-800 px-1">.env</code> e riavvia i container.
        </p>
      </div>
    </div>
  );
}
