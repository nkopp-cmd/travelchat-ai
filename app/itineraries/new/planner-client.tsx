"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from "react";
import { ItineraryWizard } from "@/components/itineraries/wizard";
import type { PlannerCity } from "@/lib/cities-catalog";
import { plannerDraftSnapshot, plannerDraftServerSnapshot, subscribePlannerDraft } from "@/lib/trips/planner-draft";
import { plannerStartFromQuery, plannerTemplateId, type TemplateLookup } from "@/lib/trips/planner-query";

// The query is read in the browser only: the server renders the plain planner (step 0 with
// the city list) once for everyone, and hydration sees the same empty query. Links with
// ?city/?days/?template/?resume then start the wizard at their step (keyed remount).
function subscribeSearch(onChange: () => void) {
  addEventListener("popstate", onChange);
  return () => removeEventListener("popstate", onChange);
}
const searchSnapshot = () => location.search;
const searchServerSnapshot = () => "";

export function NewItineraryClient({ initialCities }: { initialCities: PlannerCity[] | null }) {
  const search = useSyncExternalStore(subscribeSearch, searchSnapshot, searchServerSnapshot);
  // ?payment= is read by PlannerPaidReturn and then dropped; it must not remount the wizard.
  const wizardKey = useMemo(() => { const p = new URLSearchParams(search); p.delete("payment"); return p.toString(); }, [search]);
  const rawDraft = useSyncExternalStore(subscribePlannerDraft, plannerDraftSnapshot, plannerDraftServerSnapshot);
  // Template data loads only for ?template= links (push CH1: ~3 KB gzip off the first screen).
  const templateId = plannerTemplateId(search);
  const [findTemplate, setFindTemplate] = useState<TemplateLookup | null>(null);
  useEffect(() => {
    if (!templateId || findTemplate) return;
    let live = true;
    import("@/lib/templates").then((m) => { if (live) setFindTemplate(() => m.getTemplateById); });
    return () => { live = false; };
  }, [templateId, findTemplate]);
  // The Stripe return notice loads only for ?payment=success (push CH1). Latched: it drops the param itself.
  const [PaidReturn, setPaidReturn] = useState<ComponentType | null>(null);
  const paymentReturn = new URLSearchParams(search).get("payment") === "success";
  useEffect(() => {
    if (!paymentReturn || PaidReturn) return;
    let live = true;
    import("@/components/itineraries/planner-paid-return").then((m) => { if (live) setPaidReturn(() => m.PlannerPaidReturn); });
    return () => { live = false; };
  }, [paymentReturn, PaidReturn]);
  const templatePending = Boolean(templateId) && !findTemplate;
  const { resume, restored, initialData, initialStep } = useMemo(
    () => plannerStartFromQuery(search, rawDraft, Date.now(), findTemplate ?? undefined), [search, rawDraft, findTemplate]);

  return <>
    {PaidReturn && <PaidReturn />}
    {resume && <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
      {restored ? "Your trip inputs are restored. Review them before continuing." : "No current saved inputs. Start a new plan."}
    </p>}
    {templatePending ? <div className="min-h-[60vh]" aria-busy="true" /> : <ItineraryWizard key={`${restored?.savedAt ?? "new"}${wizardKey}`} initialData={initialData} initialStep={initialStep} initialCities={initialCities} />}
  </>;
}
