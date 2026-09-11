"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { localReturnTo, type AppSessionValue } from "@/lib/auth/session-contract";
import { AppSessionProvider } from "./app-session-provider";

export function ClerkSessionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const clerk = useClerk();
  const router = useRouter();
  const ready = !!(isLoaded && isSignedIn && userId && sessionId);
  const value: AppSessionValue = {
    provider: "clerk",
    status: !isLoaded ? "loading" : !isSignedIn ? "signedout" : ready ? "ready" : "blocked",
    authUserId: userId ?? null,
    sessionId: sessionId ?? null,
    ownerId: ready ? userId : null,
    userRecordId: null,
    accountKey: ready ? JSON.stringify(["clerk", userId, userId, sessionId]) : null,
    canBookmark: ready,
    requestSignIn: (returnTo) => router.push(`/sign-in?${new URLSearchParams({ redirect_url: localReturnTo(returnTo) })}`),
    refresh: async () => { await clerk.session?.reload(); },
  };
  return <AppSessionProvider value={value}>{children}</AppSessionProvider>;
}
