"use client";

import { createContext, useContext } from "react";
import type { Workspace, WorkspaceRole } from "@prisma/client";

export interface WorkspaceContextValue {
  workspace: Workspace & { memberCount: number; role: WorkspaceRole } | null;
  workspaces: (Workspace & { memberCount: number; role: WorkspaceRole })[];
  isLoading: boolean;
  setCurrentWorkspace: (id: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  workspaces: [],
  isLoading: true,
  setCurrentWorkspace: () => {},
});

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
