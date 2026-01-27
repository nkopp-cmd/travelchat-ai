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
    <div className="flex flex-col h-full px-4 py-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-600/20 mb-4">
          <Calendar className="w-7 h-7 text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Trip details</h2>
        <p className="text-gray-400">
          How long and what's your budget?
        </p>
      </div>

      {/* Days Slider */}
      <div className="mb-10">
        <div className="flex justify-between items-center mb-4">
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
                className={cn(
                  "w-full p-4 rounded-xl transition-all text-left",
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
