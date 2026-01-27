"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { MapPin, Check } from "lucide-react";

const SUPPORTED_CITIES = [
  { name: "Seoul", emoji: "🇰🇷", vibe: "K-culture & nightlife", image: "https://images.unsplash.com/photo-1583833008338-31a6657917ab?w=400" },
  { name: "Tokyo", emoji: "🇯🇵", vibe: "Tradition meets tech", image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400" },
  { name: "Bangkok", emoji: "🇹🇭", vibe: "Street food paradise", image: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400" },
  { name: "Singapore", emoji: "🇸🇬", vibe: "Modern melting pot", image: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=400" },
];

export function StepDestination() {
  const { data, setData, setCanProceed } = useWizard();

  useEffect(() => {
    setCanProceed(!!data.city);
  }, [data.city, setCanProceed]);

  return (
    <div className="flex flex-col h-full px-4 py-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-600/20 mb-4">
          <MapPin className="w-7 h-7 text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Where to?</h2>
        <p className="text-gray-400">
          Pick a city to explore like a local
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1">
        {SUPPORTED_CITIES.map((city) => {
          const isSelected = data.city === city.name;
          return (
            <button
              key={city.name}
              onClick={() => setData({ city: city.name })}
              className={cn(
                "relative rounded-2xl overflow-hidden aspect-[4/5] transition-all",
                "group focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-black",
                isSelected && "ring-2 ring-violet-500"
              )}
            >
              {/* Background image */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform group-hover:scale-110"
                style={{ backgroundImage: `url(${city.image})` }}
              />

              {/* Gradient overlay */}
              <div
                className={cn(
                  "absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent",
                  isSelected && "from-violet-900/90 via-violet-900/40"
                )}
              />

              {/* Selected checkmark */}
              {isSelected && (
                <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
              )}

              {/* City info */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{city.emoji}</span>
                  <span className="text-xl font-bold text-white">{city.name}</span>
                </div>
                <p className="text-sm text-gray-300">{city.vibe}</p>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-500 mt-4">
        More cities coming soon!
      </p>
    </div>
  );
}
