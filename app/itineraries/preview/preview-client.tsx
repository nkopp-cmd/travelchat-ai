"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { LocalleySignup } from "@/components/newsletter/localley-signup";
import { trackFunnelStep } from "@/lib/funnel-analytics";
import { dropPaymentParam, waitForPaidTier } from "@/lib/trips/paid-return";
import { GENERATED_PREVIEW_KEY, GENERATED_PREVIEW_PATH, type GeneratedPreview, parseGeneratedPreview, generatedPreviewSnapshot, generatedPreviewServerSnapshot, subscribeGeneratedPreview } from "@/lib/trips/generated-preview";

function Preview({ initialDraft }: { initialDraft: GeneratedPreview | null }) {
  const router = useRouter(), search = useSearchParams(), { isLoaded, isSignedIn } = useUser();
  const raw = useSyncExternalStore(subscribeGeneratedPreview, generatedPreviewSnapshot, generatedPreviewServerSnapshot);
  // The server copy (cookie + KV) renders in the first HTML; the browser copy takes over after hydration.
  const draft = useMemo(() => parseGeneratedPreview(raw) ?? initialDraft, [raw, initialDraft]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const viewed = useRef(false);
  useEffect(() => {
    if (!draft || viewed.current) return;
    viewed.current = true;
    trackFunnelStep("preview_view", "preview");
  }, [draft]);
  const returned = useRef(false), paidReturn = useRef(search.get("payment") === "success"), unmounted = useRef(false);
  const [checkoutClosed, setCheckoutClosed] = useState(false);
  useEffect(() => { unmounted.current = false; return () => { unmounted.current = true; }; }, []);
  useEffect(() => {
    if (search.get("payment") !== "canceled") return;
    dropPaymentParam(); setCheckoutClosed(true);
  }, [search]);
  async function save() {
    if (!draft || busy) return;
    if (!isSignedIn) { router.push(`/sign-up?redirect_url=${encodeURIComponent(GENERATED_PREVIEW_PATH)}`); return; }
    setBusy(true); setError("");
    try {
      // Always ask the server. A checkout URL or browser draft never grants paid access.
      const response = await fetch("/api/itineraries/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        draftId: draft.id, title: draft.itinerary.title, city: draft.itinerary.city, days: draft.itinerary.days,
        activities: draft.itinerary.dailyPlans, insights: draft.itinerary.insights, localScore: draft.itinerary.localScore,
      }) });
      const data = await response.json();
      if (response.status === 402) {
        if (paidReturn.current) throw new Error("Payment confirmation is still processing. Try saving again shortly; no new checkout is needed.");
        trackFunnelStep("checkout_start", "preview");
        const checkout = await fetch("/api/subscription/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: "pro", billingCycle: "monthly", returnTo: "itinerary-preview" }) });
        const result = await checkout.json();
        if (!checkout.ok || !result.url) throw new Error(result.error?.message || "Checkout is unavailable. Your itinerary is still here.");
        const target = new URL(result.url); if (target.protocol !== "https:" || target.hostname !== "checkout.stripe.com") throw new Error("Unexpected checkout address.");
        window.location.assign(target.toString()); return;
      }
      if (!response.ok || !data.id) throw new Error(data.error?.message || "Could not save. Your itinerary remains in this browser.");
      localStorage.removeItem(GENERATED_PREVIEW_KEY); router.push(`/itineraries/${data.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save your itinerary."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!draft || !isLoaded || !isSignedIn || search.get("payment") !== "success" || returned.current) return;
    returned.current = true;
    // Bounded re-reads (webhook delay), then one save. Never another automatic checkout.
    void (async () => {
      const result = await waitForPaidTier(async () => { const r = await fetch("/api/subscription/status", { cache: "no-store" }); const s = await r.json(); return r.ok ? s.tier : null; }, { stopped: () => unmounted.current });
      if (result === "stopped") return;
      dropPaymentParam();
      if (result === "pending") { setError("Payment confirmation is still processing. Your itinerary is safe here. Try saving again shortly."); return; }
      await save();
    })();
    // The return is deliberately consumed once for this loaded draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, isLoaded, isSignedIn, search]);
  if (!draft) return <section className="mx-auto max-w-xl space-y-5 p-6"><h1 className="text-2xl font-semibold">Start with a trip idea</h1><p>This browser has no current itinerary preview. Unsaved previews last 24 hours.</p><Button asChild><Link href="/itineraries/new">Start planning</Link></Button></section>;
  return <section aria-label="Generated itinerary" className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6">
    <header className="space-y-4"><p className="text-sm text-muted-foreground">Your trip, ready to explore · Not saved yet</p><h1 className="break-words text-3xl font-semibold tracking-tight sm:text-5xl">{draft.itinerary.title}</h1><p className="text-muted-foreground">{draft.itinerary.city} · {draft.itinerary.days} days</p><p>View your full itinerary free. Pro saves it to your account and unlocks editing, from $9/month. Existing paid members can save now.</p><p className="text-sm text-muted-foreground">Kept on this browser for 24 hours. Use the same browser to sign up and complete checkout.</p>{checkoutClosed && <p role="status" data-testid="preview-checkout-closed" className="rounded-lg bg-raised px-4 py-3 text-sm text-foreground">Checkout closed. You were not charged. Your itinerary is still here.</p>}</header>
    {draft.itinerary.dailyPlans.map((day, i) => <section key={i} className="space-y-5 rounded-3xl bg-card p-5 shadow-lg sm:p-8"><div><p className="text-sm font-medium text-primary">Day {day.day}</p><h2 className="mt-2 text-xl font-semibold">{day.theme || `Explore ${draft.itinerary.city}`}</h2></div><ol className="space-y-6">{day.activities.map((activity, j) => <li key={j} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4"><span className="text-sm text-muted-foreground">{activity.time || `${j + 1}`}</span><div className="min-w-0 space-y-2"><h3 className="break-words font-semibold">{activity.name}</h3>{activity.description && <p className="break-words text-sm leading-6 text-muted-foreground">{activity.description}</p>}{typeof activity.address === "string" && <p className="break-words text-sm text-muted-foreground">{activity.address}</p>}{(typeof activity.duration === "string" || typeof activity.cost === "string") && <p className="text-sm text-muted-foreground">{[activity.duration, activity.cost].filter((value): value is string => typeof value === "string").join(" · ")}</p>}</div></li>)}</ol></section>)}
    {draft.itinerary.insights && draft.itinerary.insights.length > 0 && <section className="space-y-3 rounded-3xl bg-card p-6"><h2 className="text-xl font-semibold">Good to know</h2><ul className="space-y-3 text-sm leading-6 text-muted-foreground">{draft.itinerary.insights.map((insight, i) => { const text = typeof insight === "string" ? insight : insight && typeof insight === "object" && "text" in insight && typeof insight.text === "string" ? insight.text : null; return text ? <li key={i}>{text}</li> : null; })}</ul></section>}
    <section className="space-y-4 rounded-3xl bg-secondary p-6"><h2 className="text-xl font-semibold">Make this trip yours</h2><p>Save it, then adjust the stops and timing. Pro is a subscription, not a charge for each edit.</p>{error && <p role="alert">{error}</p>}<Button disabled={!isLoaded || busy} onClick={() => void save()} className="min-h-12 h-auto whitespace-normal">{busy ? "Keeping your itinerary ready…" : "Save & unlock editing"}</Button><p className="text-sm text-muted-foreground">No payment is needed to read this itinerary. Cancel checkout to return here.</p></section>
    {/* Not ready to pay: keep the visitor by email (double opt-in, plain form, 0 KB JS). */}
    <LocalleySignup source="preview" heading={`More ${draft.itinerary.city} picks by email`} />
  </section>;
}
export default function PreviewClient({ initialDraft }: { initialDraft: GeneratedPreview | null }) { return <Suspense fallback={<p className="p-6">Opening your itinerary…</p>}><Preview initialDraft={initialDraft} /></Suspense>; }
