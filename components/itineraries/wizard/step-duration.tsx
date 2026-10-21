"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { Calendar, DollarSign } from "@/components/ui/icons";
import { Slider } from "@/components/ui/slider";
import { RoutePreview } from "./route-preview";
import { MAX_CORRIDOR_DAYS, MIN_CORRIDOR_DAYS } from "@/lib/trips/wizard-corridor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTripDate, tripEndDate } from "@/lib/trips/date-range";

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
  const multiMode = data.tripMode === "multi";
  const minDays = multiMode ? MIN_CORRIDOR_DAYS : 1;
  const maxDays = multiMode ? MAX_CORRIDOR_DAYS : 7;
  const endDate = data.startDate ? tripEndDate(data.startDate, data.days) : null;

  useEffect(() => {
    // Always can proceed since we have defaults
    setCanProceed(true);
  }, [setCanProceed]);

  useEffect(() => {
    if (multiMode && data.days < MIN_CORRIDOR_DAYS) {
      setData({ days: MIN_CORRIDOR_DAYS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiMode]);

  return (
    <div className="flex min-h-full flex-col px-4 py-4 sm:py-6">
      <div className="mb-6 text-center sm:mb-8">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 sm:mb-4 sm:h-14 sm:w-14">
          <Calendar className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
        </div>
        <h2 className="mb-1.5 text-xl font-bold text-foreground sm:mb-2 sm:text-2xl">Trip details</h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          When are you going, and what&apos;s your budget?
        </p>
      </div>

      <div className="mb-6 space-y-2">
        <Label htmlFor="trip-start-date">Start date (optional)</Label>
        <Input id="trip-start-date" type="date" value={data.startDate ?? ""}
          aria-describedby="trip-date-summary" max="9999-12-31"
          onChange={event => setData({ startDate: event.target.value || undefined })} />
        <p id="trip-date-summary" role="status" className="text-sm leading-6 text-muted-foreground">
          {data.startDate && endDate
            ? `${formatTripDate(data.startDate)} to ${formatTripDate(endDate)} · ${data.days} ${data.days === 1 ? "day" : "days"}`
            : "Dates flexible? Leave this empty and choose your trip length below."}
        </p>
      </div>

      {/* Days Slider */}
      <div className="mb-7 sm:mb-10">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Duration</span>
          <span className="text-lg font-bold text-foreground">
            {data.days} {data.days === 1 ? "day" : "days"}
          </span>
        </div>
        <Slider
          value={[data.days]}
          onValueChange={(value) => setData({ days: value[0] })}
          min={minDays}
          max={maxDays}
          step={1}
          aria-label="Trip duration in days"
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{minDays} {minDays === 1 ? "day" : "days"}</span>
          <span>{maxDays} days</span>
        </div>
        {multiMode && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Multi-city trips work best with at least 3 days per city.
          </p>
        )}
      </div>

      {multiMode && (
        <div className="mb-7 sm:mb-10">
          <RoutePreview />
        </div>
      )}

      {/* Budget Options */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Budget</span>
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
                  "",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  isSelected
                    ? " bg-primary/10"
                    : " bg-raised "
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-foreground">
                        {option.label}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        {option.icon}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {option.description}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center",
                      isSelected
                        ? " bg-primary"
                        : ""
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
