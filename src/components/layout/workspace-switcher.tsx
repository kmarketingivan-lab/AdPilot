"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
}

export function WorkspaceSwitcher({ collapsed }: WorkspaceSwitcherProps) {
  const { workspace, workspaces, setCurrentWorkspace } = useWorkspace();

  if (!workspace) return null;

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/10 text-xs font-bold text-indigo-400">
          {workspace.name.slice(0, 2).toUpperCase()}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-56">
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => setCurrentWorkspace(ws.id)}
            >
              <span className="flex-1">{ws.name}</span>
              {ws.id === workspace.id && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Plus className="mr-2 h-4 w-4" />
            Nuovo Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="w-full justify-between px-3 text-sm" />}>
        <span className="truncate">{workspace.name}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-zinc-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => setCurrentWorkspace(ws.id)}
          >
            <span className="flex-1">{ws.name}</span>
            {ws.id === workspace.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus className="mr-2 h-4 w-4" />
          Nuovo Workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
