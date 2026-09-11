"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppSessionValue } from "@/lib/auth/session-contract";

const AppSessionContext = createContext<AppSessionValue | null>(null);

export function AppSessionProvider({ value, children }: { value: AppSessionValue; children: ReactNode }) {
  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession(): AppSessionValue {
  const value = useContext(AppSessionContext);
  if (!value) throw new Error("useAppSession requires an AppSessionProvider");
  return value;
}
