"use client";

import { useSession, signOut } from "next-auth/react";
import { Moon, Sun, LogOut, User, Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Breadcrumb } from "./breadcrumb";
import { NotificationBell } from "@/components/notifications/notification-bell";

interface TopbarProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onMenuToggle?: () => void;
}

export function Topbar({ theme, onToggleTheme, onMenuToggle }: TopbarProps) {
  const { data: session } = useSession();
  const user = session?.user;

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-3 md:px-6 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        {onMenuToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuToggle}
            className="text-zinc-400 hover:text-zinc-100 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <Breadcrumb />
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <NotificationBell />

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          className="text-zinc-400 hover:text-zinc-100"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="relative h-8 w-8 rounded-full focus:outline-none">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.image ?? undefined} />
              <AvatarFallback className="bg-indigo-600 text-xs text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.name ?? "Utente"}</p>
              <p className="text-xs text-zinc-500">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.location.href = "/dashboard/settings"}>
              <User className="mr-2 h-4 w-4" />
              Profilo
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-red-400"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Esci
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
