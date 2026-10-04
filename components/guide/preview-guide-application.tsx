"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppBackground } from "@/components/layout/app-background";
import { previewGuideApplicationUrl } from "@/lib/app-data/guide-application-candidate-url";
import type { PreviewGuideApplicationState } from "@/lib/app-data/preview-guide-application-page";
const cities = ["Seoul", "Tokyo", "Bangkok", "Singapore"];
const specialties = ["Food & Dining", "Culture & History", "Nightlife", "Nature & Outdoors", "Shopping", "Architecture", "Art & Museums", "Local Hidden Gems"];

export function PreviewGuideApplication({ state }: { state: PreviewGuideApplicationState }) {
  const [bio, setBio] = useState("");
  const [selectedCities, setCities] = useState<string[]>([]);
  const [selectedSpecialties, setSpecialties] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const toggle = (list: string[], item: string) => list.includes(item) ? list.filter(value => value !== item) : [...list, item];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || confirmed || uncertain || state.kind !== "new") return;
    if (!bio.trim() || bio.trim().length > 2000 || !selectedCities.length) {
      setMessage("Add a short biography and select at least one city."); return;
    }
    const url = previewGuideApplicationUrl();
    if (!url) { setMessage("Preview access is unavailable. Reload the preview page."); return; }
    lock.current = true; setPending(true); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bio.trim(), cities: selectedCities.map(city => city.toLowerCase()), specialties: selectedSpecialties }),
      });
      const value: unknown = await response.json();
      if (!response.ok || response.headers.get("X-Localley-Data-Source") !== "d1-preview"
        || !value || typeof value !== "object" || !("status" in value) || value.status !== "pending"
        || "url" in value) throw new Error("Save unconfirmed");
      setConfirmed(true);
    } catch {
      setUncertain(true); setMessage("Could not confirm the save. Reload to check your saved application.");
    } finally { lock.current = false; setPending(false); }
  }
  const saved = state.kind === "pending";
  const disabled = pending || uncertain;
  return <AppBackground ambient className="min-h-screen">
    <main className="mx-auto max-w-3xl space-y-6 px-4 pb-28 pt-8 sm:px-6 sm:pb-12">
      <Link href="/settings?data_candidate=d1" className="inline-flex min-h-11 items-center text-sm text-white/75 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
        <ArrowLeft className="mr-2 h-4 w-4" /> Preview settings
      </Link>
      <header><Badge className="mb-3">Creator program preview</Badge><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Share your local expertise</h1>
        <p className="mt-3 max-w-xl text-white/75">Tell us which cities you know and what you love to show travelers.</p>
      </header>
      <Card className="liquid-panel border-white/10">
        <CardHeader><CardTitle>Guide application</CardTitle><CardDescription>Preview applications only. Payments, Stripe onboarding and email delivery are unavailable here.</CardDescription></CardHeader>
        <CardContent>
          {state.kind === "unavailable" ? <p role="status">Preview guide applications are unavailable for this account.</p>
            : saved || confirmed ? <section aria-label="Saved preview application" className="space-y-4">
              <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-5 w-5 text-violet-300" /> Pending application</div>
              <p role="status">Your preview application is stored. Approval and payments remain unavailable.</p>
              {saved ? <dl className="space-y-4 text-sm"><div><dt className="font-medium">About you</dt><dd className="mt-1 whitespace-pre-wrap break-words text-white/75">{state.bio}</dd></div>
                <div><dt className="font-medium">Your cities</dt><dd className="mt-1 text-white/75">{state.cities.join(", ")}</dd></div>
                <div><dt className="font-medium">Specialties</dt><dd className="mt-1 text-white/75">{state.specialties.join(", ") || "None selected"}</dd></div></dl>
                : <p className="text-sm text-white/75">Reload to view your saved details.</p>}
            </section>
            : <form onSubmit={submit} className="space-y-6" aria-label="Preview guide application">
              <div className="space-y-2"><Label htmlFor="preview-guide-bio">About you</Label><Textarea id="preview-guide-bio" value={bio} onChange={event => setBio(event.target.value)} maxLength={2000} rows={5} disabled={disabled} required placeholder="What makes your local experiences special?" />
                <p className="text-sm text-white/65">Up to 2,000 characters.</p></div>
              <fieldset disabled={disabled} className="space-y-2"><legend className="mb-2 text-sm font-medium">Your cities</legend>
                <p className="text-sm text-white/65">Select at least one city.</p><div className="flex flex-wrap gap-2">{cities.map(city => <Button key={city} type="button" variant="outline" aria-pressed={selectedCities.includes(city)} onClick={() => setCities(toggle(selectedCities, city))} className={`min-h-11 ${selectedCities.includes(city) ? "border-violet-300 bg-violet-500/30 text-white" : "border-white/20 text-white/80"}`}>{city}</Button>)}</div></fieldset>
              <fieldset disabled={disabled} className="space-y-2"><legend className="mb-2 text-sm font-medium">Specialties</legend><div className="flex flex-wrap gap-2">{specialties.map(specialty => <Button key={specialty} type="button" variant="outline" aria-pressed={selectedSpecialties.includes(specialty)} onClick={() => setSpecialties(toggle(selectedSpecialties, specialty))} className={`min-h-11 ${selectedSpecialties.includes(specialty) ? "border-violet-300 bg-violet-500/30 text-white" : "border-white/20 text-white/80"}`}>{specialty}</Button>)}</div></fieldset>
              <Button type="submit" size="lg" className="w-full min-h-11" disabled={disabled || !bio.trim() || !selectedCities.length}>{pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> Saving...</> : "Submit preview application"}</Button>
              {message && <p role="status" className="text-sm">{message}</p>}
            </form>}
        </CardContent>
      </Card>
    </main>
  </AppBackground>;
}
