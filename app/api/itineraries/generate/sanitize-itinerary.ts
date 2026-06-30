interface GeneratedActivity {
  name?: string;
  description?: string;
  category?: string;
  type?: string;
  address?: string;
  [key: string]: unknown;
}

interface GeneratedDayPlan {
  activities?: GeneratedActivity[];
  localTip?: string;
  transportTips?: string;
  [key: string]: unknown;
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

export function isTipLikeActivity(activity: GeneratedActivity): boolean {
  const name = activity.name?.trim() || "";
  const category = activity.category?.trim() || "";
  const type = activity.type?.trim() || "";

  if (!name) return true;
  if (TIP_VALUE_PATTERN.test(name) || TIP_VALUE_PATTERN.test(category) || TIP_VALUE_PATTERN.test(type)) {
    return true;
  }

  return TIP_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function getTipText(activity: GeneratedActivity): string {
  const name = activity.name?.trim();
  const description = activity.description?.trim();

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

export function sanitizeGeneratedDailyPlans<T extends GeneratedDayPlan>(dailyPlans: T[]): T[] {
  return dailyPlans.map((dayPlan) => {
    const localTips: string[] = [];
    const transportTips: string[] = [];
    const activities = (dayPlan.activities || []).filter((activity) => {
      if (!isTipLikeActivity(activity)) return true;

      const tipText = getTipText(activity);
      if (!tipText) return false;

      if (TRANSPORT_PATTERN.test(`${activity.name || ""} ${activity.description || ""} ${activity.category || ""}`)) {
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
