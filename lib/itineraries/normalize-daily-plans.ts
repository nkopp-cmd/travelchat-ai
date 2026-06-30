export interface ItineraryActivityLike {
  name?: unknown;
  description?: unknown;
  category?: unknown;
  type?: unknown;
}

export interface ItineraryDayPlanLike {
  day?: number;
  activities?: ItineraryActivityLike[];
  localTip?: string;
  transportTips?: string;
}

export interface ItineraryInsight {
  id: string;
  label: string;
  text: string;
  kind: "local" | "transport" | "insight";
}

const TIP_NAME_PATTERNS = [
  /\b(local|insider|travel|pro|quick)\s+tips?\b/i,
  /\btips?\s+(for|about|before|while)\b/i,
  /\bthings?\s+to\s+know\b/i,
  /\bwhat\s+to\s+(order|know|bring|avoid)\b/i,
  /\bhow\s+to\s+(get|go|use|book)\b/i,
  /\bbefore\s+you\s+go\b/i,
  /\bgetting\s+around\b/i,
  /\btransport(ation)?\s+tips?\b/i,
  /\bheads?\s+up\b/i,
  /\b(note|advice|insight|reminder)\s*(for|about|before|while)?\b/i,
];

const TIP_VALUE_PATTERN = /^(tip|tips|local tip|insider tip|travel tip|pro tip|note|notes|advice|insight|insights|reminder|reminders|getting around|transport|transportation)$/i;
const TRANSPORT_PATTERN = /\b(transport|transit|subway|metro|bus|train|taxi|walk|walking|ride|route|getting around|kakao|maps?)\b/i;

export function isTipLikeActivity(activity: ItineraryActivityLike): boolean {
  const name = getStringValue(activity.name);
  const category = getStringValue(activity.category);
  const type = getStringValue(activity.type);

  if (!name) return true;
  if (TIP_VALUE_PATTERN.test(name) || TIP_VALUE_PATTERN.test(category) || TIP_VALUE_PATTERN.test(type)) {
    return true;
  }

  return TIP_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function getTipText(activity: ItineraryActivityLike): string {
  const name = getStringValue(activity.name);
  const description = getStringValue(activity.description);

  if (description && name && !TIP_VALUE_PATTERN.test(name)) {
    return `${name}: ${description}`;
  }

  return description || name || "";
}

function appendTip(existing: unknown, tips: string[]): string | undefined {
  const parts = [
    typeof existing === "string" ? existing.trim() : "",
    ...tips.map((tip) => tip.trim()),
  ].filter(Boolean);

  return parts.length ? parts.join(" ") : undefined;
}

function getStringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const localized = Object.values(value).find((entry) => typeof entry === "string" && entry.trim());
    return typeof localized === "string" ? localized.trim() : "";
  }
  return "";
}

function isTransportTip(activity: ItineraryActivityLike): boolean {
  return TRANSPORT_PATTERN.test(
    `${getStringValue(activity.name)} ${getStringValue(activity.description)} ${getStringValue(activity.category)} ${getStringValue(activity.type)}`
  );
}

export function sanitizeGeneratedDailyPlans<T extends ItineraryDayPlanLike>(dailyPlans: T[]): T[] {
  return dailyPlans.map((dayPlan) => {
    const localTips: string[] = [];
    const transportTips: string[] = [];
    const activities = (dayPlan.activities || []).filter((activity) => {
      if (!isTipLikeActivity(activity)) return true;

      const tipText = getTipText(activity);
      if (!tipText) return false;

      if (isTransportTip(activity)) {
        transportTips.push(tipText);
      } else {
        localTips.push(tipText);
      }

      return false;
    });

    return {
      ...dayPlan,
      activities,
      localTip: appendTip(dayPlan.localTip, localTips),
      transportTips: appendTip(dayPlan.transportTips, transportTips),
    };
  });
}

export function normalizeDailyPlansForDisplay<T extends ItineraryDayPlanLike>(
  rawDailyPlans: unknown
): { dailyPlans: T[]; insights: ItineraryInsight[] } {
  if (!Array.isArray(rawDailyPlans)) {
    return { dailyPlans: [], insights: [] };
  }

  const sanitizedPlans = sanitizeGeneratedDailyPlans(rawDailyPlans as T[]);
  const insights: ItineraryInsight[] = [];

  const dailyPlans = sanitizedPlans.map((dayPlan, dayIndex) => {
    const dayNumber = dayPlan.day || dayIndex + 1;

    if (dayPlan.localTip) {
      insights.push({
        id: `day-${dayNumber}-local-tip`,
        label: `Day ${dayNumber} local tip`,
        text: dayPlan.localTip,
        kind: "local",
      });
    }

    if (dayPlan.transportTips) {
      insights.push({
        id: `day-${dayNumber}-transport-tip`,
        label: `Day ${dayNumber} getting around`,
        text: dayPlan.transportTips,
        kind: "transport",
      });
    }

    return {
      ...dayPlan,
      localTip: undefined,
      transportTips: undefined,
    };
  });

  return { dailyPlans, insights };
}

export function parseDailyPlans(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}
