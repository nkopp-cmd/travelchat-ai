import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ basePath: "/api/auth" });
export type Spot = { id: string; name: string | Record<string, string>; description: string | Record<string, string>; category: string; localley_score: number | null; photos: unknown };
export type Saved = { id: string; spot_id: string; spots: Spot | null };
type AppSession = { state: "ready" | "unlinked" | "incomplete"; authUserId: string; sessionId: string; ownerId?: string; userRecordId?: string };
type Context = { phase: "loading" | "signedout" | "unverified" | "error" | "blocked" | AppSession["state"]; session?: AppSession; user?: { name: string; email: string }; saved?: Saved[]; savedError?: string; error?: string; key?: string };
let snapshot: Context = { phase: "loading" };
let epoch = 0;
let controller = new AbortController();
let readVersion = 0;
const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSnapshot = () => snapshot;
const publish = (next: Context) => { snapshot = next; listeners.forEach((listener) => listener()); };
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    const error = body.error;
    throw new ApiError(response.status, error?.code ?? "request_failed", typeof error === "string" ? error : error?.message ?? "Request failed. Please retry.");
  }
  return body as T;
}
export function clearPrivate(phase: Context["phase"] = "loading", error?: string) {
  epoch++;
  controller.abort();
  controller = new AbortController();
  publish({ phase, error });
}
export async function refreshContext() {
  if (snapshot.phase === "blocked") return;
  clearPrivate();
  const ticket = epoch;
  const signal = controller.signal;
  try {
    const identity = await authClient.getSession({ query: { disableCookieCache: true } });
    if (ticket !== epoch) return;
    if (identity.error) throw new ApiError(identity.error.status, "auth_error", "Cannot check sign-in. Please retry.");
    if (!identity.data) { publish({ phase: "signedout" }); return; }
    if (!identity.data.user.emailVerified) { publish({ phase: "unverified" }); return; }
    const session = await api<AppSession>("/api/session", { signal });
    if (ticket !== epoch) return;
    if (session.authUserId !== identity.data.user.id || session.sessionId !== identity.data.session.id) {
      throw new ApiError(409, "session_changed", "Account changed. Check your sign-in before continuing.");
    }
    if (!["ready", "unlinked", "incomplete"].includes(session.state)
      || (session.state === "ready" && (!session.ownerId || !session.userRecordId))) throw new Error("Unknown account mapping. Please retry.");
    publish({ phase: session.state, session, user: { name: identity.data.user.name, email: identity.data.user.email },
      key: JSON.stringify([session.authUserId, session.ownerId, session.sessionId]) });
    if (session.state === "ready") await reloadSaved();
  } catch (error) {
    if (ticket !== epoch) return;
    publish({ phase: error instanceof ApiError && error.status === 401 ? "signedout" : error instanceof ApiError && error.status === 403 ? "unverified" : "error", error: message(error) });
  }
}
export const message = (error: unknown) => error instanceof Error ? error.message : "Request failed. Please retry.";
async function privateFailure(error: unknown) {
  if (error instanceof ApiError && error.code === "session_changed") {
    clearPrivate();
    await refreshContext();
    publish({ ...snapshot, error: "Account changed. Review the current account before trying again." });
  } else if (error instanceof ApiError && [401, 403].includes(error.status)) {
    clearPrivate(error.status === 401 ? "signedout" : "unverified", "Sign in with a verified test account to continue.");
  }
}
export async function reloadSaved() {
  if (snapshot.phase !== "ready") return;
  const ticket = epoch;
  const version = ++readVersion;
  publish({ ...snapshot, savedError: undefined });
  try {
    const data = await api<{ spots: Saved[] }>("/api/spots/save", { signal: controller.signal });
    if (!Array.isArray(data.spots)) throw new Error("Saved places returned an invalid response.");
    if (ticket === epoch && version === readVersion) publish({ ...snapshot, saved: data.spots });
  } catch (error) {
    if (ticket !== epoch || version !== readVersion) return;
    await privateFailure(error);
    if (ticket === epoch) publish({ ...snapshot, savedError: message(error) });
  }
}
const inFlight = new Set<string>();
export const mutationKey = (session: AppSession | undefined, target: string) =>
  JSON.stringify([session?.authUserId, session?.sessionId, session?.ownerId, target]);
export async function mutate(path: string, method: "POST" | "DELETE", spotId?: string) {
  const session = snapshot.session;
  if (!session || snapshot.phase === "blocked") return false;
  const lock = mutationKey(session, spotId ? `${path}/${spotId}` : path);
  if (inFlight.has(lock)) return false;
  inFlight.add(lock);
  publish({ ...snapshot, error: undefined });
  const ticket = epoch;
  try {
    await api(path, { method, signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-localley-session-id": session.sessionId },
      ...(spotId ? { body: JSON.stringify({ spotId }) } : {}) });
    if (ticket !== epoch) return false;
    if (!spotId) {
      await refreshContext();
      const refreshed = getSnapshot();
      return refreshed.phase === "ready" && refreshed.session?.authUserId === session.authUserId
        && refreshed.session?.sessionId === session.sessionId;
    }
    await reloadSaved();
    return ticket === epoch && !snapshot.savedError;
  } catch (error) {
    if (ticket !== epoch) return false;
    await privateFailure(error);
    if (ticket === epoch) publish({ ...snapshot, error: message(error) });
    return false;
  } finally { inFlight.delete(lock); }
}
export async function logout() {
  clearPrivate("blocked");
  try {
    const result = await authClient.signOut();
    if (result.error) throw new Error("Sign-out failed. Private places stay hidden. Retry sign-out.");
    clearPrivate("signedout");
  } catch {
    publish({ phase: "blocked", error: "Sign-out failed. Private places stay hidden. Retry sign-out." });
  }
}
