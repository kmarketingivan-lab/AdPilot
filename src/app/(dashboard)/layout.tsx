"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { useIsMobile } from "@/lib/hooks/use-media-query";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const isMobile = useIsMobile();

  useEffect(() => {
    const saved = localStorage.getItem("adpilot-sidebar-collapsed");
    if (saved) setSidebarCollapsed(saved === "true");

    const savedTheme = localStorage.getItem("adpilot-theme") as
      | "light"
      | "dark"
      | null;
    if (savedTheme) setTheme(savedTheme);
  }, []);

  // Close mobile menu when switching to desktop
  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileMenuOpen((prev) => !prev);
    } else {
      const next = !sidebarCollapsed;
      setSidebarCollapsed(next);
      localStorage.setItem("adpilot-sidebar-collapsed", String(next));
    }
  }, [isMobile, sidebarCollapsed]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("adpilot-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return (
    <WorkspaceProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        {/* Mobile overlay */}
        {isMobile && mobileMenuOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        <Sidebar
          collapsed={isMobile ? false : sidebarCollapsed}
          onToggle={toggleSidebar}
          mobileOpen={mobileMenuOpen}
          isMobile={isMobile}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        <div
          className={cn(
            "transition-all duration-200",
            isMobile
              ? "ml-0"
              : sidebarCollapsed
                ? "ml-16"
                : "ml-60"
          )}
        >
          <Topbar
            theme={theme}
            onToggleTheme={toggleTheme}
            onMenuToggle={isMobile ? toggleSidebar : undefined}
          />
          <main className="p-3 md:p-6">{children}</main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
