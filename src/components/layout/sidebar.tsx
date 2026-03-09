"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Share2,
  BarChart3,
  Sparkles,
  Users,
  Mail,
  Flame,
  Settings,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WorkspaceSwitcher } from "./workspace-switcher";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/social", icon: Share2, label: "Social" },
  { href: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/dashboard/ads", icon: Sparkles, label: "AI Ads" },
  { href: "/dashboard/crm", icon: Users, label: "CRM" },
  { href: "/dashboard/email", icon: Mail, label: "Email" },
  { href: "/dashboard/heatmap", icon: Flame, label: "Heatmap" },
];

const bottomItems = [
  { href: "/dashboard/settings", icon: Settings, label: "Impostazioni" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  isMobile?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, isMobile, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const renderNavItem = (item: (typeof navItems)[0]) => {
    const active = isActive(item.href);
    const link = (
      <Link
        href={item.href}
        onClick={handleNavClick}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-indigo-600/10 text-indigo-400"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        )}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger
            className="w-full"
            render={<Link href={item.href} />}
          >
            <div
              className={cn(
                "flex items-center justify-center rounded-lg px-3 py-2 transition-colors",
                active
                  ? "bg-indigo-600/10 text-indigo-400"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              )}
            >
              <item.icon className="h-5 w-5" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return <div key={item.href}>{link}</div>;
  };

  const handleNavClick = () => {
    if (isMobile && onMobileClose) {
      onMobileClose();
    }
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200",
        isMobile
          ? cn("w-60", mobileOpen ? "translate-x-0" : "-translate-x-full")
          : collapsed
            ? "w-16"
            : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
          AP
        </div>
        {!collapsed && (
          <span className="text-lg font-semibold text-white">AdPilot</span>
        )}
      </div>

      {/* Workspace Switcher */}
      <div className="border-b border-zinc-800 px-2 py-3">
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {navItems.map(renderNavItem)}
      </nav>

      {/* Bottom */}
      <div className="space-y-1 border-t border-zinc-800 px-2 py-4">
        {bottomItems.map(renderNavItem)}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full justify-center text-zinc-500 hover:text-zinc-300"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </Button>
      </div>
    </aside>
  );
}
