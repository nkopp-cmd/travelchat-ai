import { hasUsableCoordinates } from "@/lib/spots/location-confidence";

export interface SpotDirectionsInput {
    name: string;
    address: string;
    lat?: number;
    lng?: number;
    googlePlaceId?: string | null;
}

export function isKoreanLocation(address: string): boolean {
    const koreanIndicators = [
        "Korea",
        "Seoul",
        "Busan",
        "Incheon",
        "Daegu",
        "Daejeon",
        "Gwangju",
        "Ulsan",
        "Gyeonggi",
        "Gangwon",
        "Jeju",
        "대한민국",
        "서울",
        "부산",
        "인천",
        "대구",
        "대전",
        "광주",
        "울산",
        "제주",
    ];

    return koreanIndicators.some((indicator) =>
        address.toLowerCase().includes(indicator.toLowerCase())
    );
}

export function getSpotDirectionsSearchText(input: SpotDirectionsInput): string {
    return [input.name, input.address]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(", ");
}

export function buildSpotDirectionsUrl(input: SpotDirectionsInput): string {
    const exactQuery = getSpotDirectionsSearchText(input);

    if (isKoreanLocation(input.address)) {
        return `https://map.kakao.com/link/search/${encodeURIComponent(
            exactQuery || input.address
        )}`;
    }

    const destination =
        exactQuery ||
        (input.lat !== undefined &&
        input.lng !== undefined &&
        hasUsableCoordinates(input.lat, input.lng)
            ? `${input.lat},${input.lng}`
            : input.address);

    const params = new URLSearchParams({ api: "1", destination });
    if (input.googlePlaceId) {
        params.set("destination_place_id", input.googlePlaceId);
    }

    return `https://www.google.com/maps/dir/?${params.toString()}`;
}
