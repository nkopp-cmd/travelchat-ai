import { getCityByName } from "@/lib/cities";

export interface SpotCityContextInput {
    name: string;
    address: string;
    lat?: number | null;
    lng?: number | null;
}

const KNOWN_CITY_COORDS: Array<{ city: string; lat: [number, number]; lng: [number, number] }> = [
    { city: "Seoul", lat: [37.35, 37.75], lng: [126.75, 127.25] },
    { city: "Tokyo", lat: [35.45, 35.9], lng: [139.45, 140] },
    { city: "Bangkok", lat: [13.45, 14.1], lng: [100.25, 100.9] },
    { city: "Singapore", lat: [1.15, 1.5], lng: [103.55, 104.1] },
    { city: "Osaka", lat: [34.5, 34.85], lng: [135.25, 135.75] },
    { city: "Kyoto", lat: [34.85, 35.2], lng: [135.55, 136] },
    { city: "Busan", lat: [35, 35.35], lng: [128.85, 129.35] },
    { city: "Jeju", lat: [33.1, 33.65], lng: [126.05, 126.95] },
    { city: "Hong Kong", lat: [22.1, 22.6], lng: [113.75, 114.45] },
    { city: "Taipei", lat: [24.85, 25.25], lng: [121.25, 121.8] },
    { city: "Keelung", lat: [25, 25.25], lng: [121.6, 121.9] },
    { city: "Yilan", lat: [24.5, 24.95], lng: [121.55, 121.95] },
    { city: "Hanoi", lat: [20.8, 21.25], lng: [105.65, 106.15] },
    { city: "Ho Chi Minh", lat: [10.6, 11], lng: [106.45, 106.95] },
    { city: "Kuala Lumpur", lat: [2.95, 3.35], lng: [101.5, 101.85] },
    { city: "Bali", lat: [-8.9, -8.05], lng: [114.85, 115.65] },
];

const LOCATION_KEYWORDS: Array<{ city: string; terms: string[] }> = [
    { city: "Kuala Lumpur", terms: ["jalan hang lekir", "petaling street", "bukit bintang", "chow kit"] },
    { city: "Bangkok", terms: ["don muang", "taopoon", "ari", "thonglor", "sukhumvit"] },
    { city: "Busan", terms: ["ilgwang", "haeundae", "gwangalli", "seomyeon"] },
    { city: "Kyoto", terms: ["gion", "arashiyama", "temple courtyard", "shrine"] },
    { city: "Keelung", terms: ["beining road", "badouzi", "miaokou", "heping island"] },
    { city: "Yilan", terms: ["wubin road", "wujie", "luodong", "jiaoxi", "dongshan"] },
    { city: "Seoul", terms: ["euljiro", "hongdae", "mullae", "haengdang", "hongje", "hwarang", "daebang", "hyehwa"] },
    { city: "Tokyo", terms: ["shinjuku", "kita city", "harmonica yokocho", "shimokitazawa", "koenji"] },
];

export function inferSpotContextCity(input: SpotCityContextInput): string | null {
    const haystack = `${input.name} ${input.address}`.toLowerCase();
    const textMatch = KNOWN_CITY_COORDS.find(({ city }) => haystack.includes(city.toLowerCase()));
    if (textMatch) return textMatch.city;

    const keywordMatch = LOCATION_KEYWORDS.find(({ terms }) =>
        terms.some((term) => haystack.includes(term))
    );
    if (keywordMatch) return keywordMatch.city;

    const lat = input.lat ?? null;
    const lng = input.lng ?? null;
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    const coordMatch = KNOWN_CITY_COORDS.find(
        ({ lat: latRange, lng: lngRange }) =>
            lat >= latRange[0] && lat <= latRange[1] && lng >= lngRange[0] && lng <= lngRange[1]
    );

    return coordMatch?.city ?? null;
}

export function inferSpotContextCitySlug(input: SpotCityContextInput): string | null {
    const cityName = inferSpotContextCity(input);
    if (!cityName) return null;

    return getCityByName(cityName)?.slug ?? null;
}
