"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Clock, MapPin, Lightbulb, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Activity {
  name: string;
  description?: string;
  time?: string;
  duration?: string;
  cost?: string;
  address?: string;
  type?: string;
  category?: string;
  localleyScore?: number;
  image?: string;
}

interface DaySectionProps {
  day: number;
  theme?: string;
  activities: Activity[];
  localTip?: string;
  transportTips?: string;
  routeUrl?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export function DaySection({
  day,
  theme,
  activities,
  localTip,
  transportTips,
  routeUrl,
  defaultExpanded = true,
  className,
}: DaySectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div
      id={`day-${day}`}
      className={cn("border-b border-white/10 last:border-0", className)}
    >
      {/* Day header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-600/20 flex items-center justify-center">
            <span className="text-violet-400 font-bold">{day}</span>
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-white">Day {day}</h3>
            {theme && (
              <p className="text-sm text-gray-400 line-clamp-1">{theme}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-white/10 text-gray-300">
            {activities.length} spots
          </Badge>
          <ChevronDown
            className={cn(
              "w-5 h-5 text-gray-400 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="pb-4 px-4">
          {/* Timeline of activities */}
          <div className="relative pl-6 border-l-2 border-violet-600/30 space-y-4 ml-2">
            {activities.map((activity, index) => (
              <div key={index} className="relative">
                {/* Timeline dot */}
                <div className="absolute -left-[25px] w-4 h-4 rounded-full bg-violet-600/50 border-2 border-background" />

                {/* Activity card */}
                <div className="bg-white/5 rounded-xl p-3">
                  {/* Time */}
                  {activity.time && (
                    <div className="flex items-center gap-1 text-xs text-violet-400 mb-1">
                      <Clock className="w-3 h-3" />
                      {activity.time}
                      {activity.duration && (
                        <span className="text-gray-500">
                          {" "}
                          ({activity.duration})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Name and category */}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-white">{activity.name}</h4>
                    {activity.category && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-transparent border-white/20 text-gray-400 shrink-0"
                      >
                        {activity.category}
                      </Badge>
                    )}
                  </div>

                  {/* Description - truncated on mobile */}
                  {activity.description && (
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                      {activity.description}
                    </p>
                  )}

                  {/* Address and cost */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                    {activity.address && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        <span className="line-clamp-1">{activity.address}</span>
                      </div>
                    )}
                    {activity.cost && (
                      <span className="text-green-400">{activity.cost}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Local tip */}
          {localTip && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200">{localTip}</p>
              </div>
            </div>
          )}

          {/* Transport tips */}
          {transportTips && (
            <div className="mt-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <p className="text-sm text-blue-200">{transportTips}</p>
            </div>
          )}

          {/* Route button */}
          {routeUrl && (
            <a href={routeUrl} target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
              >
                <Navigation className="w-4 h-4 mr-2" />
                Open Day {day} Route
              </Button>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
