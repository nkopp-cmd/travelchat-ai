"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Sparkles } from "lucide-react";
import { WizardProvider, useWizard, WizardData } from "./wizard-context";
import { WizardProgress } from "./wizard-progress";
import { StepDestination } from "./step-destination";
import { StepDuration } from "./step-duration";
import { StepInterests } from "./step-interests";
import { StepPreferences } from "./step-preferences";
import { getErrorMessage } from "@/lib/error-utils";
import { isPlanningSpotId, planningCitiesMatch, type PlanningSpot } from "@/lib/itineraries/spot-planning";

const PROGRESS_MESSAGES = [
  "Finding hidden gems...",
  "Discovering local favorites...",
  "Mapping the best routes...",
  "Adding trip insights...",
  "Curating your perfect trip...",
  "Almost there...",
];

export function getTemplateFooterCityLabel(city: string): string {
  return city ? `Confirm city: ${city}` : "Pick a city";
}

export function getTemplateGenerateLabel(city: string): string {
  return city ? `Generate for ${city}` : "Generate";
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
  selectedSpot,
  onRemoveSpot,
  spotError,
}: {
  onGenerate: (data: WizardData) => Promise<void>;
  selectedSpot?: PlanningSpot | null;
  onRemoveSpot: () => void;
  spotError?: string | null;
}) {
  const { currentStep, totalSteps, data, canProceed, nextStep, prevStep, goToStep } = useWizard();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const stepScrollRef = useRef<HTMLDivElement | null>(null);
  const isLastStep = currentStep === totalSteps - 1;
  const templateApplied = Boolean(data.templateName);
  const compactTemplateFooter = templateApplied && currentStep === 0;
  const canGenerateFromTemplate = compactTemplateFooter && Boolean(data.city);

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

  const handleNext = async () => {
    if (isLastStep || canGenerateFromTemplate) {
      setIsGenerating(true);
      try {
        await onGenerate(data);
      } finally {
        if (mounted.current) setIsGenerating(false);
      }
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
      ? "Generate Itinerary"
      : canGenerateFromTemplate
        ? getTemplateGenerateLabel(data.city)
        : currentStep === 0 && templateApplied && !data.city
          ? "Pick a city"
          : "Next";

  const steps = [
    <StepDestination key="destination" />,
    <StepDuration key="duration" />,
    <StepInterests key="interests" />,
    <StepPreferences key="preferences" />,
  ];

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-full bg-violet-600/20 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
          </div>
          <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2 text-center">
          Creating your itinerary
        </h2>
        <p className="text-violet-400 text-center animate-pulse">
          {progressMessage}
        </p>
        <p className="text-gray-500 text-sm mt-4">
          This usually takes 20-30 seconds
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WizardProgress />

      {templateApplied && !compactTemplateFooter && (
        <div className="mx-3 mt-1.5 rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-100 sm:mx-4 sm:mt-2 sm:py-2 sm:text-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pb-32"
      >
        {spotError && <p role="alert" className="m-4 rounded-lg border border-border bg-background p-4">{spotError}</p>}
        {selectedSpot && (
          <section aria-label="Selected place" className="m-4 space-y-2 rounded-lg border border-border bg-background p-4 text-foreground">
            <p className="break-words font-semibold">{selectedSpot.name} / {selectedSpot.city}</p>
            <p>Choose its day and position after creating your trip.</p>
            {(data.tripMode === "multi" || !planningCitiesMatch(data.city, selectedSpot.city)) && (
              <p>The editor can add this place only to a trip in {selectedSpot.city}. Your selection stays until you remove it.</p>
            )}
            <Button variant="outline" onClick={onRemoveSpot}>Remove selected place</Button>
          </section>
        )}
        {steps[currentStep]}
      </div>

      <div className="z-30 shrink-0 border-t border-white/10 bg-black/92 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-10px_26px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:p-4 md:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto max-w-xl">
          {templateApplied && !compactTemplateFooter && (
            <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-violet-300/15 bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-medium leading-none text-violet-100 sm:mb-2 sm:px-3 sm:text-xs">
              <span className="min-w-0 truncate">{data.templateName}</span>
              <span className="shrink-0 text-violet-200">
                Step {currentStep + 1}/{totalSteps}
              </span>
            </div>
          )}
          <div className={getTemplateFooterLayoutClass(compactTemplateFooter)}>
            {compactTemplateFooter && (
              <div className="min-w-0 rounded-lg border border-violet-300/15 bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-medium leading-tight text-violet-100 sm:flex-1 sm:px-3 sm:text-xs">
                <span className="block truncate">{data.templateName}</span>
                <span className="block truncate text-violet-200/80">
                  {data.city ? getTemplateFooterCityLabel(data.city) : `Step ${currentStep + 1}/${totalSteps}`}
                </span>
              </div>
            )}
            <div className={getTemplateFooterControlsClass(compactTemplateFooter)}>
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={prevStep}
                className="h-10 flex-1 border-white/20 text-white hover:bg-white/10 sm:h-11"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
            {canGenerateFromTemplate && (
              <Button
                type="button"
                variant="outline"
                onClick={handleCustomizeTemplate}
                className="hidden h-10 shrink-0 border-white/20 px-2 text-xs text-white hover:bg-white/10 sm:inline-flex sm:h-11 sm:px-3 sm:text-sm"
              >
                <ArrowRight className="mr-1.5 h-4 w-4" />
                Customize
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              className={cn(
                "h-10 min-w-0 flex-1 sm:h-11",
                currentStep === 0 && !compactTemplateFooter && "w-full",
                compactTemplateFooter && "w-full px-3 sm:w-auto sm:min-w-[8.5rem] sm:shrink-0",
                canGenerateFromTemplate && "sm:min-w-[9.25rem] sm:max-w-[9.75rem]",
                "bg-gradient-to-r from-violet-600 to-indigo-600",
                "hover:from-violet-500 hover:to-indigo-500",
                "shadow-lg shadow-violet-500/30",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLastStep || canGenerateFromTemplate ? (
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
            </Button>
            {compactTemplateFooter && data.city && (
              <Button
                type="button"
                variant="outline"
                onClick={handleChangeTemplateCity}
                className="h-10 shrink-0 border-white/20 px-2 text-xs text-white hover:bg-white/10 sm:hidden"
              >
                <MapPin className="mr-1 h-3.5 w-3.5" />
                Change
              </Button>
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
  selectedSpot?: PlanningSpot | null;
  spotError?: string | null;
}

export function ItineraryWizard({ initialData, initialStep, selectedSpot: initialSpot, spotError }: ItineraryWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedSpot, setSelectedSpot] = useState(initialSpot);
  const [draft, setDraft] = useState<{ itinerary: unknown; signupUrl: string; anonymous: boolean } | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const removeSpot = () => {
    setSelectedSpot(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("spotId");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  };

  const handleGenerate = async (data: WizardData) => {
    if (draft || !mounted.current) return;
    const query = new URLSearchParams({
      city: data.city, days: String(data.days), interests: data.interests.join(","),
      budget: data.budget, pace: data.pace, group: data.groupType, localness: String(data.localnessLevel),
    });
    const template = new URLSearchParams(window.location.search).get("template");
    if (template) query.set("template", template);
    if (data.tripMode === "multi") query.set("cities", data.citySlugs.join(","));
    if (selectedSpot) query.set("spotId", selectedSpot.id);
    const signupUrl = `/sign-up?${new URLSearchParams({ redirect_url: `/itineraries/new?${query}` })}`;
    try {
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
              },
        ),
      });

      if (!mounted.current) return;
      const result = await response.json();
      if (!mounted.current) return;

      // A generated draft is recoverable even when persistence returned an error status.
      if (result.itinerary && (!response.ok || result.success === false || result.isAnonymous || result.stored === false || !isPlanningSpotId(result.itinerary.id))) {
        setDraft({ itinerary: result.itinerary, signupUrl, anonymous: Boolean(result.isAnonymous) });
        return;
      }

      if (!response.ok) {
        const errorCode = typeof result.error === "string" ? result.error : result.error?.code;
        const errorMessage = result.message || result.error?.message;
        // Handle specific error types
        if (errorCode === "signup_required" || errorCode === "unauthorized") {
          toast({
            title: "Sign up to continue",
            description: errorMessage,
          });
          router.push(signupUrl);
          return;
        }

        if (errorCode === "limit_exceeded") {
          toast({
            title: "Limit reached",
            description: errorMessage,
          });
          if (result.upgrade) {
            router.push("/pricing");
          }
          return;
        }

        throw new Error(errorMessage || errorCode || "Failed to generate itinerary");
      }

      if (!isPlanningSpotId(result.itinerary?.id)) throw new Error("No saved itinerary was returned.");
      toast({
        title: "Itinerary created!",
        description: `${result.itinerary.title} is ready to explore`,
      });

      router.push(selectedSpot
        ? `/itineraries/${result.itinerary.id}/edit?${new URLSearchParams({ spotId: selectedSpot.id })}`
        : `/itineraries/${result.itinerary.id}`);
    } catch (error) {
      if (!mounted.current) return;
      toast({
        title: "Generation failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <WizardProvider initialData={initialData} initialStep={initialStep}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background sm:rounded-2xl md:max-h-none md:rounded-none">
        {draft ? (
          <section aria-label="Generated draft" className="space-y-4 overflow-y-auto p-6 text-foreground">
            <h1 className="text-xl font-semibold">Your trip was generated, but not saved</h1>
            <p>This draft stays in this tab only. Download it before leaving or refreshing.</p>
            {selectedSpot && <p>Selected place: {selectedSpot.name}. It has not been added.</p>}
            <p>We cannot safely retry this save here. Keep the download for manual recovery. No new generation will start.</p>
            <Button onClick={() => {
              const url = URL.createObjectURL(new Blob([JSON.stringify({ itinerary: draft.itinerary, selectedSpot }, null, 2)], { type: "application/json" }));
              const link = document.createElement("a");
              link.href = url;
              link.download = "localley-trip-draft.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}>Download draft</Button>
            {draft.anonymous && <p><a className="underline" href={draft.signupUrl}>Sign up after downloading</a>. Your settings and selected place will return, but the draft will not transfer.</p>}
          </section>
        ) : <WizardContent onGenerate={handleGenerate} selectedSpot={selectedSpot} onRemoveSpot={removeSpot} spotError={spotError} />}
      </div>
    </WizardProvider>
  );
}

export { WizardProvider, useWizard };
export type { WizardData };
