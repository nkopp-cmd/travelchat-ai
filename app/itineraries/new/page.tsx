"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ItineraryWizard, WizardData } from "@/components/itineraries/wizard";
import { getTemplateById } from "@/lib/templates";
import { Loader2 } from "lucide-react";

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

function NewItineraryContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const cityParam = searchParams.get("city");
  const daysParam = parseNumberParam(searchParams.get("days"), 1, 7);
  const localnessParam = parseNumberParam(searchParams.get("localness"), 1, 5);
  const interestsParam = parseInterestsParam(searchParams.get("interests"));
  const budgetParam = searchParams.get("budget") as WizardData["budget"] | null;
  const paceParam = searchParams.get("pace") as WizardData["pace"] | null;
  const groupParam = searchParams.get("group");

  // Build initial data from template if provided
  let initialData: Partial<WizardData> = {};
  let initialStep = 0;
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

  return <ItineraryWizard initialData={initialData} initialStep={initialStep} />;
}

export default function NewItineraryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <NewItineraryContent />
    </Suspense>
  );
}
