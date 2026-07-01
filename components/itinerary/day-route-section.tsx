import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItineraryActivityCard } from "@/components/activities/itinerary-activity-card";
import { buildDayRouteUrl } from "@/lib/itineraries/map-links";
import { isKoreanCity } from "@/hooks/use-map-provider";
import type { SubscriptionTier } from "@/lib/subscription";
import { Clock, Navigation, Route } from "lucide-react";

export interface DayRouteActivity {
  name: string;
  nameKo?: string;
  description?: string;
  time?: string;
  duration?: string;
  cost?: string;
  address?: string;
  type?: string;
  category?: string;
  localleyScore?: number;
  image?: string;
  thumbnail?: string;
}

export interface DayRoutePlan {
  day: number;
  theme?: string;
  activities: DayRouteActivity[];
  highlights?: string[];
}

interface DayRouteSectionProps {
  dayPlan: DayRoutePlan;
  dayIndex: number;
  city: string;
  userTier: SubscriptionTier;
}

function getStopName(activity: DayRouteActivity | undefined): string {
  return activity?.name?.trim() || "Planned stop";
}

function getDayRouteSummary(activities: DayRouteActivity[]): string {
  if (activities.length === 0) return "Add stops to build a route.";
  if (activities.length === 1) return getStopName(activities[0]);

  return `${getStopName(activities[0])} to ${getStopName(activities[activities.length - 1])}`;
}

function getDayTimingSummary(activities: DayRouteActivity[]): string | null {
  const timedStops = activities
    .map((activity) => activity.time?.trim())
    .filter((time): time is string => Boolean(time));

  if (timedStops.length === 0) return null;
  if (timedStops.length === 1) return `Starts ${timedStops[0]}`;

  return `${timedStops[0]} to ${timedStops[timedStops.length - 1]}`;
}

export function DayRouteSection({
  dayPlan,
  dayIndex,
  city,
  userTier,
}: DayRouteSectionProps) {
  const activities = dayPlan.activities || [];
  const timingSummary = getDayTimingSummary(activities);
  const routeUrl = buildDayRouteUrl(activities, city);

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0f091b]/82 shadow-xl shadow-violet-950/12 backdrop-blur-xl">
      <div className="border-b border-white/10 bg-white/[0.045] px-3.5 py-3 text-white sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-violet-200/25 bg-violet-300/18 px-2.5 py-1 text-xs font-bold uppercase text-violet-50">
                Day {dayPlan.day || dayIndex + 1}
              </span>
              <Badge
                variant="secondary"
                className="w-fit border border-white/10 bg-white/10 text-white hover:bg-white/14"
              >
                {activities.length} {activities.length === 1 ? "stop" : "stops"}
              </Badge>
            </div>
            {dayPlan.theme && (
              <h2 className="text-lg font-bold leading-tight sm:text-2xl">
                {dayPlan.theme}
              </h2>
            )}
            <div className="grid gap-1.5 text-sm text-violet-50/70 sm:grid-cols-2 md:grid-cols-1">
              <p className="flex min-w-0 items-start gap-2">
                <Route className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
                <span className="min-w-0 break-words">
                  {getDayRouteSummary(activities)}
                </span>
              </p>
              {timingSummary && (
                <p className="flex min-w-0 items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-indigo-200" />
                  <span className="min-w-0 break-words">{timingSummary}</span>
                </p>
              )}
            </div>
          </div>
          {routeUrl && (
            <a
              href={routeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-[420px]:w-auto"
            >
              <Button
                variant="secondary"
                size="sm"
                className="h-9 w-full rounded-xl border-0 bg-violet-500/18 text-white hover:bg-violet-500/28 min-[420px]:w-auto"
              >
                <Navigation className="h-4 w-4" />
                {isKoreanCity(city) ? "Kakao route" : "View route"}
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="px-3 py-3 sm:px-4 sm:py-4">
        <div className="space-y-1.5 sm:space-y-2">
          {activities.map((activity, activityIndex) => (
            <ItineraryActivityCard
              key={`${activity.name}-${activityIndex}`}
              activity={activity}
              city={city}
              userTier={userTier}
              isLast={activityIndex === activities.length - 1}
              position={activityIndex + 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
