"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ItineraryWizard, WizardData } from "@/components/itineraries/wizard";
import { getTemplateById } from "@/lib/templates";
import { Loader2 } from "lucide-react";

function NewItineraryContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const cityParam = searchParams.get("city");

  // Build initial data from template if provided
  let initialData: Partial<WizardData> = {};
  let initialStep = 0;

  if (templateId) {
    const template = getTemplateById(templateId);
    if (template) {
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
      });

      initialData = {
        days: template.days,
        pace: template.pace,
        interests: [...new Set(mappedInterests)],
        templatePrompt: template.prompt,
      };
    }
  }

  // Pre-select city from URL param (e.g. from mobile dashboard city cards)
  if (cityParam) {
    initialData.city = cityParam;
    // Auto-advance past destination step when city is pre-selected
    initialStep = 1;
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
