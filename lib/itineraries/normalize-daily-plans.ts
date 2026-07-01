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

export interface ItineraryInsightLike {
  id?: unknown;
  label?: unknown;
  text?: unknown;
  kind?: unknown;
}

export interface ItineraryInsight {
  id: string;
  label: string;
  text: string;
  kind: "local" | "transport" | "insight";
}

export interface ItineraryPlanPayload<T extends ItineraryDayPlanLike = ItineraryDayPlanLike> {
  dailyPlans: T[];
  insights?: ItineraryInsightLike[];
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
const GENERIC_ACTIVITY_NAME_PATTERN = /^(breakfast|brunch|lunch|dinner|supper|meal|snack|coffee|coffee break|food stop|drink stop|morning|afternoon|evening|night)(\s+(break|stop|slot|activity|plan))?$/i;
const LABELED_TIP_LINE_PATTERN = /^(?:[-*]\s*)?(tip|tips|local tip|insider tip|travel tip|pro tip|quick tip|note|advice|insight|reminder|heads up|before you go|getting around|transport|transportation|transit)\s*:\s*(.+)$/i;

export function isTipLikeActivity(activity: ItineraryActivityLike): boolean {
  const name = getStringValue(activity.name);
  const category = getStringValue(activity.category);
  const type = getStringValue(activity.type);

  if (!name) return true;
  if (
    TIP_VALUE_PATTERN.test(name) ||
    TIP_VALUE_PATTERN.test(category) ||
    TIP_VALUE_PATTERN.test(type) ||
    GENERIC_ACTIVITY_NAME_PATTERN.test(name)
  ) {
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

function splitDescriptionTips(activity: ItineraryActivityLike): {
  activity: ItineraryActivityLike;
  localTips: string[];
  transportTips: string[];
} {
  const description = getStringValue(activity.description);
  if (!description) return { activity, localTips: [], transportTips: [] };

  const localTips: string[] = [];
  const transportTips: string[] = [];
  const keptLines: string[] = [];

  description.split(/\n+/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const labeledTip = line.match(LABELED_TIP_LINE_PATTERN);
    if (!labeledTip) {
      keptLines.push(rawLine);
      return;
    }

    const tipText = `${labeledTip[1]}: ${labeledTip[2].trim()}`;
    if (TRANSPORT_PATTERN.test(`${labeledTip[1]} ${labeledTip[2]}`)) {
      transportTips.push(tipText);
    } else {
      localTips.push(tipText);
    }
  });

  if (localTips.length === 0 && transportTips.length === 0) {
    return { activity, localTips, transportTips };
  }

  return {
    activity: {
      ...activity,
      description: keptLines.join("\n").trim(),
    },
    localTips,
    transportTips,
  };
}

function appendTip(existing: unknown, tips: string[]): string | undefined {
  const parts = [
    typeof existing === "string" ? existing.trim() : "",
    ...tips.map((tip) => tip.trim()),
  ].filter(Boolean);

  return parts.length ? parts.join(" ") : undefined;
}

function normalizeInsightKind(value: unknown): ItineraryInsight["kind"] {
  if (value === "local" || value === "transport" || value === "insight") return value;
  return "insight";
}

function getStringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const localized = Object.values(value).find((entry) => typeof entry === "string" && entry.trim());
    return typeof localized === "string" ? localized.trim() : "";
  }
  return "";
}

export function normalizeItineraryInsights(rawInsights: unknown): ItineraryInsight[] {
  if (!Array.isArray(rawInsights)) return [];

  return rawInsights
    .map((rawInsight, index) => {
      if (typeof rawInsight === "string") {
        const text = rawInsight.trim();
        if (!text) return null;

        return {
          id: `trip-insight-${index + 1}`,
          label: "Trip insight",
          text,
          kind: "insight" as const,
        };
      }

      if (!rawInsight || typeof rawInsight !== "object") return null;

      const insight = rawInsight as ItineraryInsightLike;
      const text = getStringValue(insight.text);
      if (!text) return null;

      const kind = normalizeInsightKind(insight.kind);
      const fallbackLabel = kind === "transport" ? "Getting around" : kind === "local" ? "Local tip" : "Trip insight";

      return {
        id: getStringValue(insight.id) || `trip-insight-${index + 1}`,
        label: getStringValue(insight.label) || fallbackLabel,
        text,
        kind,
      };
    })
    .filter((insight): insight is ItineraryInsight => Boolean(insight));
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
    const activities = (dayPlan.activities || []).reduce<ItineraryActivityLike[]>((keptActivities, activity) => {
      if (!isTipLikeActivity(activity)) {
        const split = splitDescriptionTips(activity);
        localTips.push(...split.localTips);
        transportTips.push(...split.transportTips);

        if (getStringValue(split.activity.description) || getStringValue(split.activity.name)) {
          keptActivities.push(split.activity);
        }

        return keptActivities;
      }

      const tipText = getTipText(activity);
      if (!tipText) return keptActivities;

      if (isTransportTip(activity)) {
        transportTips.push(tipText);
      } else {
        localTips.push(tipText);
      }

      return keptActivities;
    }, []);

    return {
      ...dayPlan,
      activities,
      localTip: appendTip(dayPlan.localTip, localTips),
      transportTips: appendTip(dayPlan.transportTips, transportTips),
    };
  });
}

export function normalizeDailyPlansForDisplay<T extends ItineraryDayPlanLike>(
  rawDailyPlans: unknown,
  rawInsights?: unknown
): { dailyPlans: T[]; insights: ItineraryInsight[] } {
  if (
    rawDailyPlans &&
    typeof rawDailyPlans === "object" &&
    !Array.isArray(rawDailyPlans) &&
    Array.isArray((rawDailyPlans as ItineraryPlanPayload<T>).dailyPlans)
  ) {
    const payload = rawDailyPlans as ItineraryPlanPayload<T>;
    return normalizeDailyPlansForDisplay<T>(
      payload.dailyPlans,
      rawInsights ?? payload.insights
    );
  }

  if (!Array.isArray(rawDailyPlans)) {
    return { dailyPlans: [], insights: normalizeItineraryInsights(rawInsights) };
  }

  const sanitizedPlans = sanitizeGeneratedDailyPlans(rawDailyPlans as T[]);
  const insights: ItineraryInsight[] = normalizeItineraryInsights(rawInsights);

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

    const dayPlanWithoutTips = { ...dayPlan };
    delete dayPlanWithoutTips.localTip;
    delete dayPlanWithoutTips.transportTips;

    return dayPlanWithoutTips as T;
  });

  return { dailyPlans, insights };
}

export function buildItineraryPlanPayload<T extends ItineraryDayPlanLike>(
  dailyPlans: T[],
  insights: ItineraryInsightLike[] = []
): T[] | ItineraryPlanPayload<T> {
  return insights.length > 0 ? { dailyPlans, insights } : dailyPlans;
}

export function parseDailyPlans(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}
