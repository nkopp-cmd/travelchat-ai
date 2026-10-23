"use client";

/**
 * Minimal session store for the auth hooks: one GET /api/auth/get-session per page,
 * shared by every subscriber, refreshed when the tab becomes visible again.
 */
export interface SessionState {
  data: { user: Record<string, unknown> & { id: string }; session: Record<string, unknown> } | null;
  isPending: boolean;
}

const PENDING: SessionState = { data: null, isPending: true };
const REFRESH_AFTER_MS = 60_000;

let state: SessionState = PENDING;
let inflight: Promise<void> | null = null;
let fetchedAt = 0;
let visibilityBound = false;
const listeners = new Set<() => void>();

function emit(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function refreshSession(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } })
    .then(async (response) => {
      const body = response.ok ? await response.json().catch(() => null) : null;
      emit({ data: body && typeof body === "object" && body.user ? body : null, isPending: false });
    })
    .catch(() => emit({ data: null, isPending: false }))
    .finally(() => { fetchedAt = Date.now(); inflight = null; });
  return inflight;
}

function onVisible() {
  if (document.visibilityState === "visible" && Date.now() - fetchedAt > REFRESH_AFTER_MS) void refreshSession();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  if (state.isPending && !inflight) void refreshSession();
  if (!visibilityBound && typeof document !== "undefined") {
    visibilityBound = true;
    document.addEventListener("visibilitychange", onVisible);
    // A page restored from the back/forward cache may show a session that was signed out since.
    addEventListener("pageshow", (event) => { if ((event as PageTransitionEvent).persisted) void refreshSession(); });
  }
  return () => { listeners.delete(listener); };
}

/**
 * Seed from the server render of a dynamic signed-in page (components/auth/session-seed.tsx),
 * so the first view needs no get-session request. Browser only; only while still pending.
 */
export function primeSession(data: NonNullable<SessionState["data"]>) {
  if (typeof window === "undefined" || !state.isPending || inflight) return;
  state = { data, isPending: false };
  fetchedAt = Date.now();
}

export function getSessionSnapshot(): SessionState { return state; }
export function getSessionServerSnapshot(): SessionState { return PENDING; }

/** Test helper: forget the cached session. */
export function resetSessionStore() { state = PENDING; inflight = null; fetchedAt = 0; }
