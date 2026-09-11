"use client";

import { useEffect, useRef, useState } from "react";
import { useAppSession } from "@/providers/app-session-provider";
import { useToast } from "@/hooks/use-toast";
import { boundedFetch, ClientRequestTimeoutError, withClientDeadline } from "@/lib/auth/bounded-fetch";

type SavedState = { scope: object; saved: boolean; known: boolean; busy: boolean; error: string | null };
type Scope = { key: string; request: AbortController | null; ticket: object | null; saved: boolean | null; blocked: boolean };

export function useSavedSpot(spotId: string) {
  const session = useAppSession();
  const { toast } = useToast();
  const enabled = session.status === "ready" && session.canBookmark
    && !!session.accountKey && !!session.sessionId && !!session.authUserId && !!session.ownerId;
  const key = JSON.stringify([session.status, session.provider, session.accountKey, session.sessionId, spotId, enabled]);
  const scopeRef = useRef<Scope>({ key, request: null, ticket: null, saved: null, blocked: false });
  // Change the scope during render so even an event before effects cannot use old saved state.
  if (scopeRef.current.key !== key) scopeRef.current = { key, request: null, ticket: null, saved: null, blocked: false };
  const scope = scopeRef.current;
  const [state, setState] = useState<SavedState>({ scope, saved: false, known: false, busy: false, error: null });
  const displayed = state.scope === scope ? state : { scope, saved: false, known: false, busy: false, error: null };

  async function request(mutate: boolean): Promise<boolean | undefined> {
    if (!enabled || scopeRef.current !== scope || scope.ticket || scope.blocked) return;
    const saved = scope.saved;
    if (mutate && saved === null) return;
    const ticket = {};
    const controller = new AbortController();
    scope.ticket = ticket;
    scope.request = controller;
    const current = () => scopeRef.current === scope && scope.ticket === ticket && !controller.signal.aborted;
    setState({ scope, saved: saved ?? false, known: saved !== null, busy: true, error: null });
    try {
      const response = await boundedFetch(mutate ? "/api/spots/save" : `/api/spots/save?${new URLSearchParams({ spotId })}`, {
        method: mutate ? (saved ? "DELETE" : "POST") : "GET",
        credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { "x-localley-session-id": session.sessionId! },
        ...(mutate ? {
          headers: { "Content-Type": "application/json", "x-localley-session-id": session.sessionId! },
          body: JSON.stringify({ spotId }),
        } : {}),
      });
      if (!current()) return;
      if ([401, 403, 409, 428].includes(response.status)) {
        scope.saved = null;
        scope.blocked = true;
        setState({ scope, saved: false, known: false, busy: true, error: null });
        try {
          await withClientDeadline(() => session.refresh(), controller.signal);
        } catch (error) {
          if (error instanceof ClientRequestTimeoutError) {
            scope.blocked = false;
            throw error;
          }
          throw new Error("Could not refresh your account. Refresh your session before retrying.");
        }
        if (!current()) return;
        scope.blocked = false;
        throw new Error("Your account changed or cannot save spots. Retry to check access.");
      }
      if (!response.ok) throw new Error("Could not check saved status. Retry before saving.");
      const data = await response.json();
      if (!current()) return;
      if (!data || typeof data.saved !== "boolean") throw new Error("Invalid saved status. Retry before saving.");
      scope.saved = data.saved;
      setState({ scope, saved: data.saved, known: true, busy: false, error: null });
      if (mutate) toast({ title: data.saved ? "Spot saved!" : "Spot removed",
        description: data.saved ? "Added to your saved spots" : "Removed from your saved spots" });
      return data.saved;
    } catch (error) {
      if (!current()) return;
      const message = mutate && !scope.blocked
        ? "We could not confirm the update. It may have been saved. Retry to check saved status before changing it."
        : error instanceof Error ? error.message : "Could not check saved status. Please retry.";
      scope.saved = null;
      setState({ scope, saved: false, known: false, busy: false, error: message });
      if (mutate) toast({ title: "Could not update saved spots", description: message, variant: "destructive" });
    } finally {
      if (current()) {
        scope.ticket = null;
        scope.request = null;
      }
    }
  }

  useEffect(() => {
    if (enabled) void request(false);
    return () => {
      scope.request?.abort();
      scope.ticket = null;
    };
    // The scope includes every identity and capability used by this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const toggle = async (): Promise<boolean | undefined> => {
    if (scopeRef.current !== scope) return;
    if (session.status === "signedout") {
      toast({ title: "Sign in to save spots", description: "Keep your favorite places in one trip list." });
      session.requestSignIn(`/spots/${encodeURIComponent(spotId)}`);
      return;
    }
    if (!enabled) return;
    if (scope.saved === null) {
      await request(false);
      return;
    }
    return request(true);
  };

  return {
    isSaved: displayed.saved,
    isLoading: displayed.busy || (enabled && !displayed.known && !displayed.error),
    disabled: scope.blocked || displayed.busy || (session.status !== "signedout" && !enabled)
      || (enabled && !displayed.known && !displayed.error),
    error: displayed.error,
    message: !enabled && session.status !== "signedout" && session.status !== "loading"
      ? "Complete your account setup before saving spots." : displayed.error,
    toggle,
    retry: () => request(false),
  };
}
