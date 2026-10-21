"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { Settings, Users, Zap, Compass } from "@/components/ui/icons";
import { Slider } from "@/components/ui/slider";

const PACE_OPTIONS = [
  { value: "relaxed" as const, label: "Relaxed", description: "2-3 spots/day" },
  { value: "moderate" as const, label: "Moderate", description: "3-4 spots/day" },
  { value: "active" as const, label: "Active", description: "4-5 spots/day" },
  { value: "packed" as const, label: "Packed", description: "5+ spots/day" },
];

const GROUP_OPTIONS = [
  { value: "solo", label: "Solo", emoji: "🚶" },
  { value: "couple", label: "Couple", emoji: "💑" },
  { value: "friends", label: "Friends", emoji: "👯" },
  { value: "family", label: "Family", emoji: "👨‍👩‍👧" },
];

const LOCALNESS_LABELS = [
  "Tourist highlights",
  "Popular spots",
  "Local favorites",
  "Hidden gems",
  "Deep local secrets",
];

export function StepPreferences() {
  const { data, setData, setCanProceed } = useWizard();

  useEffect(() => {
    // Always can proceed since we have defaults
    setCanProceed(true);
  }, [setCanProceed]);

  return (
    <div className="flex min-h-full flex-col px-4 py-4 sm:py-6">
      <div className="mb-4 text-center sm:mb-6">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 sm:mb-4 sm:h-14 sm:w-14">
          <Settings className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
        </div>
        <h2 className="mb-1.5 text-xl font-bold text-foreground sm:mb-2 sm:text-2xl">Almost there!</h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          Customize your experience
        </p>
      </div>

      {/* Localness Level */}
      <div className="mb-6 sm:mb-8">
        <div className="mb-3 flex items-center gap-2 sm:mb-4">
          <Compass className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">How local?</span>
        </div>
        <div className="rounded-xl bg-raised p-3.5 sm:p-4">
          <div className="mb-4 text-center">
            <span className="text-base font-semibold text-primary sm:text-lg">
              {LOCALNESS_LABELS[data.localnessLevel - 1]}
            </span>
          </div>
          <Slider
            value={[data.localnessLevel]}
            onValueChange={(value) => setData({ localnessLevel: value[0] })}
            min={1}
            max={5}
            step={1}
            aria-label="Localness level"
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Tourist</span>
            <span>Local</span>
          </div>
        </div>
      </div>

      {/* Pace */}
      <div className="mb-6 sm:mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Travel pace</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PACE_OPTIONS.map((option) => {
            const isSelected = data.pace === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setData({ pace: option.value })}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-xl p-2.5 text-center transition-all sm:p-3",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  isSelected
                    ? "bg-primary/15 "
                    : "bg-raised hover:bg-raised"
                )}
              >
                <div className={cn("font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
                  {option.label}
                </div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Group Type */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Traveling with</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {GROUP_OPTIONS.map((option) => {
            const isSelected = data.groupType === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setData({ groupType: option.value })}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-xl p-2 text-center transition-all sm:p-3",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  isSelected
                    ? "bg-primary/15 "
                    : "bg-raised hover:bg-raised"
                )}
              >
                <div className="mb-1 text-xl sm:text-2xl">{option.emoji}</div>
                <div className={cn("text-xs font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
                  {option.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
