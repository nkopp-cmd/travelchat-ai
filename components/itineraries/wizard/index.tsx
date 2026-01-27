"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@clerk/nextjs";
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
  "Adding insider tips...",
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
    <div className="flex flex-col h-full">
      <WizardProgress />

      <div className="flex-1 overflow-y-auto">
        {steps[currentStep]}
      </div>

      <div className="p-4 border-t border-white/10 bg-black/50 backdrop-blur-xl safe-area-bottom">
        <div className="flex gap-3 max-w-md mx-auto">
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={prevStep}
              className="flex-1 h-12 border-white/20 text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={!canProceed}
            className={cn(
              "flex-1 h-12",
              currentStep === 0 && "w-full",
              "bg-gradient-to-r from-violet-600 to-indigo-600",
              "hover:from-violet-500 hover:to-indigo-500",
              "shadow-lg shadow-violet-500/30",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isLastStep ? (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Itinerary
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ItineraryWizardProps {
  initialData?: Partial<WizardData>;
}

export function ItineraryWizard({ initialData }: ItineraryWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { isSignedIn } = useUser();

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
    <WizardProvider initialData={initialData}>
      <div className="min-h-screen bg-background flex flex-col">
        <WizardContent onGenerate={handleGenerate} />
      </div>
    </WizardProvider>
  );
}

export { WizardProvider, useWizard };
export type { WizardData };
