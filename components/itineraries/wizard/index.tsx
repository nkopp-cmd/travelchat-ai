"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useToast } from "@/hooks/use-toast";
import { LazyToastAction } from "@/components/ui/toast-action-lazy";
import { ArrowLeft, ArrowRight, MapPin, Sparkles } from "@/components/ui/icons";
import { WizardProvider, useWizard, WizardData } from "./wizard-context";
import { PlannerCitiesContext } from "./planner-cities-context";
import type { PlannerCity } from "@/lib/cities-catalog";
import { WizardProgress } from "./wizard-progress";
import { StepDestination } from "./step-destination";

// Push CH1: the first screen is step 0 (city list). Steps 1-3 (Radix Slider, date range, preference
// lists) and the wait screen load as their own chunks, fetched when the browser is idle after the
// first paint, so a ?city= link that opens at step 1 and the Next click find them ready.
const loadDuration = () => import("./step-duration").then((m) => m.StepDuration);
const loadInterests = () => import("./step-interests").then((m) => m.StepInterests);
const loadPreferences = () => import("./step-preferences").then((m) => m.StepPreferences);
const loadGenerating = () => import("./generating-screen").then((m) => m.GeneratingScreen);
const StepDuration = dynamic(loadDuration);
const StepInterests = dynamic(loadInterests);
const StepPreferences = dynamic(loadPreferences);
const GeneratingScreen = dynamic(loadGenerating);

// Push CH1: the footer used <Button> (cn -> tailwind-merge, ~8 KB gzip + Radix Slot) on the planner first screen.
// These are the twMerge results of buttonVariants + the old className overrides, written out without conflicts.
const FOOTER_BASE =
  "items-center justify-center gap-2 whitespace-normal rounded-md font-medium transition-all disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] min-h-11 py-2 has-[>svg]:px-3";
const FOOTER_OUTLINE = `${FOOTER_BASE} h-10 sm:h-11 disabled:opacity-50 bg-secondary text-foreground hover:bg-raised hover:text-accent-foreground`;

export function preloadLaterSteps() {
  return Promise.all([loadDuration(), loadInterests(), loadPreferences(), loadGenerating()]);
}
import { getErrorMessage } from "@/lib/error-utils";
import { PLANNER_RESUME_PATH, savePlannerDraft } from "@/lib/trips/planner-draft";

import { clientNavLanding, funnelSource, trackFunnelStep } from "@/lib/funnel-analytics";
import { plannerLimitPricingHref } from "@/lib/pricing-checkout";

const PROGRESS_MESSAGES = [
  "Finding hidden gems...",
  "Discovering local favorites...",
  "Mapping the best routes...",
  "Adding trip insights...",
  "Curating your perfect trip...",
  "Almost there...",
];

// Network drops (TypeError) and non-JSON answers such as a 502 HTML page (SyntaxError) carry
// browser/parser text; the visitor sees this one sentence and a Try again action instead.
export const GENERATE_FAILED_MESSAGE = "We could not build your trip. Your choices are kept. Try again.";

export function generateFailureText(error: unknown): string {
  if (error instanceof TypeError || error instanceof SyntaxError) return GENERATE_FAILED_MESSAGE;
  return getErrorMessage(error) || GENERATE_FAILED_MESSAGE;
}

/** Push CG3: a 422 carries one mix that passes coverage; the toast offers it as one tap. */
export class PlanSuggestionError extends Error {
  constructor(message: string, readonly patch: Pick<WizardData, "days" | "pace" | "interests">) {
    super(message);
  }
}

/** Push CH3: no mix in this city passes coverage (no suggestion); the toast offers a one-tap city change. */
export class NoPlanCityError extends Error {}
export const PICK_CITY_LABEL = "Pick another city";

const WIZARD_PACES: ReadonlyArray<WizardData["pace"]> = ["relaxed", "moderate", "active", "packed"];

export function parsePlanSuggestion(value: unknown): PlanSuggestionError["patch"] | null {
  if (!value || typeof value !== "object") return null;
  const { days, pace, interests } = value as Record<string, unknown>;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 14) return null;
  if (!WIZARD_PACES.includes(pace as WizardData["pace"])) return null;
  if (!Array.isArray(interests) || !interests.every((item) => typeof item === "string")) return null;
  return { days, pace: pace as WizardData["pace"], interests };
}

