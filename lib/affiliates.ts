/**
 * Affiliate link generation and tracking for Localley
 *
 * Partners:
 * - Viator: Tours and activities (8% commission)
 * - Booking.com: Hotels (25-40% commission)
 * - GetYourGuide: Tours (8% commission)
 * - Klook: Asia activities (5-8% commission)
 */

export type AffiliatePartner = "viator" | "booking" | "getyourguide" | "klook";

export interface AffiliateLink {
    partner: AffiliatePartner;
    url: string;
    trackingId: string;
    displayName: string;
    icon: string;
    commission: string;
}

export interface ActivityBookingOptions {
    activityName: string;
    city: string;
    category?: string;
    date?: string;
}

export interface HotelBookingOptions {
    city: string;
    checkIn?: string;
    checkOut?: string;
    guests?: number;
}

// Affiliate IDs - these would be your actual affiliate IDs
const AFFILIATE_IDS = {
    viator: process.env.VIATOR_AFFILIATE_ID || "localley",
    booking: process.env.BOOKING_AFFILIATE_ID || "localley",
    getyourguide: process.env.GYG_AFFILIATE_ID || "localley",
    klook: process.env.KLOOK_AFFILIATE_ID || "localley",
};

/**
 * Generate Viator search link for an activity
 */
export function getViatorLink(options: ActivityBookingOptions): AffiliateLink {
    const { activityName, city } = options;
    const searchQuery = encodeURIComponent(`${activityName} ${city}`);
    const trackingId = `${AFFILIATE_IDS.viator}-${Date.now()}`;

    // Viator deep link format
    const url = `https://www.viator.com/searchResults/all?text=${searchQuery}&pid=${AFFILIATE_IDS.viator}&mcid=42383&medium=link&campaign=localley`;

    return {
        partner: "viator",
        url,
        trackingId,
        displayName: "Book on Viator",
        icon: "🎫",
        commission: "8%",
    };
}

/**
 * Generate Booking.com search link for hotels
 */
export function getBookingLink(options: HotelBookingOptions): AffiliateLink {
    const { city, checkIn, checkOut, guests = 2 } = options;
    const destination = encodeURIComponent(city);
    const trackingId = `${AFFILIATE_IDS.booking}-${Date.now()}`;

    let url = `https://www.booking.com/searchresults.html?ss=${destination}&aid=${AFFILIATE_IDS.booking}&no_rooms=1&group_adults=${guests}`;

    if (checkIn) url += `&checkin=${checkIn}`;
    if (checkOut) url += `&checkout=${checkOut}`;

    return {
        partner: "booking",
        url,
        trackingId,
        displayName: "Find Hotels",
        icon: "🏨",
        commission: "25-40%",
    };
}

/**
 * Generate GetYourGuide search link
 */
export function getGetYourGuideLink(options: ActivityBookingOptions): AffiliateLink {
    const { activityName, city } = options;
    const searchQuery = encodeURIComponent(`${activityName} ${city}`);
    const trackingId = `${AFFILIATE_IDS.getyourguide}-${Date.now()}`;

    const url = `https://www.getyourguide.com/s/?q=${searchQuery}&partner_id=${AFFILIATE_IDS.getyourguide}&cmp=localley`;

    return {
        partner: "getyourguide",
        url,
        trackingId,
        displayName: "GetYourGuide",
        icon: "🎟️",
        commission: "8%",
    };
}

/**
 * Generate Klook search link (great for Asia)
 */
export function getKlookLink(options: ActivityBookingOptions): AffiliateLink {
    const { activityName, city } = options;
    const searchQuery = encodeURIComponent(`${activityName} ${city}`);
    const trackingId = `${AFFILIATE_IDS.klook}-${Date.now()}`;

    const url = `https://www.klook.com/search/?query=${searchQuery}&aid=${AFFILIATE_IDS.klook}`;

    return {
        partner: "klook",
        url,
        trackingId,
        displayName: "Book on Klook",
        icon: "🎪",
        commission: "5-8%",
    };
}

