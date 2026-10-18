"use client";
import { useEffect, useRef, useState } from "react";
import { Heart } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/auth/client";
import { savedSpotCandidateUrl } from "@/lib/app-data/saved-spot-candidate-url";

type State = "loading" | "ready" | "pending" | "unavailable" | "uncertain";

/** No source fallback, external delivery, XP or automatic mutation retry. */
export function PreviewSaveSpotButton({ spotId, spotName, actorId }: {
  spotId: string; spotName: string; actorId: string;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const [state, setState] = useState<State>("loading");
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const admitted = isLoaded && isSignedIn && user?.id === actorId;
  useEffect(() => {
    const run = ++generation.current;
    setState("loading"); setSaved(false);
    if (!isLoaded) return;
    const url = savedSpotCandidateUrl(spotId);
    if (!admitted || !url) { setState("unavailable"); return; }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal,
          headers: { "X-Localley-Preview-Actor": actorId } });
        const body: unknown = await response.json();
        if (!response.ok || response.headers.get("X-Localley-Data-Source") !== "d1-preview"
          || !body || typeof body !== "object" || typeof (body as { saved?: unknown }).saved !== "boolean")
          throw new Error("Unavailable save state");
        if (run !== generation.current) return;
        setSaved((body as { saved: boolean }).saved); setState("ready");
      } catch { if (run === generation.current) setState("unavailable"); }
    })();
    return () => { ++generation.current; controller.abort(); };
  }, [actorId, spotId, admitted, isLoaded]);

  async function toggle() {
    if (busy.current || state !== "ready") return;
    const url = savedSpotCandidateUrl();
    if (!admitted || !url) { setState("unavailable"); return; }
    busy.current = true; setState("pending");
    const run = generation.current;
    const expected = !saved;
    try {
      const response = await fetch(url, { method: saved ? "DELETE" : "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Localley-Preview-Actor": actorId },
        body: JSON.stringify({ spotId }) });
      const body: unknown = await response.json();
      if (!response.ok || response.headers.get("X-Localley-Data-Source") !== "d1-preview"
        || !body || typeof body !== "object" || (body as { saved?: unknown }).saved !== expected)
        throw new Error("Unconfirmed save");
      if (run !== generation.current) return;
      setSaved(expected); setState("ready");
    } catch { if (run === generation.current) setState("uncertain"); }
    finally { busy.current = false; }
  }
  const message = state === "uncertain" ? "Save result unknown. Reload to check."
    : state === "unavailable" || !admitted ? "Saving unavailable."
    : state === "loading" ? "Loading saved status…" : null;
  return <div className="max-w-56 text-right">
    <Button type="button" variant="secondary" className="min-h-11 min-w-11"
      disabled={state !== "ready" || !admitted} onClick={() => void toggle()}
      aria-pressed={saved} aria-busy={state === "pending" || state === "loading"}
      aria-label={saved ? `Remove ${spotName} from saved spots` : `Save ${spotName}`}>
      <Heart className={`mr-2 h-4 w-4 ${saved ? "fill-current" : ""}`} aria-hidden="true" />
      {saved ? "Saved" : "Save"}
    </Button>
    {message && <p role="status" className="mt-2 rounded bg-black/80 p-2 text-xs text-white">{message}</p>}
  </div>;
}