export function planSuggestionLabel(patch: PlanSuggestionError["patch"]): string {
  return `Plan ${patch.days} ${patch.days === 1 ? "day" : "days"}`;
}

export function getTemplateFooterCityLabel(city: string): string {
  return city ? `Confirm city: ${city}` : "Pick a city";
}

// Short enough to fit next to Back at 360 px without truncation.
export const WIZARD_GENERATE_LABEL = "Generate trip";

export function getTemplateGenerateLabel(city: string): string {
  return city ? `Generate for ${city}` : "Generate";
}

// Offer change 2026-11-06 (business loop ADJUST): funnel rows showed visitors stop inside the
// 4-step form (31 planner_start -> 2 trip_generated). After the city pick, one tap now builds a
// free plan with the defaults; "Customize" keeps the full form.
export { QUICK_START_OFFER } from "@/lib/offer-copy";
import { QUICK_START_OFFER, SPOT_QUICK_START_OFFER } from "@/lib/offer-copy";
import { spotOfferLine, useHandoffSpotName } from "@/lib/trips/spot-handoff";

export function getQuickStartLabel(days: number): string {
  return `Free ${days}-day plan`;
}

export function canQuickStart(input: {
  currentStep: number;
  templateApplied: boolean;
  city: string;
  tripMode: "single" | "multi";
}): boolean {
  return (
    input.currentStep === 0 &&
    !input.templateApplied &&
    Boolean(input.city) &&
    input.tripMode !== "multi"
  );
}

/** The free-offer line shows on the first step of a plain single-city plan, before and after the city tap (push M). */
export function showsQuickStartOffer(input: {
  currentStep: number;
  templateApplied: boolean;
  tripMode: "single" | "multi";
}): boolean {
  return input.currentStep === 0 && !input.templateApplied && input.tripMode !== "multi";
}

export function getTemplateFooterLayoutClass(compactTemplateFooter: boolean): string {
  return compactTemplateFooter
    ? "grid gap-2 sm:flex sm:items-center sm:gap-3"
    : "flex gap-2.5 sm:gap-3";
}

export function getTemplateFooterControlsClass(compactTemplateFooter: boolean): string {
  return compactTemplateFooter
    ? "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:contents"
    : "contents";
}

