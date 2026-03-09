"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white text-sm">
            AP
          </div>
          <span className="text-lg font-semibold text-white">AdPilot</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#funzionalita" className="text-sm text-zinc-400 transition-colors hover:text-white">
            Funzionalit&agrave;
          </a>
          <a href="#prezzi" className="text-sm text-zinc-400 transition-colors hover:text-white">
            Prezzi
          </a>
          <a href="#contatti" className="text-sm text-zinc-400 transition-colors hover:text-white">
            Contatti
          </a>
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/auth/signin"
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
          >
            Accedi
          </Link>
          <Link
            href="/auth/signin"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Prova Gratis
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-zinc-400 hover:text-white"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-zinc-800 bg-zinc-950 md:hidden">
          <div className="flex flex-col gap-1 px-4 py-4">
            <a
              href="#funzionalita"
              className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Funzionalit&agrave;
            </a>
            <a
              href="#prezzi"
              className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Prezzi
            </a>
            <a
              href="#contatti"
              className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Contatti
            </a>
            <hr className="my-2 border-zinc-800" />
            <Link
              href="/auth/signin"
              className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Accedi
            </Link>
            <Link
              href="/auth/signin"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-indigo-500"
            >
              Prova Gratis
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
