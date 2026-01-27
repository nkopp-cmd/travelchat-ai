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
    <div className="flex flex-col h-full px-4 py-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-600/20 mb-4">
          <Heart className="w-7 h-7 text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Your interests</h2>
        <p className="text-gray-400">
          Pick at least one (the more, the better!)
        </p>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-2.5 content-start">
        {INTERESTS.map((interest) => {
          const isSelected = data.interests.includes(interest.id);
          return (
            <button
              key={interest.id}
              onClick={() => toggleInterest(interest.id)}
              className={cn(
                "relative flex items-center gap-2 p-3 rounded-xl transition-all",
                "text-left min-h-[56px]",
                "focus:outline-none focus:ring-2 focus:ring-violet-500",
                isSelected
                  ? "bg-violet-600/20 border-2 border-violet-500"
                  : "bg-white/5 border-2 border-transparent hover:bg-white/10"
              )}
            >
              <span className="text-xl">{interest.emoji}</span>
              <span
                className={cn(
                  "text-sm font-medium flex-1",
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

      <div className="pt-4 border-t border-white/10 mt-4">
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
