"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { Settings, Users, Zap, Compass } from "lucide-react";
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
    <div className="flex flex-col h-full px-4 py-6 overflow-y-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-600/20 mb-4">
          <Settings className="w-7 h-7 text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Almost there!</h2>
        <p className="text-gray-400">
          Customize your experience
        </p>
      </div>

      {/* Localness Level */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Compass className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-white">How local?</span>
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-center mb-4">
            <span className="text-lg font-semibold text-violet-400">
              {LOCALNESS_LABELS[data.localnessLevel - 1]}
            </span>
          </div>
          <Slider
            value={[data.localnessLevel]}
            onValueChange={(value) => setData({ localnessLevel: value[0] })}
            min={1}
            max={5}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>Tourist</span>
            <span>Local</span>
          </div>
        </div>
      </div>

      {/* Pace */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-white">Travel pace</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PACE_OPTIONS.map((option) => {
            const isSelected = data.pace === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setData({ pace: option.value })}
                className={cn(
                  "p-3 rounded-xl transition-all text-center",
                  "focus:outline-none focus:ring-2 focus:ring-violet-500",
                  isSelected
                    ? "bg-violet-600/20 border-2 border-violet-500"
                    : "bg-white/5 border-2 border-transparent hover:bg-white/10"
                )}
              >
                <div className={cn("font-medium", isSelected ? "text-white" : "text-gray-300")}>
                  {option.label}
                </div>
                <div className="text-xs text-gray-500">{option.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Group Type */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-white">Traveling with</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {GROUP_OPTIONS.map((option) => {
            const isSelected = data.groupType === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setData({ groupType: option.value })}
                className={cn(
                  "p-3 rounded-xl transition-all text-center",
                  "focus:outline-none focus:ring-2 focus:ring-violet-500",
                  isSelected
                    ? "bg-violet-600/20 border-2 border-violet-500"
                    : "bg-white/5 border-2 border-transparent hover:bg-white/10"
                )}
              >
                <div className="text-2xl mb-1">{option.emoji}</div>
                <div className={cn("text-xs font-medium", isSelected ? "text-white" : "text-gray-400")}>
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