function WizardContent({
  onGenerate,
}: {
  onGenerate: (data: WizardData) => Promise<void>;
}) {
  const { currentStep, totalSteps, data, canProceed, nextStep, prevStep, goToStep, setData } = useWizard();
  const handoffSpotName = useHandoffSpotName(data.selectedSpotId);
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const stepScrollRef = useRef<HTMLDivElement | null>(null);
  const isLastStep = currentStep === totalSteps - 1;
  const templateApplied = Boolean(data.templateName);
  const compactTemplateFooter = templateApplied && currentStep === 0;
  const canGenerateFromTemplate = compactTemplateFooter && Boolean(data.city);
  const quickStart = canQuickStart({
    currentStep,
    templateApplied,
    city: data.city,
    tripMode: data.tripMode,
  });
  const canGenerateNow = canGenerateFromTemplate || quickStart;
  const showOffer = showsQuickStartOffer({ currentStep, templateApplied, tripMode: data.tripMode });
  const awaitingCity = showOffer && !data.city;

  // Progress message animation
  useEffect(() => {
    if (!isGenerating) {
      setProgressMessage("");
      return;
    }

    let index = 0;
    setProgressMessage(PROGRESS_MESSAGES[0]);

    const interval = setInterval(() => {
      index = (index + 1) % PROGRESS_MESSAGES.length;
      setProgressMessage(PROGRESS_MESSAGES[index]);
    }, 3000);

    return () => clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    stepScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [currentStep]);

  const runGenerate = async (input: WizardData) => {
    setIsGenerating(true);
    try {
      await onGenerate(input);
    } catch (error) {
      if (error instanceof PlanSuggestionError) {
        const next = { ...input, ...error.patch };
        const label = planSuggestionLabel(error.patch);
        toast({
          title: "Try a smaller plan",
          description: error.message,
          variant: "destructive",
          // Applies the mix the server checked, keeps it in the form, and sends it at once.
          action: <LazyToastAction altText={label} onClick={() => { setData(error.patch); void runGenerate(next); }}>{label}</LazyToastAction>,
        });
        return;
      }
      if (error instanceof NoPlanCityError) {
        toast({
          title: PICK_CITY_LABEL,
          description: error.message,
          variant: "destructive",
          // Clears the city (and a pinned spot of that city) and opens the city step.
          action: <LazyToastAction altText={PICK_CITY_LABEL} onClick={() => { setData({ city: "", selectedSpotId: undefined }); goToStep(0); }}>{PICK_CITY_LABEL}</LazyToastAction>,
        });
        return;
      }
      toast({
        title: "Generation failed",
        description: generateFailureText(error),
        variant: "destructive",
        // Re-sends the same inputs through this path (progress state included).
        action: <LazyToastAction altText="Try again" onClick={() => void runGenerate(input)}>Try again</LazyToastAction>,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNext = async () => {
    if (isLastStep || canGenerateNow) {
      await runGenerate(data);
    } else {
      nextStep();
    }
  };

  const handleCustomizeTemplate = () => {
    nextStep();
  };

  const handleChangeTemplateCity = () => {
    if (currentStep !== 0) {
      goToStep(0);
      return;
    }

    stepScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const primaryActionLabel =
    isLastStep
      ? WIZARD_GENERATE_LABEL
      : canGenerateFromTemplate
        ? getTemplateGenerateLabel(data.city)
        : quickStart
          ? getQuickStartLabel(data.days)
          : currentStep === 0 && !data.city && (templateApplied || awaitingCity)
          ? "Pick a city"
          : "Next";

  const steps = [
    <StepDestination key="destination" />,
    <StepDuration key="duration" />,
    <StepInterests key="interests" />,
    <StepPreferences key="preferences" />,
  ];

  if (isGenerating) {
    return <GeneratingScreen data={data} progressMessage={progressMessage} />;
  }

  // The action bar is fixed to the screen bottom (no bottom nav on /itineraries/new), so it
  // never moves while the city list replaces its skeleton (live CLS 0.12-0.17 when it was in
  // the flow); the step area keeps room for it.
  return (
    <div className="flex min-w-0 flex-col">
      <WizardProgress />

      {templateApplied && !compactTemplateFooter && (
        <div className="mx-3 mt-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-foreground sm:mx-4 sm:mt-2 sm:py-2 sm:text-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate">
              {data.city
                ? `${data.templateName} is ready for ${data.city}. Generate now or change the city.`
                : `${data.templateName} applied. Pick a city and we will keep the template settings.`}
            </span>
          </div>
        </div>
      )}

      <div
        ref={stepScrollRef}
        className="min-w-0 scroll-mt-[var(--ll-topbar-height)] pb-28 sm:pb-32"
      >
        {steps[currentStep]}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-black/92 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-10px_26px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:p-4 md:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto max-w-xl">
          {templateApplied && !compactTemplateFooter && (
            <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium leading-none text-foreground sm:mb-2 sm:px-3 sm:text-xs">
              <span className="min-w-0 truncate">{data.templateName}</span>
              <span className="shrink-0 text-foreground">
                Step {currentStep + 1}/{totalSteps}
              </span>
            </div>
          )}
          {showOffer && (
            <p className="mb-1.5 text-center text-xs font-medium text-foreground sm:mb-2">
              {data.selectedSpotId && data.city ? (handoffSpotName ? spotOfferLine(handoffSpotName) : SPOT_QUICK_START_OFFER) : QUICK_START_OFFER}
            </p>
          )}
          <div className={getTemplateFooterLayoutClass(compactTemplateFooter)}>
            {compactTemplateFooter && (
              <div className="min-w-0 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium leading-tight text-foreground sm:flex-1 sm:px-3 sm:text-xs">
                <span className="block truncate">{data.templateName}</span>
                <span className="block truncate text-foreground">
                  {data.city ? getTemplateFooterCityLabel(data.city) : `Step ${currentStep + 1}/${totalSteps}`}
                </span>
              </div>
            )}
            <div className={getTemplateFooterControlsClass(compactTemplateFooter)}>
            {quickStart && (
              <button
                type="button"
                onClick={nextStep}
                className={clsx(FOOTER_OUTLINE, "inline-flex shrink-0 px-3 text-sm")}
              >
                Customize
              </button>
            )}
            {currentStep > 0 && (
              <button
                type="button"
                onClick={prevStep}
                className={clsx(FOOTER_OUTLINE, "inline-flex flex-1 px-4 text-sm")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </button>
            )}
            {canGenerateFromTemplate && (
              <button
                type="button"
                onClick={handleCustomizeTemplate}
                className={clsx(FOOTER_OUTLINE, "hidden shrink-0 px-2 text-xs sm:inline-flex sm:px-3 sm:text-sm")}
              >
                <ArrowRight className="mr-1.5 h-4 w-4" />
                Customize
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed}
              className={clsx(
                FOOTER_BASE,
                "inline-flex h-10 min-w-0 flex-1 text-sm sm:h-11 bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed",
                compactTemplateFooter ? "px-3" : "px-4",
                ((currentStep === 0 && !compactTemplateFooter && !quickStart) || compactTemplateFooter) && "w-full",
                compactTemplateFooter && "sm:w-auto sm:shrink-0",
                canGenerateFromTemplate
                  ? "sm:min-w-[9.25rem] sm:max-w-[9.75rem]"
                  : compactTemplateFooter && "sm:min-w-[8.5rem]",
                // Before the city tap: an opaque, readable hint instead of a see-through "Next" bar.
                awaitingCity ? "disabled:bg-raised disabled:text-foreground disabled:opacity-100" : "disabled:opacity-50",
              )}
            >
              {isLastStep || canGenerateNow ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{primaryActionLabel}</span>
                </>
              ) : (
                <>
                  {primaryActionLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </button>
            {compactTemplateFooter && data.city && (
              <button
                type="button"
                onClick={handleChangeTemplateCity}
                className={clsx(FOOTER_OUTLINE, "inline-flex shrink-0 px-2 text-xs sm:hidden")}
              >
                <MapPin className="mr-1 h-3.5 w-3.5" />
                Change
              </button>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ItineraryWizardProps {
  initialData?: Partial<WizardData>;
  initialStep?: number;
  /** Destination list from the server render; null -> the step fetches it. */
  initialCities?: PlannerCity[] | null;
}

// One planner_start per page load, on the visitor's first real input in the wizard (click, tap,
// keyboard activation or typing), not on render: page-load counting let bot bursts swamp the funnel
// (261 starts on 2026-11-03, 303 starts vs 2 trips in 30 d). Module flag: remounts do not re-count.
let plannerStartTracked = false;
export function markPlannerStart() {
  if (plannerStartTracked) return;
  plannerStartTracked = true;
  trackFunnelStep("planner_start", funnelSource(document.referrer, location.origin, location.search, clientNavLanding()));
}
/** Test hook: a new page load. */
export function resetPlannerStartForTest() { plannerStartTracked = false; }

export function ItineraryWizard({ initialData, initialStep, initialCities = null }: ItineraryWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1));
    idle(() => { void preloadLaterSteps().catch(() => undefined); });
  }, []);

  // Failures throw to the wizard footer, which shows the toast with a Try again action.
  const handleGenerate = async (data: WizardData) => {
    // Preserve inputs before any request or authentication redirect. This grants no paid access.
    savePlannerDraft(localStorage, data);
    // Push BH3: count the Generate click before the request, so the funnel shows where planner visitors stop.
    trackFunnelStep("plan_requested", funnelSource(document.referrer, location.origin, location.search, clientNavLanding()));
    const isMultiCity = data.tripMode === "multi" && data.citySlugs.length >= 2;
    const response = await fetch("/api/itineraries/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isMultiCity
          ? {
              corridor: {
                destinations: data.citySlugs.map((destinationSlug) => ({ destinationSlug })),
                totalDays: data.days,
              },
              interests: data.interests,
              budget: data.budget,
              localnessLevel: data.localnessLevel,
              pace: data.pace,
              groupType: data.groupType,
            }
          : {
              city: data.city,
              days: data.days,
              interests: data.interests,
              budget: data.budget,
              localnessLevel: data.localnessLevel,
              pace: data.pace,
              groupType: data.groupType,
              templatePrompt: data.templatePrompt,
              spotId: data.selectedSpotId,
            },
      ),
    });

    const result = await response.json().catch(() => null);
    if (!result) throw new Error(GENERATE_FAILED_MESSAGE);

    if (!response.ok) {
      const errorCode = typeof result.error === "string" ? result.error : result.error?.code;
      const errorMessage = typeof result.message === "string" ? result.message
        : typeof result.error?.message === "string" ? result.error.message : undefined;
      // Handle specific error types
      if (errorCode === "signup_required" || errorCode === "unauthorized") {
        // Push BL3: the free plan from the last 24 h is still in this browser. Open it (Save -> sign-up/checkout)
        // instead of a bare sign-up wall, so the visitor sees what they get before the account step.
        // Loaded on demand (push CH1): generated-preview is only needed after a generate call.
        const { GENERATED_PREVIEW_PATH, generatedPreviewSnapshot, parseGeneratedPreview } = await import("@/lib/trips/generated-preview");
        const kept = parseGeneratedPreview(generatedPreviewSnapshot());
        if (kept) {
          toast({
            title: "Your free plan is ready",
            description: `Save your ${kept.itinerary.city} plan to keep it and build more trips.`,
          });
          router.push(GENERATED_PREVIEW_PATH);
          return;
        }
        toast({
          title: "Sign up to continue",
          description: errorMessage,
        });
        router.push(`/sign-up?redirect_url=${encodeURIComponent(PLANNER_RESUME_PATH)}`);
        return;
      }

      if (errorCode === "limit_exceeded") {
        // Free accounts get 1 trip a month. Send them to the plans with the reason (push AP1).
        toast({
          title: "Free trip used this month",
          description: "Pro plans unlimited trips.",
        });
        router.push(plannerLimitPricingHref(result.error?.details?.resetAt));
        return;
      }

      const suggestion = errorCode === "insufficient_verified_spots" ? parsePlanSuggestion(result.suggestion) : null;
      if (suggestion && errorMessage) throw new PlanSuggestionError(errorMessage, suggestion);
      if (errorCode === "insufficient_verified_spots" && result.pickCity === true && errorMessage) throw new NoPlanCityError(errorMessage);

      throw new Error(errorMessage || (typeof result.error === "string" ? result.error : "Failed to generate itinerary"));
    }

    // Same coarse source as planner_start (push AJ3: a spot-led plan counted as "direct").
    trackFunnelStep("trip_generated", funnelSource(document.referrer, location.origin, location.search, clientNavLanding()));
    // Free generation is a full readable browser preview. Saving is a separate paid action.
    if (result.isAnonymous || result.requiresSaveUpgrade) {
      // Same id as the server copy (HttpOnly cookie), so a cold return from sign-up or checkout renders it in HTML.
      const serverId = typeof result.preview?.id === "string" && /^[0-9a-f-]{36}$/.test(result.preview.id) ? result.preview.id : undefined;
      const { GENERATED_PREVIEW_PATH, storeGeneratedPreview } = await import("@/lib/trips/generated-preview");
      storeGeneratedPreview(localStorage, { ...result.itinerary, city: result.itinerary.city || data.city, days: data.days }, Date.now(), serverId);
      router.push(GENERATED_PREVIEW_PATH);
    } else {
      // Authenticated user - redirect to saved itinerary
      toast({
        title: "Itinerary created!",
        description: `${result.itinerary.title} is ready to explore`,
      });

      if (result.itinerary.id) {
        router.push(`/itineraries/${result.itinerary.id}`);
      } else {
        router.push("/itineraries");
      }
    }
  };

  return (
    <PlannerCitiesContext.Provider value={initialCities}>
    <WizardProvider initialData={initialData} initialStep={initialStep}>
      <div className="flex min-w-0 flex-col bg-background sm:rounded-2xl md:rounded-none" onClickCapture={markPlannerStart} onInputCapture={markPlannerStart}>
        <WizardContent onGenerate={handleGenerate} />
      </div>
    </WizardProvider>
    </PlannerCitiesContext.Provider>
  );
}

export { WizardProvider, useWizard };
export type { WizardData };
