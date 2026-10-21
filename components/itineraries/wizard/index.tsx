"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Sparkles } from "@/components/ui/icons";
import { WizardProvider, useWizard, WizardData } from "./wizard-context";
import { WizardProgress } from "./wizard-progress";
import { StepDestination } from "./step-destination";
import { StepDuration } from "./step-duration";
import { StepInterests } from "./step-interests";
import { StepPreferences } from "./step-preferences";
import { getErrorMessage } from "@/lib/error-utils";
import { PLANNER_RESUME_PATH, savePlannerDraft } from "@/lib/trips/planner-draft";

import { GENERATED_PREVIEW_PATH, storeGeneratedPreview } from "@/lib/trips/generated-preview";

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

// Short enough to fit next to Back at 360 px without truncation.
export const WIZARD_GENERATE_LABEL = "Generate trip";

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
}: {
  onGenerate: (data: WizardData) => Promise<void>;
}) {
  const { currentStep, totalSteps, data, canProceed, nextStep, prevStep, goToStep } = useWizard();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
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
        setIsGenerating(false);
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
      ? WIZARD_GENERATE_LABEL
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
          <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
          <div className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2 text-center">
          Creating your itinerary
        </h2>
        <p className="text-primary text-center animate-pulse">
          {progressMessage}
        </p>
        <p className="text-muted-foreground text-sm mt-4">
          This usually takes 20-30 seconds
        </p>
      </div>
    );
  }

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
        className="min-w-0 scroll-mt-[var(--ll-topbar-height)]"
      >
        {steps[currentStep]}
      </div>

      <div className="z-30 shrink-0 bg-black/92 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-10px_26px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:p-4 md:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto max-w-xl">
          {templateApplied && !compactTemplateFooter && (
            <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium leading-none text-foreground sm:mb-2 sm:px-3 sm:text-xs">
              <span className="min-w-0 truncate">{data.templateName}</span>
              <span className="shrink-0 text-foreground">
                Step {currentStep + 1}/{totalSteps}
              </span>
            </div>
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
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={prevStep}
                className="h-10 flex-1 text-foreground hover:bg-raised sm:h-11"
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
                className="hidden h-10 shrink-0 px-2 text-xs text-foreground hover:bg-raised sm:inline-flex sm:h-11 sm:px-3 sm:text-sm"
              >
                <ArrowRight className="mr-1.5 h-4 w-4" />
                Customize
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              className={cn(
                "h-10 min-w-0 flex-1 text-foreground sm:h-11",
                currentStep === 0 && !compactTemplateFooter && "w-full",
                compactTemplateFooter && "w-full px-3 sm:w-auto sm:min-w-[8.5rem] sm:shrink-0",
                canGenerateFromTemplate && "sm:min-w-[9.25rem] sm:max-w-[9.75rem]",
                "bg-primary text-primary-foreground",
                "",
                "",
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
                className="h-10 shrink-0 px-2 text-xs text-foreground hover:bg-raised sm:hidden"
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
}

export function ItineraryWizard({ initialData, initialStep }: ItineraryWizardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const handleGenerate = async (data: WizardData) => {
    try {
      // Preserve inputs before any request or authentication redirect. This grants no paid access.
      savePlannerDraft(localStorage, data);
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

      const result = await response.json();

      if (!response.ok) {
        const errorCode = typeof result.error === "string" ? result.error : result.error?.code;
        const errorMessage = typeof result.message === "string" ? result.message
          : typeof result.error?.message === "string" ? result.error.message : undefined;
        // Handle specific error types
        if (errorCode === "signup_required" || errorCode === "unauthorized") {
          toast({
            title: "Sign up to continue",
            description: errorMessage,
          });
          router.push(`/sign-up?redirect_url=${encodeURIComponent(PLANNER_RESUME_PATH)}`);
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

        throw new Error(errorMessage || (typeof result.error === "string" ? result.error : "Failed to generate itinerary"));
      }

      // Free generation is a full readable browser preview. Saving is a separate paid action.
      if (result.isAnonymous || result.requiresSaveUpgrade) {
        storeGeneratedPreview(localStorage, { ...result.itinerary, city: result.itinerary.city || data.city, days: data.days });
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
    } catch (error) {
      toast({
        title: "Generation failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <WizardProvider initialData={initialData} initialStep={initialStep}>
      <div className="flex min-w-0 flex-col bg-background sm:rounded-2xl md:rounded-none">
        <WizardContent onGenerate={handleGenerate} />
      </div>
    </WizardProvider>
  );
}

export { WizardProvider, useWizard };
export type { WizardData };
