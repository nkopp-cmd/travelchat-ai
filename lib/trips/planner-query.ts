import type { WizardData } from "@/components/itineraries/wizard/wizard-context";
import type { ItineraryTemplate } from "@/lib/templates";
import { parsePlannerDraft, parsePlannerSpotId } from "./planner-draft";
import { MIN_CORRIDOR_DAYS } from "./wizard-corridor";

// Pure query -> wizard start state (push AO2). Every value it sets must pass the server schema
// (lib/validations.ts generateItinerarySchema / generateCorridorItinerarySchema) once merged into the
// wizard defaults; __tests__/lib/planner-query.property.test.ts checks that for any query string.
// No zod here: this file ships to the browser.

const ALLOWED_INTERESTS = new Set([
  "Food & Dining", "Cafes & Coffee", "Nightlife & Bars", "Shopping", "Art & Culture",
  "Nature & Parks", "History", "Street Food", "Vintage & Thrift", "Music & Entertainment",
]);
const ALLOWED_BUDGETS = new Set<string>(["cheap", "moderate", "splurge"]);
const ALLOWED_PACES = new Set<string>(["relaxed", "moderate", "active", "packed"]);
const ALLOWED_GROUPS = new Set(["solo", "couple", "friends", "family", "business"]);
export const PLANNER_CITY_MAX = 100;
export const PLANNER_URL_DAYS_MAX = 7;

function parseNumberParam(value: string | null, min: number, max: number) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

function parseInterestsParam(value: string | null) {
  if (!value) return undefined;
  const interests = value.split(",").map((interest) => interest.trim()).filter((interest) => ALLOWED_INTERESTS.has(interest));
  return interests.length ? [...new Set(interests)] : undefined;
}

function parseCityParam(value: string | null) {
  const city = value?.trim().slice(0, PLANNER_CITY_MAX).trim();
  return city ? city : undefined;
}

function templateInterests(focus: string[]) {
  const mapped: string[] = [];
  focus.forEach((item) => {
    const fl = item.toLowerCase();
    if (fl.includes("food") || fl.includes("dining") || fl.includes("restaurant")) mapped.push("Food & Dining");
    else if (fl.includes("cafe") || fl.includes("coffee")) mapped.push("Cafes & Coffee");
    else if (fl.includes("nightlife") || fl.includes("bar") || fl.includes("evening")) mapped.push("Nightlife & Bars");
    else if (fl.includes("shop") || fl.includes("market")) mapped.push("Shopping");
    else if (fl.includes("culture") || fl.includes("art") || fl.includes("museum")) mapped.push("Art & Culture");
    else if (fl.includes("nature") || fl.includes("park")) mapped.push("Nature & Parks");
    else if (fl.includes("histor")) mapped.push("History");
    else if (fl.includes("street food")) mapped.push("Street Food");
    else if (fl.includes("vintage") || fl.includes("thrift")) mapped.push("Vintage & Thrift");
    else if (fl.includes("music") || fl.includes("entertainment")) mapped.push("Music & Entertainment");
    else if (fl.includes("hidden") || fl.includes("local") || fl.includes("authentic")) mapped.push("Art & Culture");
  });
  return [...new Set(mapped.length ? mapped : ["Food & Dining"])];
}

export type PlannerStart = {
  resume: boolean;
  restored: ReturnType<typeof parsePlannerDraft>;
  initialData: Partial<WizardData>;
  initialStep: number;
};

// Template data (~3 KB gzip) is not imported here: only ?template= links need it, so the planner
// client loads lib/templates on demand and passes the lookup in (push CH1).
export type TemplateLookup = (id: string) => ItineraryTemplate | undefined;

/** The ?template= id, or null. The client loads the template data only when this is set. */
export function plannerTemplateId(search: string): string | null {
  return new URLSearchParams(search).get("template") || null;
}

export function plannerStartFromQuery(search: string, rawDraft: string | null, now = Date.now(), findTemplate?: TemplateLookup): PlannerStart {
  const params = new URLSearchParams(search);
  const resume = params.get("resume") === "1";
  const restored = resume ? parsePlannerDraft(rawDraft, now) : null;
  let initialData: Partial<WizardData> = { ...restored?.data };
  let initialStep = restored ? 3 : 0;

  const templateId = params.get("template");
  const template = templateId ? findTemplate?.(templateId) : undefined;
  if (template) {
    initialData = {
      days: Math.min(PLANNER_URL_DAYS_MAX, Math.max(1, template.days)),
      pace: template.pace,
      interests: templateInterests(template.focus),
      templatePrompt: template.prompt,
      templateName: template.name,
    };
  }

  // A ?city= link (spot "Add to trip", dashboard city cards, templates) stays on the city step with the
  // city chosen, so the one-tap "Free N-day plan" shows; "Customize" opens the full form (push AJ1).
  const city = parseCityParam(params.get("city"));
  if (city) initialData.city = city;

  // A restored multi-city draft keeps its corridor, which needs at least MIN_CORRIDOR_DAYS.
  const minDays = initialData.tripMode === "multi" ? MIN_CORRIDOR_DAYS : 1;
  const days = parseNumberParam(params.get("days"), minDays, PLANNER_URL_DAYS_MAX);
  if (days) {
    initialData.days = days;
    initialStep = Math.max(initialStep, 2);
  }
  const interests = parseInterestsParam(params.get("interests"));
  if (interests) {
    initialData.interests = interests;
    initialStep = Math.max(initialStep, 3);
  }
  const localness = parseNumberParam(params.get("localness"), 1, 5);
  if (localness) initialData.localnessLevel = localness;
  const budget = params.get("budget");
  if (budget && ALLOWED_BUDGETS.has(budget)) initialData.budget = budget as WizardData["budget"];
  const pace = params.get("pace");
  if (pace && ALLOWED_PACES.has(pace)) initialData.pace = pace as WizardData["pace"];
  const group = params.get("group");
  if (group && ALLOWED_GROUPS.has(group)) initialData.groupType = group;
  const spotId = parsePlannerSpotId(params.get("spot"));
  if (spotId) initialData.selectedSpotId = spotId;

  return { resume, restored, initialData, initialStep };
}
