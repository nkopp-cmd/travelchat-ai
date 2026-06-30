"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { WizardProvider, useWizard, WizardData } from "./wizard-context";
import { WizardProgress } from "./wizard-progress";
import { StepDestination } from "./step-destination";
import { StepDuration } from "./step-duration";
import { StepInterests } from "./step-interests";
import { StepPreferences } from "./step-preferences";
import { getErrorMessage } from "@/lib/error-utils";

const PROGRESS_MESSAGES = [
  "Finding hidden gems...",
  "Discovering local favorites...",
  "Mapping the best routes...",
  "Adding trip insights...",
  "Curating your perfect trip...",
  "Almost there...",
];

function WizardContent({
  onGenerate,
}: {
  onGenerate: (data: WizardData) => Promise<void>;
}) {
  const { currentStep, totalSteps, data, canProceed, nextStep, prevStep } = useWizard();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");

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

  const handleNext = async () => {
    if (currentStep === totalSteps - 1) {
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

  const isLastStep = currentStep === totalSteps - 1;
  const templateApplied = Boolean(data.templateName);
  const primaryActionLabel =
    isLastStep ? "Generate Itinerary" : currentStep === 0 && templateApplied && !data.city ? "Pick a city" : "Next";

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
    <div className="flex h-full min-h-0 flex-col">
      <WizardProgress />

      {templateApplied && (
        <div className="mx-4 mt-2 rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-100 sm:mt-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
            <span className="min-w-0 truncate">
              {data.templateName} applied. Pick a city and we will keep the template settings.
            </span>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {steps[currentStep]}
      </div>

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-white/10 bg-black/92 p-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-14px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-3 md:p-4 md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md">
          {templateApplied && (
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-violet-300/15 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-100">
              <span className="min-w-0 truncate">{data.templateName}</span>
              <span className="shrink-0 text-violet-200">
                Step {currentStep + 1}/{totalSteps}
              </span>
            </div>
          )}
          <div className="flex gap-2.5 sm:gap-3">
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
          <Button
            onClick={handleNext}
            disabled={!canProceed}
            className={cn(
              "h-10 flex-1 sm:h-11",
              currentStep === 0 && "w-full",
              "bg-gradient-to-r from-violet-600 to-indigo-600",
              "hover:from-violet-500 hover:to-indigo-500",
              "shadow-lg shadow-violet-500/30",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isLastStep ? (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {primaryActionLabel}
              </>
            ) : (
              <>
                {primaryActionLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
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
      const response = await fetch("/api/itineraries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: data.city,
          days: data.days,
          interests: data.interests,
          budget: data.budget,
          localnessLevel: data.localnessLevel,
          pace: data.pace,
          groupType: data.groupType,
          templatePrompt: data.templatePrompt,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle specific error types
        if (result.error === "signup_required") {
          toast({
            title: "Sign up to continue",
            description: result.message,
          });
          router.push("/sign-up?redirect=/itineraries/new");
          return;
        }

        if (result.error === "limit_exceeded") {
          toast({
            title: "Limit reached",
            description: result.message,
          });
          if (result.upgrade) {
            router.push("/pricing");
          }
          return;
        }

        throw new Error(result.error || result.message || "Failed to generate itinerary");
      }

      // Handle anonymous user - show itinerary with signup prompt
      if (result.isAnonymous) {
        toast({
          title: "Itinerary created!",
          description: "Sign up to save it and create more",
        });
        // Store in localStorage for retrieval after signup
        localStorage.setItem("pendingItinerary", JSON.stringify(result.itinerary));
        router.push("/sign-up?redirect=/itineraries/claim");
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
      <div className="flex h-full min-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-2xl bg-background md:min-h-0 md:rounded-none">
        <WizardContent onGenerate={handleGenerate} />
      </div>
    </WizardProvider>
  );
}

export { WizardProvider, useWizard };
export type { WizardData };
