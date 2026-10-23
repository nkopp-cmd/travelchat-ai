"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ItineraryWizard, WizardData } from "@/components/itineraries/wizard";
import type { PlannerCity } from "@/lib/cities-catalog";
import { getTemplateById } from "@/lib/templates";
import { parsePlannerDraft, parsePlannerSpotId, plannerDraftSnapshot, plannerDraftServerSnapshot, subscribePlannerDraft } from "@/lib/trips/planner-draft";

const ALLOWED_INTERESTS = new Set([
  "Food & Dining",
  "Cafes & Coffee",
  "Nightlife & Bars",
  "Shopping",
  "Art & Culture",
  "Nature & Parks",
  "History",
  "Street Food",
  "Vintage & Thrift",
  "Music & Entertainment",
]);

const ALLOWED_BUDGETS = new Set<WizardData["budget"]>(["cheap", "moderate", "splurge"]);
const ALLOWED_PACES = new Set<WizardData["pace"]>(["relaxed", "moderate", "active", "packed"]);

function parseNumberParam(value: string | null, min: number, max: number) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

function parseInterestsParam(value: string | null) {
  if (!value) return undefined;
  const interests = value
    .split(",")
    .map((interest) => interest.trim())
    .filter((interest) => ALLOWED_INTERESTS.has(interest));

  return interests.length ? [...new Set(interests)] : undefined;
}

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
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const rawDraft = useSyncExternalStore(subscribePlannerDraft, plannerDraftSnapshot, plannerDraftServerSnapshot);
  const resume = searchParams.get("resume") === "1";
  const restored = useMemo(() => resume ? parsePlannerDraft(rawDraft) : null, [rawDraft, resume]);
  const templateId = searchParams.get("template");
  const cityParam = searchParams.get("city");
  const daysParam = parseNumberParam(searchParams.get("days"), 1, 7);
  const localnessParam = parseNumberParam(searchParams.get("localness"), 1, 5);
  const interestsParam = parseInterestsParam(searchParams.get("interests"));
  const budgetParam = searchParams.get("budget") as WizardData["budget"] | null;
  const paceParam = searchParams.get("pace") as WizardData["pace"] | null;
  const groupParam = searchParams.get("group");
  const selectedSpotId = parsePlannerSpotId(searchParams.get("spot"));

  // Build initial data from template if provided
  let initialData: Partial<WizardData> = { ...restored?.data };
  let initialStep = restored ? 3 : 0;
  let templateApplied = false;

  if (templateId) {
    const template = getTemplateById(templateId);
    if (template) {
      templateApplied = true;
      // Map template focus to interests
      const mappedInterests: string[] = [];
      template.focus.forEach(focus => {
        const fl = focus.toLowerCase();
        if (fl.includes("food") || fl.includes("dining") || fl.includes("restaurant")) mappedInterests.push("Food & Dining");
        else if (fl.includes("cafe") || fl.includes("coffee")) mappedInterests.push("Cafes & Coffee");
        else if (fl.includes("nightlife") || fl.includes("bar") || fl.includes("evening")) mappedInterests.push("Nightlife & Bars");
        else if (fl.includes("shop") || fl.includes("market")) mappedInterests.push("Shopping");
        else if (fl.includes("culture") || fl.includes("art") || fl.includes("museum")) mappedInterests.push("Art & Culture");
        else if (fl.includes("nature") || fl.includes("park")) mappedInterests.push("Nature & Parks");
        else if (fl.includes("histor")) mappedInterests.push("History");
        else if (fl.includes("street food")) mappedInterests.push("Street Food");
        else if (fl.includes("vintage") || fl.includes("thrift")) mappedInterests.push("Vintage & Thrift");
        else if (fl.includes("music") || fl.includes("entertainment")) mappedInterests.push("Music & Entertainment");
        else if (fl.includes("hidden") || fl.includes("local") || fl.includes("authentic")) mappedInterests.push("Art & Culture");
      });

      initialData = {
        days: template.days,
        pace: template.pace,
        interests: [...new Set(mappedInterests.length ? mappedInterests : ["Food & Dining"])],
        templatePrompt: template.prompt,
        templateName: template.name,
      };
    }
  }

  // Pre-select city from URL param (e.g. from mobile dashboard city cards)
  if (cityParam) {
    initialData.city = cityParam;
    // Dashboard city shortcuts should continue to trip details. Template
    // shortcuts stay on the compact city step so users can generate in one tap
    // or quickly change the suggested city.
    if (!templateApplied) {
      initialStep = 1;
    }
  }

  if (daysParam) {
    initialData.days = daysParam;
    initialStep = Math.max(initialStep, 2);
  }

  if (interestsParam) {
    initialData.interests = interestsParam;
    initialStep = Math.max(initialStep, 3);
  }

  if (localnessParam) {
    initialData.localnessLevel = localnessParam;
  }

  if (budgetParam && ALLOWED_BUDGETS.has(budgetParam)) {
    initialData.budget = budgetParam;
  }

  if (paceParam && ALLOWED_PACES.has(paceParam)) {
    initialData.pace = paceParam;
  }

  if (groupParam) {
    initialData.groupType = groupParam;
  }
  if (selectedSpotId) initialData.selectedSpotId = selectedSpotId;

  return <>
    {resume && <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
      {restored ? "Your trip inputs are restored. Review them before continuing." : "No current saved inputs. Start a new plan."}
    </p>}
    <ItineraryWizard key={`${restored?.savedAt ?? "new"}${search}`} initialData={initialData} initialStep={initialStep} initialCities={initialCities} />
  </>;
}
