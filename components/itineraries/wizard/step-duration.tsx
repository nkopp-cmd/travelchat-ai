"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { Calendar, DollarSign } from "lucide-react";
import { Slider } from "@/components/ui/slider";

const BUDGET_OPTIONS = [
  {
    value: "cheap" as const,
    label: "Budget",
    description: "Local eateries & free attractions",
    icon: "$",
  },
  {
    value: "moderate" as const,
    label: "Mid-range",
    description: "Mix of experiences & comfort",
    icon: "$$",
  },
  {
    value: "splurge" as const,
    label: "Premium",
    description: "Fine dining & VIP experiences",
    icon: "$$$",
  },
];

export function StepDuration() {
  const { data, setData, setCanProceed } = useWizard();

  useEffect(() => {
    // Always can proceed since we have defaults
    setCanProceed(true);
  }, [setCanProceed]);

  return (
    <div className="flex min-h-full flex-col px-4 py-4 sm:py-6">
      <div className="mb-6 text-center sm:mb-8">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-600/20 sm:mb-4 sm:h-14 sm:w-14">
          <Calendar className="h-6 w-6 text-violet-400 sm:h-7 sm:w-7" />
        </div>
        <h2 className="mb-1.5 text-xl font-bold text-white sm:mb-2 sm:text-2xl">Trip details</h2>
        <p className="text-sm text-gray-400 sm:text-base">
          How long and what&apos;s your budget?
        </p>
      </div>

      {/* Days Slider */}
      <div className="mb-7 sm:mb-10">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-400">Duration</span>
          <span className="text-lg font-bold text-white">
            {data.days} {data.days === 1 ? "day" : "days"}
          </span>
        </div>
        <Slider
          value={[data.days]}
          onValueChange={(value) => setData({ days: value[0] })}
          min={1}
          max={7}
          step={1}
          aria-label="Trip duration in days"
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>1 day</span>
          <span>7 days</span>
        </div>
      </div>

      {/* Budget Options */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-400">Budget</span>
        </div>
        <div className="space-y-3">
          {BUDGET_OPTIONS.map((option) => {
            const isSelected = data.budget === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setData({ budget: option.value })}
                aria-pressed={isSelected}
                className={cn(
              "w-full rounded-xl p-3.5 text-left transition-all sm:p-4",
                  "border-2",
                  "focus:outline-none focus:ring-2 focus:ring-violet-500",
                  isSelected
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-white">
                        {option.label}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          isSelected ? "text-violet-400" : "text-gray-500"
                        )}
                      >
                        {option.icon}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                      {option.description}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                      isSelected
                        ? "border-violet-500 bg-violet-500"
                        : "border-white/20"
                    )}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
