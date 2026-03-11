"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      name,
      callbackUrl,
      redirect: false,
    });

    if (result?.error) {
      setError("Errore durante il login. Riprova.");
      setLoading(false);
    } else if (result?.url) {
      window.location.href = result.url;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[400px] w-[600px] rounded-full bg-indigo-600/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl backdrop-blur-sm">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
              AP
            </div>
            <h1 className="text-2xl font-bold text-white">
              Accedi ad AdPilot
            </h1>
            <p className="text-sm text-zinc-400">
              Il tuo Digital Marketing Hub
            </p>
          </div>

          {/* Local login form */}
          <form onSubmit={handleCredentialsLogin}>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Nome
            </label>
            <input
              id="name"
              type="text"
              placeholder="Il tuo nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="tu@esempio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Accesso in corso..." : "Accedi"}
            </button>
          </form>

          {/* Google OAuth — only visible if configured */}
          {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" && (
            <>
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs text-zinc-500">oppure</span>
                <div className="h-px flex-1 bg-zinc-800" />
              </div>
              <button
                onClick={() => signIn("google", { callbackUrl })}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-medium text-white transition-colors hover:border-zinc-600 hover:bg-zinc-700"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continua con Google
              </button>
            </>
          )}

          {/* Back to home */}
          <p className="mt-6 text-center text-sm text-zinc-500">
            <Link
              href="/"
              className="text-indigo-400 transition-colors hover:text-indigo-300"
            >
              &larr; Torna alla home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
