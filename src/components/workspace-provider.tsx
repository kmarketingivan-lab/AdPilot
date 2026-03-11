"use client";

import { useState, useEffect, useCallback } from "react";
import { WorkspaceContext } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc/client";

export function WorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const { data: workspaces, isLoading } = trpc.workspace.list.useQuery();

  useEffect(() => {
    if (!workspaces?.length) return;
    const saved = localStorage.getItem("adpilot-workspace-id");
    const found = workspaces.find((w) => w.id === saved);
    setCurrentId(found ? found.id : workspaces[0].id);
  }, [workspaces]);

  const setCurrentWorkspace = useCallback((id: string) => {
    setCurrentId(id);
    localStorage.setItem("adpilot-workspace-id", id);
  }, []);

  const workspace = workspaces?.find((w) => w.id === currentId) ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        workspaces: workspaces ?? [],
        isLoading,
        setCurrentWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
