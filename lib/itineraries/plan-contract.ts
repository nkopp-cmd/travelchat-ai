/** Depth starts at the supplied JSON root. Unknown metadata is checked, not normalized. */
export function isBoundedJSON(value: unknown, depth = 0): boolean {
    if (depth > 64) return false;
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object") return false;
    return Object.values(value).every((child) => isBoundedJSON(child, depth + 1));
}

/** Accept structured plans or one legacy JSON string; never change the raw CAS snapshot. */
export function isEditableItineraryPlan(value: unknown): boolean {
    let payload = value;
    if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return false; }
    }
    if (!isBoundedJSON(payload)) return false;
    const record = (item: unknown): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item);
    const optionalStrings = (item: Record<string, unknown>, keys: string[]) => keys.every((key) => item[key] == null || typeof item[key] === "string");
    const plans = Array.isArray(payload) ? payload : record(payload) ? payload.dailyPlans : null;
    if (!Array.isArray(plans) || !plans.every((day) => record(day) && Number.isSafeInteger(day.day) && Number(day.day) > 0
        && optionalStrings(day, ["theme"])
        && Array.isArray(day.activities) && day.activities.every((activity) => record(activity)
            && typeof activity.name === "string" && !!activity.name.trim()
            && optionalStrings(activity, ["spotId", "description", "time", "duration", "cost", "address", "type", "category"])
            && ["lat", "lng", "localleyScore"].every((key) => activity[key] == null || (typeof activity[key] === "number" && Number.isFinite(activity[key])))))) return false;
    if (new Set(plans.map((day) => day.day)).size !== plans.length) return false;
    return !record(payload) || payload.insights === undefined || (Array.isArray(payload.insights)
        && payload.insights.every((insight) => record(insight) && typeof insight.text === "string"
            && optionalStrings(insight, ["id", "label", "kind"])));
}

/** Update only: retain owned wrapper metadata, never normalize the raw CAS snapshot. */
export function mergeItineraryPlanPayload<T, I>(
    observed: unknown,
    dailyPlans: T[],
    insights: I[] = [],
): T[] | ({ dailyPlans: T[]; insights: I[] } & Record<string, unknown>) {
    let payload = observed;
    if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { payload = null; }
    }
    if (payload && typeof payload === "object" && !Array.isArray(payload)
        && Object.hasOwn(payload, "dailyPlans") && Array.isArray((payload as Record<string, unknown>).dailyPlans)) {
        const metadata = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "dailyPlans" && key !== "insights"));
        if (Object.keys(metadata).length) {
            if (!isBoundedJSON(metadata)) throw new Error("Unsupported plan metadata");
            // Spread creates own data properties, including __proto__; editable fields win.
            return { ...metadata, dailyPlans, insights };
        }
    }
    return insights.length ? { dailyPlans, insights } : dailyPlans;
}
