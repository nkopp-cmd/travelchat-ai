export type LocationConfidenceTone = "exact" | "pinned" | "area";

export interface SpotLocationInput {
    address: string;
    lat?: number | null;
    lng?: number | null;
}

export interface SpotLocationConfidence {
    label: string;
    description: string;
    tone: LocationConfidenceTone;
    exactAddress: boolean;
    usableCoordinates: boolean;
    reasons: string[];
}

const AREA_LEVEL_ADDRESS_PATTERN = /\b(various|multiple|near|around|area|areas|district|neighborhood|neighbourhood|countryside|region|zone)\b/i;
const STREET_WORD_PATTERN = /\b(street|st\.?|road|rd\.?|lane|ln\.?|avenue|ave\.?|blvd|boulevard|soi|gil|ro|dori|chome|ward|district|gu|ku|machi|cho|dong|jalan|lorong|drive|dr\.?|way|place|pl\.?)\b/i;

export function hasUsableCoordinates(lat: number | null | undefined, lng: number | null | undefined): boolean {
    if (typeof lat !== "number" || typeof lng !== "number") return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat === 0 && lng === 0) return false;
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function hasSpecificStreetAddress(address: string): boolean {
    const value = address.trim();
    if (!value) return false;

    const hasNumber = /\d/.test(value);
    const hasPostalCode = /\b\d{4,6}\b/.test(value) || value.includes("〒");
    const hasStreetWord = STREET_WORD_PATTERN.test(value);
    const hasMultipleParts = value.split(",").filter((part) => part.trim()).length >= 3;

    return hasPostalCode || (hasNumber && (hasStreetWord || hasMultipleParts));
}

export function isAreaLevelAddress(address: string): boolean {
    const value = address.trim();
    if (!value) return true;
    if (AREA_LEVEL_ADDRESS_PATTERN.test(value)) return true;
    return !hasSpecificStreetAddress(value);
}

export function getSpotLocationConfidence(input: SpotLocationInput): SpotLocationConfidence {
    const exactAddress = !isAreaLevelAddress(input.address);
    const usableCoordinates = hasUsableCoordinates(input.lat, input.lng);
    const reasons: string[] = [];

    if (!input.address.trim()) reasons.push("missing_address");
    if (!exactAddress) reasons.push("area_level_address");
    if (!usableCoordinates) reasons.push("missing_or_zero_coordinates");

    if (exactAddress) {
        return {
            label: "Exact address",
            description: usableCoordinates
                ? "Directions can use the stored map pin with the full address as context."
                : "Directions use the spot name and full address first.",
            tone: "exact",
            exactAddress,
            usableCoordinates,
            reasons,
        };
    }

    if (usableCoordinates) {
        return {
            label: "Pinned location",
            description: "The address is area-level, but this record has a stored map pin. Confirm the local map context before navigating.",
            tone: "pinned",
            exactAddress,
            usableCoordinates,
            reasons,
        };
    }

    return {
        label: "Area-level address",
        description: "This record has neighborhood-level source data. Maps opens a name and area search; confirm the pin before navigating.",
        tone: "area",
        exactAddress,
        usableCoordinates,
        reasons,
    };
}
