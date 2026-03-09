"use client";

import Link from "next/link";
import {
  Share2,
  BarChart3,
  Sparkles,
  Users,
  Flame,
  Layout,
  Check,
} from "lucide-react";
import Navbar from "@/components/landing/navbar";

const features = [
  {
    icon: Share2,
    title: "Social Media Manager",
    description:
      "Pianifica e pubblica contenuti su tutti i social da un'unica dashboard. Calendario editoriale, anteprima e auto-posting.",
  },
  {
    icon: BarChart3,
    title: "Dashboard Unificata",
    description:
      "Metriche in tempo reale da ogni canale. Report automatici, KPI personalizzati e confronti tra periodi.",
  },
  {
    icon: Sparkles,
    title: "AI Ads Generator",
    description:
      "Genera copy, creativit\u00e0 e audience con l'AI. Ottimizzazione automatica delle campagne Google e Meta Ads.",
  },
  {
    icon: Users,
    title: "CRM & Email",
    description:
      "Gestisci contatti, segmenta il pubblico e invia campagne email personalizzate con automazioni avanzate.",
  },
  {
    icon: Flame,
    title: "Heatmap & Recording",
    description:
      "Visualizza dove cliccano i tuoi utenti. Session recording, scroll depth e analisi comportamentale.",
  },
  {
    icon: Layout,
    title: "Landing Page Builder",
    description:
      "Crea landing page ad alta conversione con il builder drag & drop. Template ottimizzati e A/B test integrati.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "per sempre",
    description: "Per iniziare a esplorare",
    features: [
      "3 account social",
      "30 post al mese",
      "Dashboard base",
      "1 utente",
    ],
    cta: "Inizia Gratis",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "al mese",
    description: "Per freelancer e piccoli business",
    features: [
      "10 account social",
      "Post illimitati",
      "Analytics base",
      "Email marketing",
      "3 utenti",
    ],
    cta: "Scegli Starter",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "al mese",
    description: "Per team e aziende in crescita",
    features: [
      "25 account social",
      "AI Ads Generator",
      "CRM completo",
      "Heatmap & Recording",
      "Landing Page Builder",
      "10 utenti",
    ],
    cta: "Scegli Pro",
    highlighted: true,
  },
  {
    name: "Agency",
    price: "$99",
    period: "al mese",
    description: "Per agenzie e grandi team",
    features: [
      "Account illimitati",
      "White-label",
      "Supporto prioritario",
      "API access",
      "Utenti illimitati",
      "Tutte le funzionalit\u00e0 Pro",
    ],
    cta: "Contattaci",
    highlighted: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[500px] w-[800px] rounded-full bg-indigo-600/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            <span className="text-white">AdPilot</span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent">
              Your Digital Marketing Hub
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 sm:text-xl">
            Gestisci social media, campagne ads, CRM, analytics e landing page
            da un&apos;unica piattaforma. Tutto ci&ograve; di cui hai bisogno per il tuo
            marketing digitale.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/signin"
              className="inline-flex h-12 items-center rounded-xl bg-indigo-600 px-8 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition-colors hover:bg-indigo-500"
            >
              Inizia Gratis
            </Link>
            <a
              href="#prezzi"
              className="inline-flex h-12 items-center rounded-xl border border-zinc-700 px-8 text-base font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Scopri i Piani
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="funzionalita" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Tutto in un&apos;unica piattaforma
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
              Strumenti potenti per ogni aspetto del tuo marketing digitale,
              integrati e pronti all&apos;uso.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400 transition-colors group-hover:bg-indigo-600/20">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="prezzi" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Piani e Prezzi
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
              Scegli il piano perfetto per le tue esigenze. Upgrade o downgrade
              in qualsiasi momento.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  plan.highlighted
                    ? "border-indigo-500 bg-indigo-600/5 shadow-lg shadow-indigo-600/10"
                    : "border-zinc-800 bg-zinc-900/50"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                    Popolare
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white">
                  {plan.name}
                </h3>
                <p className="mt-1 text-sm text-zinc-500">{plan.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    {plan.price}
                  </span>
                  <span className="text-sm text-zinc-500">/{plan.period}</span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-zinc-300"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/signin"
                  className={`mt-8 inline-flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                    plan.highlighted
                      ? "bg-indigo-600 text-white hover:bg-indigo-500"
                      : "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contatti" className="border-t border-zinc-800 py-12">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
              AP
            </div>
            <span className="font-semibold text-white">AdPilot</span>
          </div>
          <p className="mt-4 text-sm text-zinc-500">
            &copy; {new Date().getFullYear()} AdPilot. Tutti i diritti
            riservati.
          </p>
        </div>
      </footer>
    </div>
  );
}
