// Push CL1: a visitor who taps "Plan a free trip" on a spot page lands on the planner, whose HTML is one
// shared edge-cached render for every query (QUERY_FREE_PATHS). The spot page stores the spot's name for
// this tab on click, so the planner can name the place without a lookup request and without trusting
// a name in the URL (a crafted link cannot put text on our page).
import { useSyncExternalStore } from "react";

export const HANDOFF_KEY = "localley:planner-spot";
const MAX_NAME = 48;

export function cleanHandoffName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const flat = name.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > MAX_NAME ? `${flat.slice(0, MAX_NAME - 1).trimEnd()}…` : flat;
}

export function rememberHandoffSpot(id: string, name: string, store: Pick<Storage, "setItem"> | null = safeSession()) {
  const clean = cleanHandoffName(name);
  if (!store || !clean) return;
  try { store.setItem(HANDOFF_KEY, JSON.stringify({ id, name: clean })); } catch { /* private mode / quota: plain hand-off */ }
}

export function readHandoffName(raw: string | null, spotId: string | undefined): string | null {
  if (!raw || !spotId) return null;
  try {
    const value = JSON.parse(raw) as { id?: unknown; name?: unknown };
    return value && value.id === spotId ? cleanHandoffName(value.name) : null;
  } catch {
    return null;
  }
}

export function spotOfferLine(name: string): string {
  return `${name} is in your plan · first plan free · no sign-up`;
}

function safeSession(): Storage | null {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; }
}

const noSubscribe = () => () => {};
const rawSnapshot = () => safeSession()?.getItem(HANDOFF_KEY) ?? null;
const serverSnapshot = () => null;

/** The stored name of the spot this planner run starts from, or null (server render, other spot, no click). */
export function useHandoffSpotName(spotId: string | undefined): string | null {
  const raw = useSyncExternalStore(noSubscribe, rawSnapshot, serverSnapshot);
  return readHandoffName(raw, spotId);
}
