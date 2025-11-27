// Viator API Types and Interfaces

export interface ViatorActivity {
    id: string;
    productCode: string;
    title: string;
    description: string;
    shortDescription?: string;
    destination: string;
    city?: string;
    category: string;
    subcategories?: string[];
    duration: string;
    durationMinutes?: number;
    priceFrom: number;
    priceTo?: number;
    currency: string;
    rating?: number;
    reviewCount: number;
    images: string[];
    thumbnailUrl?: string;
    bookingUrl: string;
    viatorUrl: string;
    cancellationPolicy?: string;
    included?: string[];
    excluded?: string[];
    meetingPoint?: string;
    languages?: string[];
    accessibility?: string;
    maxTravelers?: number;
    instantConfirmation: boolean;
    mobileTicket: boolean;
    lastSynced?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface ViatorSearchParams {
    destination: string;
    city?: string;
    category?: string;
    startDate?: string;
    endDate?: string;
    minPrice?: number;
    maxPrice?: number;
    rating?: number;
    currency?: string;
    limit?: number;
    offset?: number;
}

export interface ViatorSearchResult {
    activities: ViatorActivity[];
    total: number;
    hasMore: boolean;
}

export interface ViatorAvailability {
    productCode: string;
    date: string;
    available: boolean;
    spotsRemaining?: number;
    price: number;
    currency: string;
}

export interface ViatorPricing {
    productCode: string;
    date: string;
    travelers: number;
    totalPrice: number;
    pricePerPerson: number;
    currency: string;
    breakdown?: {
        basePrice: number;
        taxes: number;
        fees: number;
    };
}

export interface ViatorBooking {
    id: string;
    userId: string;
    activityId: string;
    productCode: string;
    bookingReference?: string;
    viatorBookingId?: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    travelers: number;
    bookingDate: string;
    amount: number;
    currency: string;
    commissionRate?: number;
    commissionAmount?: number;
    partnerUrl: string;
    bookedAt: Date;
    confirmedAt?: Date;
    cancelledAt?: Date;
}

export interface SpotActivity {
    id: string;
    spotId: string;
    activityId: string;
    activity?: ViatorActivity;
    relevanceScore: number;
    distanceKm?: number;
    autoMatched: boolean;
    createdAt: Date;
}

export interface ViatorReview {
    id: string;
    productCode: string;
    rating: number;
    title: string;
    text: string;
    author: string;
    date: string;
    verified: boolean;
    helpful: number;
}

export interface ViatorCategory {
    id: string;
    name: string;
    slug: string;
    icon?: string;
    count?: number;
}

// API Response Types
export interface ViatorApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
    meta?: {
        total?: number;
        page?: number;
        limit?: number;
    };
}

// Mock data type for development
export interface MockViatorData {
    activities: ViatorActivity[];
    categories: ViatorCategory[];
}
