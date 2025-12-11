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

// Notification types
export type NotificationType =
    | 'achievement'
    | 'level_up'
    | 'new_spot'
    | 'itinerary_shared'
    | 'itinerary_liked'
    | 'review_helpful'
    | 'friend_request'
    | 'friend_accepted'
    | 'challenge_start'
    | 'challenge_ending'
    | 'weekly_digest'
    | 'system';

export interface Notification {
    id: string;
    clerkUserId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: {
        spotId?: string;
        itineraryId?: string;
        userId?: string;
        challengeId?: string;
        achievementId?: string;
        url?: string;
        imageUrl?: string;
        [key: string]: unknown;
    };
    read: boolean;
    readAt?: string;
    createdAt: string;
}

export interface PushSubscription {
    id: string;
    clerkUserId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
    createdAt: string;
    lastUsedAt: string;
}

export interface NotificationPreferences {
    clerkUserId: string;
    pushEnabled: boolean;
    emailEnabled: boolean;
    achievements: boolean;
    levelUps: boolean;
    newSpots: boolean;
    social: boolean;
    challenges: boolean;
    weeklyDigest: boolean;
    system: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    timezone: string;
}
