"use client";

import { createAuthClient } from "better-auth/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { localReturnTo, type AppSessionValue } from "@/lib/auth/session-contract";
import { AppSessionProvider } from "./app-session-provider";
import { boundedFetch } from "@/lib/auth/bounded-fetch";

const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? "https://localley.io" : window.location.origin,
  basePath: "/api/auth",
  fetchOptions: { baseURL: "/api/auth", credentials: "same-origin", redirect: "error", customFetchImpl: boundedFetch, retry: 0 },
});
type Identity = Pick<AppSessionValue, "status" | "authUserId" | "sessionId" | "ownerId" | "userRecordId" | "accountKey" | "canBookmark">;
const empty: Identity = { status: "loading", authUserId: null, sessionId: null, ownerId: null, userRecordId: null, accountKey: null, canBookmark: false };
const validId = (id: unknown): id is string => typeof id === "string" && id.trim().length > 0;

export function BetterAuthSessionProvider({ children, onSignIn }: {
  children: ReactNode;
  onSignIn?: (returnTo: string) => void;
}) {
  const observed = authClient.useSession();
  const authUserId = observed.data?.user?.id;
  const sessionId = observed.data?.session?.id;
  const verified = observed.data?.user?.emailVerified;
  const pending = observed.isPending;
  const failed = !!observed.error;
  const refetchSession = observed.refetch;
  const scope = JSON.stringify([authUserId, sessionId, verified, pending, failed]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ scope: string; identity: Identity }>({ scope, identity: empty });

  const refresh = useCallback(async (refetch = true) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const ticket = ++generation.current;
    const current = () => ticket === generation.current && currentScope.current === scope && !request.signal.aborted;
    const publish = (identity: Identity) => { if (current()) setState({ scope, identity }); };
    publish(empty);
    try {
      if (refetch) {
        await refetchSession({ query: { disableCookieCache: true } });
        if (!current()) return;
      }
      if (pending) return;
      if (failed) throw new Error("Auth observer failed");
      const identity = await authClient.getSession({
        query: { disableCookieCache: true },
        fetchOptions: { signal: request.signal, cache: "no-store" },
      });
      if (!current()) return;
      if (identity.error) throw new Error("Auth check failed");
      if (!identity.data) {
        if (authUserId || sessionId) throw new Error("Session changed");
        publish({ ...empty, status: "signedout" });
        return;
      }
      const { user, session } = identity.data;
      if (!validId(user.id) || !validId(session.id) || session.userId !== user.id
        || user.id !== authUserId || session.id !== sessionId) throw new Error("Session changed");
      const ids = { authUserId: user.id, sessionId: session.id };
      if (user.emailVerified !== true) {
        publish({ ...empty, ...ids, status: "unverified" });
        return;
      }
      const response = await boundedFetch("/api/session", {
        credentials: "same-origin", cache: "no-store", redirect: "error", signal: request.signal,
        headers: { "x-localley-session-id": session.id },
      });
      if (!response.ok) throw new Error("Mapping check failed");
      const mapping = await response.json();
      if (!mapping || mapping.authUserId !== user.id || mapping.sessionId !== session.id
        || !["ready", "unlinked", "incomplete"].includes(mapping.state)
        || (mapping.ownerId != null && !validId(mapping.ownerId))
        || (mapping.userRecordId != null && !validId(mapping.userRecordId))
        || (mapping.state === "unlinked" && (mapping.ownerId != null || mapping.userRecordId != null))
        || (mapping.state === "incomplete" && mapping.userRecordId != null)) throw new Error("Invalid mapping");
      if (mapping.state === "ready" && (!validId(mapping.ownerId) || !validId(mapping.userRecordId))) {
        throw new Error("Incomplete mapping");
      }
      const ownerId = mapping.ownerId ?? null;
      publish({ ...ids, status: mapping.state, ownerId, userRecordId: mapping.userRecordId ?? null,
        accountKey: JSON.stringify(["better-auth", user.id, ownerId, session.id]), canBookmark: mapping.state === "ready" });
    } catch {
      publish({ ...empty, status: "blocked" });
    }
  }, [scope, pending, failed, authUserId, sessionId, refetchSession]);

  useEffect(() => {
    void refresh(false);
    return () => { controller.current?.abort(); };
  }, [refresh]);

  const value: AppSessionValue = {
    ...(state.scope === scope ? state.identity : empty), provider: "better-auth", refresh,
    requestSignIn: (returnTo) => {
      const local = localReturnTo(returnTo);
      if (onSignIn) onSignIn(local);
      // This opt-in adapter also runs without the Next.js router in the native harness.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      else window.location.assign(`/sign-in?${new URLSearchParams({ redirect_url: local })}`);
    },
  };
  return <AppSessionProvider value={value}>{children}</AppSessionProvider>;
}
