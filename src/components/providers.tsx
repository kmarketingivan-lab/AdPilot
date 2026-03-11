"use client";

import { SessionProvider } from "next-auth/react";
import { TRPCProvider } from "@/lib/trpc/provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TRPCProvider>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </TRPCProvider>
    </SessionProvider>
  );
}
