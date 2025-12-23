/**
 * Anonymous usage tracking for guest itinerary generation
 * Uses localStorage on client and cookies for API tracking
 */

const ANONYMOUS_USAGE_KEY = "localley_anonymous_usage";
const ANONYMOUS_LIMIT = 1; // 1 free itinerary without signup

interface AnonymousUsage {
    itinerariesGenerated: number;
    lastGeneratedAt: string | null;
    sessionId: string;
}

/**
 * Generate a unique session ID for anonymous users
 */
function generateSessionId(): string {
    return `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get anonymous usage from localStorage (client-side only)
 */
export function getAnonymousUsage(): AnonymousUsage {
    if (typeof window === "undefined") {
        return {
            itinerariesGenerated: 0,
            lastGeneratedAt: null,
            sessionId: generateSessionId(),
        };
    }

    try {
        const stored = localStorage.getItem(ANONYMOUS_USAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        // localStorage not available or corrupted
    }

    // Initialize new anonymous usage
    const newUsage: AnonymousUsage = {
        itinerariesGenerated: 0,
        lastGeneratedAt: null,
        sessionId: generateSessionId(),
    };

    try {
        localStorage.setItem(ANONYMOUS_USAGE_KEY, JSON.stringify(newUsage));
    } catch {
        // localStorage not available
    }

    return newUsage;
}

/**
 * Check if anonymous user can generate another itinerary
 */
export function canGenerateAnonymously(): boolean {
    const usage = getAnonymousUsage();
    return usage.itinerariesGenerated < ANONYMOUS_LIMIT;
}

/**
 * Get remaining anonymous generations
 */
export function getRemainingAnonymousGenerations(): number {
    const usage = getAnonymousUsage();
    return Math.max(0, ANONYMOUS_LIMIT - usage.itinerariesGenerated);
}

/**
 * Track an anonymous itinerary generation (client-side)
 */
export function trackAnonymousGeneration(): void {
    if (typeof window === "undefined") return;

    const usage = getAnonymousUsage();
    usage.itinerariesGenerated += 1;
    usage.lastGeneratedAt = new Date().toISOString();

    try {
        localStorage.setItem(ANONYMOUS_USAGE_KEY, JSON.stringify(usage));
    } catch {
        // localStorage not available
    }
}

/**
 * Clear anonymous usage (useful for testing)
 */
export function clearAnonymousUsage(): void {
    if (typeof window === "undefined") return;

    try {
        localStorage.removeItem(ANONYMOUS_USAGE_KEY);
    } catch {
        // localStorage not available
    }
}

/**
 * Get the anonymous session ID for API tracking
 */
export function getAnonymousSessionId(): string {
    return getAnonymousUsage().sessionId;
}

/**
 * Check if user has ever used anonymous generation
 */
export function hasUsedAnonymousGeneration(): boolean {
    const usage = getAnonymousUsage();
    return usage.itinerariesGenerated > 0;
}