/**
 * Get all relevant booking links for an activity
 */
export function getActivityBookingLinks(options: ActivityBookingOptions): AffiliateLink[] {
    const { city } = options;
    const links: AffiliateLink[] = [];

    // Always include Viator
    links.push(getViatorLink(options));

    // Include GetYourGuide as alternative
    links.push(getGetYourGuideLink(options));

    // Include Klook for Asian cities
    const asianCities = [
        "tokyo", "osaka", "kyoto", "seoul", "busan", "bangkok", "singapore",
        "hong kong", "taipei", "kuala lumpur", "bali", "jakarta", "manila",
        "ho chi minh", "hanoi", "siem reap", "chiang mai", "phuket"
    ];

    if (asianCities.some(c => city.toLowerCase().includes(c))) {
        links.push(getKlookLink(options));
    }

    return links;
}

/**
 * Get hotel booking link for a city
 */
export function getHotelBookingLinks(options: HotelBookingOptions): AffiliateLink[] {
    return [getBookingLink(options)];
}

/**
 * Generate a tracking pixel URL for conversion tracking
 */
export function getTrackingPixelUrl(
    partner: AffiliatePartner,
    trackingId: string,
    eventType: "click" | "view" | "conversion"
): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localley.app";
    return `${baseUrl}/api/affiliates/track?partner=${partner}&tid=${trackingId}&event=${eventType}`;
}

/**
 * Map activity category to booking-friendly search terms
 */
export function getCategorySearchTerms(category: string): string[] {
    const categoryMap: Record<string, string[]> = {
        restaurant: ["food tour", "cooking class", "food experience"],
        cafe: ["coffee tour", "cafe hopping"],
        bar: ["bar crawl", "nightlife tour", "pub crawl"],
        market: ["market tour", "food market", "shopping tour"],
        temple: ["temple tour", "cultural tour", "heritage tour"],
        museum: ["museum tour", "art tour", "cultural experience"],
        park: ["nature tour", "hiking", "outdoor activity"],
        shopping: ["shopping tour", "fashion tour"],
        attraction: ["city tour", "sightseeing", "guided tour"],
        neighborhood: ["walking tour", "neighborhood tour", "local experience"],
    };

    return categoryMap[category.toLowerCase()] || ["tour", "experience"];
}

/**
 * Get the best booking partner for a category
 */
export function getBestPartnerForCategory(category: string, city: string): AffiliatePartner {
    // Klook is best for Asia
    const asianCities = ["tokyo", "osaka", "seoul", "bangkok", "singapore", "taipei", "hong kong"];
    const isAsianCity = asianCities.some(c => city.toLowerCase().includes(c));

    if (isAsianCity) {
        return "klook";
    }

    // Viator is generally best for tours/activities
    return "viator";
}

/**
 * Format price with currency
 */
export function formatAffiliatePrice(
    price: number,
    currency: string = "USD"
): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(price);
}

/**
 * Affiliate partner metadata
 */
export const AFFILIATE_PARTNERS: Record<AffiliatePartner, {
    name: string;
    logo: string;
    color: string;
    description: string;
}> = {
    viator: {
        name: "Viator",
        logo: "/partners/viator.svg",
        color: "#00AA6C",
        description: "World's largest tour marketplace",
    },
    booking: {
        name: "Booking.com",
        logo: "/partners/booking.svg",
        color: "#003580",
        description: "Best hotel deals worldwide",
    },
    getyourguide: {
        name: "GetYourGuide",
        logo: "/partners/gyg.svg",
        color: "#FF5533",
        description: "Tours & experiences",
    },
    klook: {
        name: "Klook",
        logo: "/partners/klook.svg",
        color: "#FF5722",
        description: "Asia's #1 travel activities",
    },
};
