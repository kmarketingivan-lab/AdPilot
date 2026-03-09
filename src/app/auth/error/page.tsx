"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, string> = {
    Configuration: "Si \u00e8 verificato un problema con la configurazione del server.",
    AccessDenied: "Accesso negato. Non hai i permessi per accedere.",
    Verification: "Il link di verifica \u00e8 scaduto o \u00e8 gi\u00e0 stato utilizzato.",
    Default: "Si \u00e8 verificato un errore durante l'autenticazione.",
  };

  const message = error
    ? errorMessages[error] || errorMessages.Default
    : errorMessages.Default;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 text-center shadow-xl">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-600/10">
          <svg
            className="h-8 w-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white">
          Errore di Autenticazione
        </h1>
        <p className="mt-3 text-sm text-zinc-400">{message}</p>
        {error && (
          <p className="mt-2 text-xs text-zinc-600">Codice: {error}</p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/auth/signin"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Riprova ad accedere
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Torna alla home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <div className="text-zinc-500">Caricamento...</div>
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
