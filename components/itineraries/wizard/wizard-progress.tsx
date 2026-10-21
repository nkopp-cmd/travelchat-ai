"use client";

import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { Check } from "@/components/ui/icons";

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
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-all",
              index === currentStep && "w-8 bg-primary",
              index < currentStep && "bg-primary/60",
              index > currentStep && "bg-raised"
            )}
            aria-label={`Step ${index + 1}: ${steps[index].label}`}
          />
        ))}
      </div>

      {/* Desktop: Full progress bar */}
      <div className="hidden md:flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => index < currentStep && goToStep(index)}
              disabled={index > currentStep}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full transition-all",
                "text-sm font-semibold",
                index === currentStep && "bg-primary text-primary-foreground ",
                index < currentStep && "bg-primary text-primary-foreground cursor-pointer",
                index > currentStep && "bg-raised text-muted-foreground cursor-not-allowed"
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
                "ml-3 text-sm font-medium",
                index === currentStep && "text-foreground",
                index < currentStep && "text-primary",
                index > currentStep && "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-4",
                  index < currentStep ? "bg-primary" : "bg-raised"
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
