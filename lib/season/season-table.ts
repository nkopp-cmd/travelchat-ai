// What is good when, per city and month (shared/plans/localley-landing-map-weather.md step 3).
// Code, not an API: a reviewed table. Typical temperatures are rounded monthly mean daily
// minimum / maximum climate normals (1991-2020) from each national weather service; season
// moments follow the national tourism boards. Review it once a year; bloom and foliage dates
// move with the weather, so the labels name the usual window, not a forecast.

export type SeasonKind =
    | "blossom" | "foliage" | "festival" | "rainy" | "typhoon" | "hot" | "snow" | "cold" | "mild" | "dry";

export interface SeasonMonth {
    /** Short chip text, e.g. "Cherry blossom". */
    label: string;
    kind: SeasonKind;
    /** 1 (skip if you can) .. 5 (best time to go). */
    score: 1 | 2 | 3 | 4 | 5;
    /** Typical daily low / high in °C. */
    tempC: [number, number];
}

export interface CitySeason {
    sources: string[];
    /** January .. December. */
    months: [SeasonMonth, SeasonMonth, SeasonMonth, SeasonMonth, SeasonMonth, SeasonMonth,
        SeasonMonth, SeasonMonth, SeasonMonth, SeasonMonth, SeasonMonth, SeasonMonth];
}

const m = (label: string, kind: SeasonKind, score: SeasonMonth["score"], low: number, high: number): SeasonMonth =>
    ({ label, kind, score, tempC: [low, high] });

