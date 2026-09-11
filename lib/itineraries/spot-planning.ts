import { getCityByName } from "@/lib/cities";

export type PlanningSpot = {
    id: string;
    name: string;
    city: string;
    address: string;
    description: string;
    category: string;
    latitude?: number;
    longitude?: number;
};

export function isPlanningSpotId(value: unknown): value is string {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function planningCitiesMatch(left: string, right: string): boolean {
    const normalize = (value: string) =>
        (getCityByName(value.trim())?.name || value).trim().toLowerCase();
    return Boolean(left.trim() && right.trim()) && normalize(left) === normalize(right);
}

export type PlanningActivity = {
    name: string;
    spotId?: string;
    description?: string;
    address?: string;
    category?: string;
    lat?: number;
    lng?: number;
};

export function planHasSpot(plans: { activities: PlanningActivity[] }[], spotId: string): boolean {
    return plans.some((day) => day.activities.some((activity) => typeof activity.spotId === "string" && activity.spotId.toLowerCase() === spotId.toLowerCase()));
}

export function insertPlanningSpot<T extends { day: number; activities: PlanningActivity[] }>(
    plans: T[], spot: PlanningSpot, dayNumber: number, position: number,
): T[] {
    if (planHasSpot(plans, spot.id)) throw new Error("This spot is already in your plan.");
    const targets = plans.filter((day) => day.day === dayNumber);
    if (targets.length !== 1 || !Number.isInteger(position) || position < 0 || position > targets[0].activities.length) {
        throw new Error("Choose a valid day and position.");
    }
    const activity = {
        name: spot.name, description: spot.description, address: spot.address,
        category: spot.category, spotId: spot.id,
        ...(spot.latitude !== undefined && spot.longitude !== undefined
            ? { lat: spot.latitude, lng: spot.longitude } : {}),
    };
    return plans.map((day) => day.day === dayNumber ? {
        ...day,
        activities: [...day.activities.slice(0, position), activity, ...day.activities.slice(position)],
    } : day);
}

export const itinerarySnapshotFields = ["title", "city", "activities", "highlights", "estimated_cost"] as const;

export type ItinerarySnapshot = {
    title: string | null;
    city: string | null;
    activities: unknown;
    highlights: string[] | null;
    estimated_cost: string | null;
};

export function itinerarySnapshot(row: ItinerarySnapshot): ItinerarySnapshot {
    return Object.fromEntries(itinerarySnapshotFields.map((field) => [field, row[field]])) as ItinerarySnapshot;
}

export function isItinerarySnapshot(value: unknown): value is ItinerarySnapshot {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    if (!itinerarySnapshotFields.every((field) => Object.hasOwn(row, field) && row[field] !== undefined)) return false;
    return [row.title, row.city, row.estimated_cost].every((field) => field === null || typeof field === "string") &&
        (row.highlights === null || (Array.isArray(row.highlights) && row.highlights.every((item) => typeof item === "string")));
}
