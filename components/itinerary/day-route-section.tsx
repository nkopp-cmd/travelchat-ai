import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItineraryActivityCard } from "@/components/activities/itinerary-activity-card";
import {
  buildDayRouteUrl,
  getDayRouteAddressSummary,
  type DayRouteAddressSummary,
} from "@/lib/itineraries/map-links";
import { isKoreanCity } from "@/hooks/use-map-provider";
import type { SubscriptionTier } from "@/lib/subscription";
import { Clock, MapPinned, Navigation, Route } from "@/components/ui/icons";

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

function getStopPreview(activities: DayRouteActivity[]): DayRouteActivity[] {
  return activities.filter((activity) => getStopName(activity)).slice(0, 4);
}

function getRouteConfidenceCopy(
  summary: DayRouteAddressSummary,
  isKakaoRoute: boolean,
): {
  label: string;
  helper: string;
  className: string;
} {
  if (summary.mode === "exact") {
    return {
      label: "Exact route",
      helper: isKakaoRoute
        ? "Stops have exact addresses. Kakao opens search from the first stop."
        : "All route stops include exact addresses.",
      className: " bg-[rgb(var(--ll-success)/0.12)] text-foreground",
    };
  }

  if (summary.mode === "mixed") {
    return {
      label: "Review route",
      helper: `${summary.searchFirstStopCount} of ${summary.mappableStopCount} stops need map confirmation.`,
      className: " bg-[rgb(var(--ll-warning)/0.14)] text-foreground",
    };
  }

  if (summary.mode === "search_first") {
    return {
      label: "Search-first route",
      helper: "Stops rely on names or area-level addresses. Confirm pins before routing.",
      className: " bg-primary/10 text-foreground",
    };
  }

  return {
    label: "No route yet",
    helper: "Add named stops or addresses to build a map route.",
    className: " bg-raised text-muted-foreground",
  };
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
  const isKakaoRoute = isKoreanCity(city);
  const routeAddressSummary = getDayRouteAddressSummary(activities);
  const routeConfidence = getRouteConfidenceCopy(routeAddressSummary, isKakaoRoute);
  const stopPreview = getStopPreview(activities);
  const hiddenStopCount = Math.max(activities.length - stopPreview.length, 0);

  return (
    <section className="overflow-hidden rounded-xl bg-surface backdrop-blur-xl">
      <div className="bg-raised px-3.5 py-3 text-foreground sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold uppercase text-foreground">
                Day {dayPlan.day || dayIndex + 1}
              </span>
              <Badge
                variant="secondary"
                className="w-fit bg-overlay text-foreground hover:bg-overlay/80"
              >
                {activities.length} {activities.length === 1 ? "stop" : "stops"}
              </Badge>
            </div>
            {dayPlan.theme && (
              <h2 className="text-lg font-bold leading-tight sm:text-2xl">
                {dayPlan.theme}
              </h2>
            )}
            <div className="grid gap-1.5 text-sm text-foreground sm:grid-cols-2 md:grid-cols-1">
              <p className="flex min-w-0 items-start gap-2">
                <Route className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                <span className="min-w-0 break-words">
                  {getDayRouteSummary(activities)}
                </span>
              </p>
              {timingSummary && (
                <p className="flex min-w-0 items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-foreground" />
                  <span className="min-w-0 break-words">{timingSummary}</span>
                </p>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-black/18 px-3 py-2 text-xs text-foreground sm:flex-row sm:items-center">
              <span
                className={[
                  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold",
                  routeConfidence.className,
                ].join(" ")}
              >
                <MapPinned className="h-3.5 w-3.5" />
                {routeConfidence.label}
              </span>
              <span className="min-w-0 leading-relaxed">{routeConfidence.helper}</span>
            </div>
            {routeAddressSummary.mappableStopCount > 0 && (
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-foreground">
                <span className="rounded-full bg-[rgb(var(--ll-success)/0.12)] px-2 py-1 text-foreground">
                  {routeAddressSummary.exactStopCount} exact pin{routeAddressSummary.exactStopCount === 1 ? "" : "s"}
                </span>
                {routeAddressSummary.searchFirstStopCount > 0 && (
                  <span className="rounded-full bg-[rgb(var(--ll-warning)/0.14)] px-2 py-1 text-foreground">
                    {routeAddressSummary.searchFirstStopCount} to confirm
                  </span>
                )}
              </div>
            )}
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
                className="h-9 w-full rounded-xl border-0 bg-primary/15 text-foreground hover:bg-primary/20 min-[420px]:w-auto"
              >
                <Navigation className="h-4 w-4" />
                {isKakaoRoute ? "Kakao search" : "View route"}
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="px-3 py-3 sm:px-4 sm:py-4">
        {activities.length > 0 ? (
          <div className="space-y-3">
            {stopPreview.length > 1 && (
              <div className="rounded-xl bg-raised p-2.5" aria-label="Route order preview">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
                  Route order
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {stopPreview.map((activity, index) => (
                    <span
                      key={`${activity.name}-${index}`}
                      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-foreground"
                    >
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-foreground">
                        {index + 1}
                      </span>
                      <span className="truncate">{getStopName(activity)}</span>
                    </span>
                  ))}
                  {hiddenStopCount > 0 && (
                    <span className="rounded-full bg-raised px-2 py-1 text-xs font-medium text-foreground">
                      +{hiddenStopCount} more
                    </span>
                  )}
                </div>
              </div>
            )}
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
        ) : (
          <div className="rounded-xl bg-raised p-4 text-sm text-foreground">
            No stops are scheduled for this day yet.
          </div>
        )}
      </div>
    </section>
  );
}