export const SEASON_TABLE: Record<string, CitySeason> = {
    seoul: {
        sources: ["KMA climate normals 1991-2020 (Seoul)", "Korea Tourism Organization seasonal guides"],
        months: [
            m("Deep winter", "cold", 2, -6, 2), m("Lunar New Year cold", "cold", 2, -4, 5), m("Early spring", "mild", 3, 2, 11),
            m("Cherry blossom", "blossom", 5, 8, 18), m("Clear spring days", "mild", 5, 13, 24), m("Rainy season starts", "rainy", 3, 18, 27),
            m("Monsoon (jangma)", "rainy", 2, 22, 29), m("Hot and humid", "hot", 2, 23, 30), m("Clear autumn skies", "mild", 4, 18, 26),
            m("Autumn foliage", "foliage", 5, 10, 20), m("Late foliage", "foliage", 4, 3, 12), m("Winter lights", "cold", 3, -4, 4),
        ],
    },
    tokyo: {
        sources: ["JMA climate normals 1991-2020 (Tokyo)", "JNTO seasonal guides"],
        months: [
            m("Crisp clear winter", "cold", 3, 1, 10), m("Plum blossom", "blossom", 3, 2, 11), m("Cherry blossom begins", "blossom", 4, 5, 14),
            m("Cherry blossom", "blossom", 5, 10, 19), m("Fresh green", "mild", 5, 15, 23), m("Rainy season (tsuyu)", "rainy", 2, 19, 26),
            m("Summer festivals", "festival", 3, 23, 30), m("Hot, typhoon risk", "typhoon", 2, 24, 31), m("Typhoon season", "typhoon", 3, 21, 27),
            m("Mild autumn", "mild", 4, 15, 22), m("Autumn leaves begin", "foliage", 5, 9, 17), m("Autumn leaves, lights", "foliage", 4, 4, 12),
        ],
    },
    osaka: {
        sources: ["JMA climate normals 1991-2020 (Osaka)", "JNTO seasonal guides"],
        months: [
            m("Crisp clear winter", "cold", 3, 3, 10), m("Plum blossom", "blossom", 3, 3, 10), m("Cherry blossom begins", "blossom", 4, 6, 14),
            m("Cherry blossom", "blossom", 5, 11, 20), m("Fresh green", "mild", 5, 16, 25), m("Rainy season (tsuyu)", "rainy", 2, 20, 28),
            m("Tenjin Matsuri", "festival", 3, 24, 32), m("Hot, typhoon risk", "typhoon", 2, 25, 34), m("Typhoon season", "typhoon", 3, 22, 29),
            m("Mild autumn", "mild", 4, 15, 23), m("Autumn leaves", "foliage", 5, 10, 17), m("Winter lights", "cold", 3, 5, 12),
        ],
    },
    kyoto: {
        sources: ["JMA climate normals 1991-2020 (Kyoto)", "JNTO seasonal guides"],
        months: [
            m("Quiet temples", "cold", 3, 1, 9), m("Plum blossom", "blossom", 3, 1, 10), m("Cherry blossom begins", "blossom", 4, 4, 14),
            m("Cherry blossom", "blossom", 5, 9, 20), m("Fresh green", "mild", 5, 14, 25), m("Rainy season (tsuyu)", "rainy", 2, 19, 28),
            m("Gion Matsuri", "festival", 3, 23, 32), m("Very hot", "hot", 2, 24, 34), m("Late summer heat", "hot", 3, 20, 29),
            m("Mild autumn", "mild", 4, 13, 23), m("Autumn leaves", "foliage", 5, 7, 17), m("Late leaves, quiet", "cold", 3, 3, 11),
        ],
    },
    taipei: {
        sources: ["CWA climate normals 1991-2020 (Taipei)", "Taiwan Tourism Administration events"],
        months: [
            m("Cool and damp", "mild", 3, 13, 19), m("Lantern Festival", "festival", 4, 14, 20), m("Spring, mild", "mild", 4, 15, 22),
            m("Warm spring", "mild", 4, 18, 26), m("Plum rains", "rainy", 3, 22, 29), m("Plum rains, hot", "rainy", 2, 24, 32),
            m("Hot, typhoon risk", "typhoon", 2, 26, 34), m("Hot, typhoon risk", "typhoon", 2, 26, 34), m("Typhoon season", "typhoon", 3, 25, 32),
            m("Clear autumn", "mild", 5, 21, 28), m("Pleasant autumn", "mild", 5, 18, 24), m("Cool and mild", "mild", 4, 15, 21),
        ],
    },
    bangkok: {
        sources: ["TMD climate normals 1991-2020 (Bangkok)", "Tourism Authority of Thailand events"],
        months: [
            m("Cool, dry season", "dry", 5, 22, 32), m("Dry and sunny", "dry", 5, 24, 33), m("Getting hot", "hot", 3, 25, 34),
            m("Songkran, hottest", "festival", 3, 26, 35), m("Hot, first rains", "hot", 2, 26, 34), m("Rainy season", "rainy", 3, 26, 33),
            m("Rainy season", "rainy", 3, 25, 33), m("Rainy season", "rainy", 3, 25, 33), m("Wettest month", "rainy", 2, 25, 32),
            m("Rains easing", "rainy", 3, 25, 32), m("Loy Krathong", "festival", 5, 23, 32), m("Cool, dry season", "dry", 5, 21, 31),
        ],
    },
    singapore: {
        sources: ["MSS climate normals 1991-2020 (Changi)", "Singapore Tourism Board events"],
        months: [
            m("NE monsoon showers", "rainy", 3, 23, 30), m("Lunar New Year, drier", "festival", 4, 24, 31), m("Drier and sunny", "dry", 4, 24, 32),
            m("Hot, afternoon storms", "hot", 3, 25, 32), m("Hot, afternoon storms", "hot", 3, 25, 32), m("SW monsoon, drier", "dry", 4, 25, 31),
            m("SW monsoon, drier", "dry", 4, 25, 31), m("National Day", "festival", 4, 25, 31), m("Haze possible", "hot", 3, 25, 31),
            m("Inter-monsoon storms", "rainy", 3, 24, 31), m("Wet NE monsoon", "rainy", 2, 24, 31), m("Wet, festive lights", "rainy", 3, 23, 30),
        ],
    },
};

/** The season entry for a city in a given month (0 = January), or null for cities not yet reviewed. */
export function seasonFor(citySlug: string, monthIndex: number): SeasonMonth | null {
    return SEASON_TABLE[citySlug]?.months[monthIndex] ?? null;
}

/** Month index (0-11) in the city's own time zone, so the chip changes at local midnight. */
export function localMonth(timeZone: string, now = new Date()): number {
    const month = new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric" }).format(now);
    return Number(month) - 1;
}
