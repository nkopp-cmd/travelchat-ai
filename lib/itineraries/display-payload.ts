import {
  normalizeDailyPlansForDisplay,
  parseDailyPlans,
  type ItineraryDayPlanLike,
  type ItineraryInsight,
} from "@/lib/itineraries/normalize-daily-plans";

export function buildItineraryDisplayPayload<
  T extends ItineraryDayPlanLike = ItineraryDayPlanLike,
>(
  activities: unknown,
): { dailyPlans: T[]; insights: ItineraryInsight[] } {
  return normalizeDailyPlansForDisplay<T>(parseDailyPlans(activities));
}
