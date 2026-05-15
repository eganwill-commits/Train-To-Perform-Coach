// lib/WorkspaceContext.js
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { WORKSPACES, DEFAULT_WORKSPACE, getWorkspace } from "./workspaces";

const WorkspaceContext = createContext(null);
const STORAGE_KEY = "t2p_active_workspace";

export function WorkspaceProvider({ children }) {
  const [activeProgramType, setActive] = useState(DEFAULT_WORKSPACE);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted workspace on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && WORKSPACES[stored]) setActive(stored);
    setHydrated(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, activeProgramType);
  }, [activeProgramType, hydrated]);

  const setActiveProgramType = useCallback((id) => {
    if (WORKSPACES[id]) setActive(id);
  }, []);

  const workspace = getWorkspace(activeProgramType);

  return (
    <WorkspaceContext.Provider
      value={{ activeProgramType, setActiveProgramType, workspace, hydrated }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  return ctx;
}
