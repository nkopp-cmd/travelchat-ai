// Weekend picks content, shared by the landing list and /api/conditions.
export interface WeekendPick {
    slug: string;
    name: string;
    tagline: string;
}

export const WEEKEND_PICKS: WeekendPick[] = [
    { slug: "seoul", name: "Seoul", tagline: "Alleys that wake up after dark" },
    { slug: "tokyo", name: "Tokyo", tagline: "Tiny bars, quiet side streets" },
    { slug: "osaka", name: "Osaka", tagline: "Eat until you drop" },
    { slug: "kyoto", name: "Kyoto", tagline: "Temples and slow lanes" },
    { slug: "taipei", name: "Taipei", tagline: "Night markets and tea" },
    { slug: "bangkok", name: "Bangkok", tagline: "Street food until late" },
    { slug: "singapore", name: "Singapore", tagline: "Hawker halls and gardens" },
];

export const WEEKEND_PICK_SLUGS: readonly string[] = WEEKEND_PICKS.map((pick) => pick.slug);
