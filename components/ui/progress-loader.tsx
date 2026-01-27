"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ProgressLoaderProps {
  messages?: string[];
  messageInterval?: number;
  showSpinner?: boolean;
  className?: string;
}

const DEFAULT_MESSAGES = [
  "Finding hidden gems...",
  "Discovering local favorites...",
  "Mapping the best routes...",
  "Adding insider tips...",
  "Curating your perfect trip...",
  "Almost there...",
];

export function ProgressLoader({
  messages = DEFAULT_MESSAGES,
  messageInterval = 3000,
  showSpinner = true,
  className,
}: ProgressLoaderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, messageInterval);

    return () => clearInterval(interval);
  }, [messages, messageInterval]);

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      {/* Animated spinner with glow */}
      {showSpinner && (
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-full bg-violet-600/20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
          <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
        </div>
      )}

      {/* Progress message with fade animation */}
      <div className="h-8 flex items-center justify-center">
        <p
          key={currentIndex}
          className={cn(
            "text-violet-400 text-center",
            "animate-in fade-in-0 slide-in-from-bottom-2",
            "duration-500"
          )}
        >
          {messages[currentIndex]}
        </p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5 mt-4">
        {messages.map((_, index) => (
          <div
            key={index}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all duration-300",
              index === currentIndex
                ? "bg-violet-500 w-4"
                : "bg-white/20"
            )}
          />
        ))}
      </div>
    </div>
  );
}

interface FullScreenLoaderProps extends ProgressLoaderProps {
  title?: string;
  subtitle?: string;
}

export function FullScreenLoader({
  title = "Creating your itinerary",
  subtitle = "This usually takes 20-30 seconds",
  ...props
}: FullScreenLoaderProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <h2 className="text-xl font-bold text-white mb-2 text-center">
        {title}
      </h2>
      <ProgressLoader {...props} />
      <p className="text-gray-500 text-sm mt-6">{subtitle}</p>
    </div>
  );
}
