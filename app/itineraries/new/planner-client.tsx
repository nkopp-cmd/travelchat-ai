"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ItineraryWizard } from "@/components/itineraries/wizard";
import type { PlannerCity } from "@/lib/cities-catalog";
import { plannerDraftSnapshot, plannerDraftServerSnapshot, subscribePlannerDraft } from "@/lib/trips/planner-draft";
import { plannerStartFromQuery } from "@/lib/trips/planner-query";

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
  const rawDraft = useSyncExternalStore(subscribePlannerDraft, plannerDraftSnapshot, plannerDraftServerSnapshot);
  const { resume, restored, initialData, initialStep } = useMemo(() => plannerStartFromQuery(search, rawDraft), [search, rawDraft]);

  return <>
    {resume && <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
      {restored ? "Your trip inputs are restored. Review them before continuing." : "No current saved inputs. Start a new plan."}
    </p>}
    <ItineraryWizard key={`${restored?.savedAt ?? "new"}${search}`} initialData={initialData} initialStep={initialStep} initialCities={initialCities} />
  </>;
}
