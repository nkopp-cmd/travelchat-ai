"use client";

import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { Check } from "lucide-react";

const steps = [
  { label: "Destination" },
  { label: "Duration" },
  { label: "Interests" },
  { label: "Preferences" },
];

export function WizardProgress() {
  const { currentStep, goToStep } = useWizard();

  return (
    <div className="w-full px-4 py-3 sm:py-4">
      {/* Mobile: Simple dots */}
      <div className="flex md:hidden items-center justify-center gap-2">
        {steps.map((_, index) => (
          <button
            key={index}
            onClick={() => index < currentStep && goToStep(index)}
            disabled={index > currentStep}
            className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
            aria-label={`Step ${index + 1}: ${steps[index].label}`}
            aria-current={index === currentStep ? "step" : undefined}
          >
            <span aria-hidden="true" className={cn(
              "h-2.5 w-2.5 rounded-full transition-all",
              index === currentStep && "w-8 bg-violet-500",
              index < currentStep && "bg-violet-500/60",
              index > currentStep && "bg-white/20"
            )} />
          </button>
        ))}
      </div>

      {/* Desktop: Full progress bar */}
      <div className="hidden md:flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={index} className="flex min-w-0 items-center flex-1 last:flex-none">
            <button
              onClick={() => index < currentStep && goToStep(index)}
              disabled={index > currentStep}
              aria-label={`Step ${index + 1}: ${step.label}`}
              aria-current={index === currentStep ? "step" : undefined}
              className={cn(
                "flex shrink-0 items-center justify-center w-11 h-11 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400",
                "text-sm font-semibold",
                index === currentStep && "bg-violet-600 text-white ring-4 ring-violet-600/20",
                index < currentStep && "bg-violet-600 text-white cursor-pointer",
                index > currentStep && "bg-white/10 text-white/40 cursor-not-allowed"
              )}
            >
              {index < currentStep ? (
                <Check className="w-5 h-5" />
              ) : (
                index + 1
              )}
            </button>
            <span
              className={cn(
                "hidden xl:inline ml-3 text-sm font-medium",
                index === currentStep && "text-white",
                index < currentStep && "text-violet-400",
                index > currentStep && "text-white/40"
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-4",
                  index < currentStep ? "bg-violet-600" : "bg-white/10"
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
