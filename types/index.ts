export enum LocalleyScale {
    TOURIST_TRAP = 1,        // "Everyone goes here"
    TOURIST_FRIENDLY = 2,    // "Popular but decent"
    MIXED_CROWD = 3,         // "Tourists and locals"
    LOCAL_FAVORITE = 4,      // "Mostly locals"
    HIDDEN_GEM = 5,          // "Secret local spot"
    LEGENDARY_ALLEY = 6      // "Ultimate hidden treasure"
}

// Helper type for multi-language fields from Supabase
export type MultiLanguageField = string | Record<string, string> | null | undefined;

export interface Spot {
    id: string;
    name: string;
    description: string;
    location: {
        lat: number;
        lng: number;
        address: string;
    };
    category: string;
    subcategories: string[];
    localleyScore: LocalleyScale;
    localPercentage: number;
    bestTime: string;
    photos: string[];
    tips: string[];
    verified: boolean;
    trending: boolean;
}

export interface Itinerary {
    id: string;
    title: string;
    city: string;
    days: number;
    localScore: number;
    activities: Activity[];
}

export interface Activity {
    time: string;
    activity: string;
    location?: string;
    type: "food" | "sightseeing" | "shopping" | "relax";
}
