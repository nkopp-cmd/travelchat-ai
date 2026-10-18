"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Copy, Check, Loader2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { itineraryCopyCandidateUrl } from "@/lib/app-data/itinerary-copy-candidate-url";

/** Rendered only after the candidate page verifies its fresh owner. */
export function PreviewCopyButton({ itineraryId, actorId, title }: {
  itineraryId: string; actorId: string; title: string;
}) {
  const attempted = useRef(false);
  const [state, setState] = useState<"idle" | "pending" | "saved" | "unknown" | "unavailable">("idle");
  const [copyId, setCopyId] = useState<string | null>(null);
  // The private detail page accepts 200 characters, including the seven-character suffix.
  if (title.length > 193) return <p className="max-w-xs text-sm text-muted-foreground">
    Shorten the title before making a copy.
  </p>;
  const copy = async () => {
    if (attempted.current) return;
    attempted.current = true;
    const url = itineraryCopyCandidateUrl(itineraryId);
    if (!url || !actorId || actorId.length > 100) { setState("unavailable"); return; }
    setState("pending");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, { method: "POST", credentials: "same-origin",
        headers: { "X-Localley-Preview-Actor": actorId }, signal: controller.signal });
      const data = await response.json();
      if (response.status !== 200 || response.headers.get("X-Localley-Data-Source") !== "d1-preview"
        || typeof data.id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(data.id)
        || data.id === itineraryId.toLowerCase() || data.clerk_user_id !== actorId || data.status !== "draft"
        || data.shared !== false || data.is_public !== false || data.is_favorite !== false || data.share_code !== null) {
        throw new Error("Copy not confirmed");
      }
      setCopyId(data.id); setState("saved");
    } catch { setState("unknown"); }
    finally { clearTimeout(timeout); }
  };
  return <div className="flex max-w-full flex-wrap items-center gap-2">
    <Button variant="outline" className="min-h-11 gap-2" disabled={state !== "idle"}
      aria-busy={state === "pending"} onClick={copy}>
      {state === "pending" ? <Loader2 className="h-4 w-4 animate-spin" />
        : state === "saved" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {state === "pending" ? "Copying..." : state === "saved" ? "Copy saved" : "Make a copy"}
    </Button>
    {copyId && <Link className="inline-flex min-h-11 items-center text-sm text-violet-200 underline"
      prefetch={false} href={`/itineraries/${copyId}?data_candidate=d1`}>View copy</Link>}
    {(state === "unknown" || state === "unavailable") && <p role="alert" className="max-w-xs text-sm text-muted-foreground">
      {state === "unknown" ? "Could not confirm the copy. " : "Copy is unavailable here. "}<Link prefetch={false} href="/itineraries?data_candidate=d1"
        className="underline">Check your trips</Link>{state === "unknown" ? " before trying again." : "."}
    </p>}
    <span role="status" className="sr-only">{state === "saved" ? "Your private copy is saved." : ""}</span>
  </div>;
}
