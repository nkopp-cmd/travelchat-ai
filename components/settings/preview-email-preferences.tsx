"use client";
import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { previewEmailPreferencesUrl } from "@/lib/app-data/email-preferences-candidate-url";
const fields = { marketing: "Marketing", weekly_digest: "Weekly digest", product_updates: "Product updates", itinerary_shared: "Shared itineraries" };
type Preferences = Record<keyof typeof fields, boolean>;
function preferences(value: unknown): Preferences {
  if (!value || typeof value !== "object" || !("preferences" in value)) throw new Error("Unavailable");
  const result = value.preferences;
  if (!result || typeof result !== "object" || Object.keys(fields).some(key => typeof (result as Record<string, unknown>)[key] !== "boolean")) throw new Error("Unavailable");
  return result as Preferences;
}
export function PreviewEmailPreferences() {
  const [stored, setStored] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const url = previewEmailPreferencesUrl();
        if (!url) throw new Error("Unavailable");
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unavailable");
        const value = preferences(await response.json());
        if (!controller.signal.aborted) setStored(value);
      } catch { if (!controller.signal.aborted) setMessage("Preview email preferences are unavailable."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, []);
  async function save(key: keyof Preferences, checked: boolean) {
    if (lock.current) return;
    lock.current = true; setPending(true); setMessage("");
    try {
      const url = previewEmailPreferencesUrl();
      if (!url) throw new Error("Unavailable");
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { [key]: checked } }) });
      if (!response.ok) throw new Error("Unavailable");
      setStored(preferences(await response.json()));
      setMessage("Preview choices saved. No email was sent.");
    } catch { setMessage("Could not confirm the save. Reload to check your saved choices."); }
    finally { lock.current = false; setPending(false); }
  }
  return <section aria-label="Preview email preferences" className="space-y-4">
    <p className="text-sm text-muted-foreground">Preview choices only. Emails are not sent from this preview.</p>
    {loading ? <p role="status">Loading preview choices...</p> : stored ? Object.entries(fields).map(([key, label]) => {
      const field = key as keyof Preferences;
      return <div key={key} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
        <Label htmlFor={`preview-email-${key}`}>{label}</Label>
        <Switch id={`preview-email-${key}`} checked={stored[field]} disabled={pending} onCheckedChange={checked => { void save(field, checked); }} />
      </div>;
    }) : null}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
