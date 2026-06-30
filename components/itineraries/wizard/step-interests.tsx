"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { Heart, Check } from "lucide-react";

const INTERESTS = [
  { id: "Food & Dining", emoji: "🍜", label: "Food & Dining" },
  { id: "Cafes & Coffee", emoji: "☕", label: "Cafes & Coffee" },
  { id: "Nightlife & Bars", emoji: "🍸", label: "Nightlife & Bars" },
  { id: "Shopping", emoji: "🛍️", label: "Shopping" },
  { id: "Art & Culture", emoji: "🎨", label: "Art & Culture" },
  { id: "Nature & Parks", emoji: "🌿", label: "Nature & Parks" },
  { id: "History", emoji: "🏛️", label: "History" },
  { id: "Street Food", emoji: "🥟", label: "Street Food" },
  { id: "Vintage & Thrift", emoji: "🛋️", label: "Vintage & Thrift" },
  { id: "Music & Entertainment", emoji: "🎵", label: "Music & Entertainment" },
];

export function StepInterests() {
  const { data, setData, setCanProceed } = useWizard();

  useEffect(() => {
    setCanProceed(data.interests.length > 0);
  }, [data.interests, setCanProceed]);

  const toggleInterest = (interest: string) => {
    const newInterests = data.interests.includes(interest)
      ? data.interests.filter((i) => i !== interest)
      : [...data.interests, interest];
    setData({ interests: newInterests });
  };

  return (
    <div className="flex min-h-full flex-col px-4 py-4 sm:py-6">
      <div className="mb-4 text-center sm:mb-6">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-600/20 sm:mb-4 sm:h-14 sm:w-14">
          <Heart className="h-6 w-6 text-violet-400 sm:h-7 sm:w-7" />
        </div>
        <h2 className="mb-1.5 text-xl font-bold text-white sm:mb-2 sm:text-2xl">Your interests</h2>
        <p className="text-sm text-gray-400 sm:text-base">
          Pick at least one (the more, the better!)
        </p>
      </div>

      <div className="grid flex-1 grid-cols-2 content-start gap-2">
        {INTERESTS.map((interest) => {
          const isSelected = data.interests.includes(interest.id);
          return (
            <button
              key={interest.id}
              onClick={() => toggleInterest(interest.id)}
              aria-pressed={isSelected}
              className={cn(
                "relative flex min-h-[50px] items-center gap-2 rounded-xl p-2.5 text-left transition-all sm:min-h-[56px] sm:p-3",
                "focus:outline-none focus:ring-2 focus:ring-violet-500",
                isSelected
                  ? "bg-violet-600/20 border-2 border-violet-500"
                  : "bg-white/5 border-2 border-transparent hover:bg-white/10"
              )}
            >
              <span className="text-lg sm:text-xl">{interest.emoji}</span>
              <span
                className={cn(
                  "flex-1 text-xs font-medium sm:text-sm",
                  isSelected ? "text-white" : "text-gray-300"
                )}
              >
                {interest.label}
              </span>
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t border-white/10 pt-3 sm:mt-4 sm:pt-4">
        <p className="text-center text-sm text-gray-400">
          Selected:{" "}
          <span className="text-violet-400 font-medium">
            {data.interests.length} {data.interests.length === 1 ? "interest" : "interests"}
          </span>
        </p>
      </div>
    </div>
  );
}
