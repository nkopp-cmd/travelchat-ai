import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

// Curated Unsplash images for fallback (when no ai_backgrounds in database)
// IMPORTANT: Use fm=jpg to force JPEG — Satori/resvg CANNOT decode WebP
const CITY_IMAGES: Record<string, string[]> = {
    'seoul': [
        'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=720&h=1280&fit=crop&q=80&fm=jpg',
        'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=720&h=1280&fit=crop&q=80&fm=jpg',
    ],
    'tokyo': [
        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=720&h=1280&fit=crop&q=80&fm=jpg',
        'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=720&h=1280&fit=crop&q=80&fm=jpg',
    ],
    'bangkok': [
        'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=720&h=1280&fit=crop&q=80&fm=jpg',
        'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=720&h=1280&fit=crop&q=80&fm=jpg',
    ],
    'singapore': [
        'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=720&h=1280&fit=crop&q=80&fm=jpg',
        'https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=720&h=1280&fit=crop&q=80&fm=jpg',
    ],
};

const DEFAULT_TRAVEL_IMAGES = [
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=720&h=1280&fit=crop&q=80&fm=jpg',
    'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=720&h=1280&fit=crop&q=80&fm=jpg',
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=720&h=1280&fit=crop&q=80&fm=jpg',
    'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=720&h=1280&fit=crop&q=80&fm=jpg',
];

/**
 * Get a fallback Unsplash image for a city.
 * Pass `exclude` to avoid returning a URL that already failed pre-fetch.
 */
function getFallbackImage(city: string, exclude?: string): string {
    const normalizedCity = city.toLowerCase().trim();
    const images = CITY_IMAGES[normalizedCity] || DEFAULT_TRAVEL_IMAGES;
    // If we need to exclude a URL, filter it out first
    if (exclude) {
        const filtered = images.filter(url => url !== exclude);
        if (filtered.length > 0) {
            return filtered[Math.floor(Math.random() * filtered.length)];
        }
    }
    return images[Math.floor(Math.random() * images.length)];
}

/**
 * Ensure Unsplash URLs use JPEG format (Satori/resvg cannot decode WebP).
 * All hardcoded URLs already have &fm=jpg, but this is a safety net for DB-stored URLs.
 */
function ensureJpegFormat(url: string): string {
    if (url.includes('images.unsplash.com')) {
        if (!url.includes('fm=')) {
            return url + '&fm=jpg';
        }
        if (!url.includes('fm=jpg')) {
            return url.replace(/fm=\w+/, 'fm=jpg');
        }
    }
    return url;
}

/**
 * Pre-fetch an image and return as base64 data URI.
 * Required because Satori's internal fetch is unreliable on Vercel Node.js.
 */
async function prefetchImage(url: string): Promise<string | undefined> {
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: { 'Accept': 'image/jpeg,image/png,image/gif,image/*' },
        });
        if (!res.ok) return undefined;
        const ct = res.headers.get('content-type') || 'image/jpeg';
        if (ct.includes('webp')) return undefined;
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 500) return undefined;
        return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`;
    } catch {
        return undefined;
    }
}

// Story dimensions (9:16 aspect ratio for Instagram/TikTok)
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

// Social media safety zones (Instagram/TikTok/Facebook)
// These areas are covered by UI elements (username, likes, comments, captions)
const SAFE_ZONE = {
    TOP: 180,        // Username, timestamp, close button
    BOTTOM: 320,     // Caption area, reply bar, swipe up
    LEFT: 48,        // Generally safe, small margin
    RIGHT: 140,      // Like, comment, share, bookmark buttons
};

interface Activity {
    name: string | Record<string, string>;
    description?: string;
    time?: string;
    localleyScore?: number;
}

interface DayPlan {
    day: number;
    theme?: string;
    activities: Activity[];
}

/**
 * Safely convert any value to a display string.
 * Handles MultiLang objects ({en: "...", ko: "..."}), nulls, numbers, etc.
 */
function safeString(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        return String(obj.en || obj.ko || obj.name || fallback);
    }
    return fallback;
}

// Cover slide template
function CoverSlide({ title, city, days, backgroundImage }: { title: string; city: string; days: number; backgroundImage?: string }) {
    return (
        <div
            style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Background image layer - always show, use gradient as fallback */}
            {backgroundImage ? (
                <img
                    src={backgroundImage}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        objectFit: "cover",
                    }}
                />
            ) : (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
                    }}
                />
            )}
            {/* Gradient overlay for text readability */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.6) 100%)",
                }}
            />

            {/* Safe zone content container */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "relative",
                    paddingTop: SAFE_ZONE.TOP,
                    paddingBottom: SAFE_ZONE.BOTTOM,
                    paddingLeft: SAFE_ZONE.LEFT,
                    paddingRight: SAFE_ZONE.RIGHT,
                    flex: 1,
                }}
            >
                {/* Logo - Glassmorphism style - positioned at top of safe zone */}
                <div
                    style={{
                        position: "absolute",
                        top: SAFE_ZONE.TOP + 20,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: "rgba(0,0,0,0.3)",
                        padding: "12px 28px",
                        borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.2)",
                    }}
                >
                    <span style={{ fontSize: 32, color: "white", fontWeight: "bold" }}>
                        Localley
                    </span>
                </div>

                {/* Main content card - Glassmorphism */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        padding: "44px 52px",
                        borderRadius: 32,
                        border: "1px solid rgba(255,255,255,0.15)",
                        maxWidth: STORY_WIDTH - SAFE_ZONE.LEFT - SAFE_ZONE.RIGHT - 60,
                    }}
                >
                    {/* City Badge */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            backgroundColor: "rgba(0,0,0,0.3)",
                            padding: "12px 24px",
                            borderRadius: 100,
                            marginBottom: 28,
                            border: "1px solid rgba(255,255,255,0.2)",
                        }}
                    >
                        <span style={{ fontSize: 28, color: "white" }}>📍 {city}</span>
                    </div>

                    {/* Title */}
                    <h1
                        style={{
                            fontSize: 56,
                            fontWeight: "bold",
                            color: "white",
                            textAlign: "center",
                            lineHeight: 1.2,
                            margin: "0 0 28px 0",
                            textShadow: "0 4px 20px rgba(0,0,0,0.5)",
                        }}
                    >
                        {title}
                    </h1>

                    {/* Days info */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                            backgroundColor: "rgba(0,0,0,0.3)",
                            padding: "16px 32px",
                            borderRadius: 20,
                            border: "1px solid rgba(255,255,255,0.15)",
                        }}
                    >
                        <span style={{ fontSize: 26, color: "white" }}>
                            🗓️ {days} {days === 1 ? "Day" : "Days"} of Adventure
                        </span>
                    </div>
                </div>

                {/* Swipe indicator - positioned above bottom safe zone */}
                <div
                    style={{
                        position: "absolute",
                        bottom: 40,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <span style={{ fontSize: 22, color: "rgba(255,255,255,0.8)" }}>
                        Swipe to explore →
                    </span>
                </div>
            </div>
        </div>
    );
}

// Day slide template
function DaySlide({ dayPlan, dayNumber, backgroundImage, isPaidUser }: { dayPlan: DayPlan; dayNumber: number; backgroundImage?: string; isPaidUser?: boolean }) {
    const activities = dayPlan.activities?.slice(0, 3) || [];

    return (
        <div
            style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Background image layer */}
            {backgroundImage ? (
                <img
                    src={backgroundImage}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        objectFit: "cover",
                    }}
                />
            ) : (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)",
                    }}
                />
            )}
            {/* Gradient overlay for readability */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0.5) 100%)",
                }}
            />

            {/* Safe zone content container — centered like Cover/Summary */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "relative",
                    paddingTop: SAFE_ZONE.TOP,
                    paddingBottom: SAFE_ZONE.BOTTOM,
                    paddingLeft: SAFE_ZONE.LEFT,
                    paddingRight: SAFE_ZONE.RIGHT,
                    flex: 1,
                }}
            >
                {/* Logo — centered at top of safe zone */}
                <div
                    style={{
                        position: "absolute",
                        top: SAFE_ZONE.TOP + 20,
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.3)",
                        padding: "10px 24px",
                        borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.2)",
                    }}
                >
                    <span style={{ fontSize: 28, color: "white", fontWeight: "bold" }}>
                        Localley
                    </span>
                </div>

                {/* Main content card — centered glass card with Day title + activities */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        padding: "36px 44px",
                        borderRadius: 28,
                        border: "1px solid rgba(255,255,255,0.15)",
                        maxWidth: STORY_WIDTH - SAFE_ZONE.LEFT - SAFE_ZONE.RIGHT - 60,
                        width: "100%",
                    }}
                >
                    {/* Day number badge */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            backgroundColor: "rgba(124,58,237,0.5)",
                            padding: "10px 28px",
                            borderRadius: 100,
                            border: "1px solid rgba(255,255,255,0.25)",
                            marginBottom: 20,
                        }}
                    >
                        <span style={{ fontSize: 26, color: "white", fontWeight: "bold" }}>
                            Day {dayPlan.day || dayNumber}
                        </span>
                    </div>

                    {/* Day theme */}
                    {dayPlan.theme && (
                        <span
                            style={{
                                fontSize: 36,
                                fontWeight: "bold",
                                color: "white",
                                textAlign: "center",
                                marginBottom: 28,
                                textShadow: "0 2px 12px rgba(0,0,0,0.5)",
                            }}
                        >
                            {safeString(dayPlan.theme)}
                        </span>
                    )}

                    {/* Activities list */}
                    {activities.length > 0 && (
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                                width: "100%",
                            }}
                        >
                            {activities.map((activity, index) => (
                                <div
                                    key={index}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 14,
                                        backgroundColor: "rgba(0,0,0,0.3)",
                                        padding: "16px 24px",
                                        borderRadius: 16,
                                        border: "1px solid rgba(255,255,255,0.12)",
                                    }}
                                >
                                    <span style={{ fontSize: 24 }}>
                                        {Number(activity.localleyScore) >= 5
                                            ? "💎"
                                            : Number(activity.localleyScore) >= 4
                                                ? "⭐"
                                                : "📍"}
                                    </span>
                                    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                                        <span
                                            style={{
                                                fontSize: 24,
                                                fontWeight: "bold",
                                                color: "white",
                                            }}
                                        >
                                            {safeString(activity.name, "Activity")}
                                        </span>
                                        {activity.time && (
                                            <span style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                                                {safeString(activity.time)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer — only show for free users */}
                {!isPaidUser && (
                    <div
                        style={{
                            position: "absolute",
                            bottom: 40,
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        <span style={{ fontSize: 20, color: "rgba(255,255,255,0.6)" }}>
                            localley.io
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// Summary slide template
function SummarySlide({ title, city, highlights, backgroundImage, isPaidUser }: { title: string; city: string; highlights: string[]; backgroundImage?: string; isPaidUser?: boolean }) {
    // Ensure highlights is an array and has content
    const safeHighlights = Array.isArray(highlights) && highlights.length > 0
        ? highlights
        : [`Explore ${city}`, "Discover local gems", "Create memories", "Experience culture"];

    return (
        <div
            style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Background image layer - always show full size */}
            {backgroundImage ? (
                <img
                    src={backgroundImage}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        objectFit: "cover",
                    }}
                />
            ) : (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #0891b2 100%)",
                    }}
                />
            )}
            {/* Subtle gradient overlay for readability - lets background show through */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.5) 100%)",
                }}
            />

            {/* Safe zone content container */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "relative",
                    paddingTop: SAFE_ZONE.TOP,
                    paddingBottom: SAFE_ZONE.BOTTOM,
                    paddingLeft: SAFE_ZONE.LEFT,
                    paddingRight: SAFE_ZONE.RIGHT,
                    flex: 1,
                }}
            >
                {/* Logo - Glassmorphism style - positioned at top of safe zone */}
                <div
                    style={{
                        position: "absolute",
                        top: SAFE_ZONE.TOP + 20,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: "rgba(0,0,0,0.3)",
                        padding: "10px 24px",
                        borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.2)",
                    }}
                >
                    <span style={{ fontSize: 28, color: "white", fontWeight: "bold" }}>
                        Localley
                    </span>
                </div>

                {/* Main content card - Glassmorphism */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        padding: "32px 40px",
                        borderRadius: 28,
                        border: "1px solid rgba(255,255,255,0.15)",
                        maxWidth: STORY_WIDTH - SAFE_ZONE.LEFT - SAFE_ZONE.RIGHT - 40,
                        width: "100%",
                    }}
                >
                    {/* Title */}
                    <span
                        style={{
                            fontSize: 36,
                            color: "rgba(255,255,255,0.9)",
                            marginBottom: 16,
                        }}
                    >
                        ✨ Trip Highlights
                    </span>

                    <h2
                        style={{
                            fontSize: 40,
                            fontWeight: "bold",
                            color: "white",
                            textAlign: "center",
                            marginBottom: 28,
                            textShadow: "0 4px 16px rgba(0,0,0,0.4)",
                        }}
                    >
                        {title}
                    </h2>

                    {/* Highlights - Glassmorphism cards - limit to 4 for safe zone */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            width: "100%",
                        }}
                    >
                        {safeHighlights.slice(0, 4).map((highlight, index) => (
                            <div
                                key={index}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 14,
                                    backgroundColor: "rgba(0,0,0,0.3)",
                                    padding: "16px 24px",
                                    borderRadius: 14,
                                    border: "1px solid rgba(255,255,255,0.15)",
                                }}
                            >
                                <span style={{ fontSize: 24, color: "#6ee7b7" }}>•</span>
                                <span style={{ fontSize: 24, color: "white" }}>{highlight}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CTA - only show for free users */}
                {!isPaidUser && (
                    <div
                        style={{
                            position: "absolute",
                            bottom: 40,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 12,
                        }}
                    >
                        <div
                            style={{
                                backgroundColor: "rgba(255,255,255,0.95)",
                                padding: "14px 36px",
                                borderRadius: 100,
                                boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                            }}
                        >
                            <span style={{ fontSize: 22, fontWeight: "bold", color: "#059669" }}>
                                Plan yours at localley.io
                            </span>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                backgroundColor: "rgba(0,0,0,0.3)",
                                padding: "8px 20px",
                                borderRadius: 100,
                                border: "1px solid rgba(255,255,255,0.2)",
                            }}
                        >
                            <span style={{ fontSize: 18, color: "rgba(255,255,255,0.9)" }}>
                                📍 {city}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const debugMode = new URL(req.url).searchParams.get("debug") === "true";
    const diagnostics: Record<string, unknown> = { timestamp: new Date().toISOString(), runtime: "nodejs" };

    try {
        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const slide = searchParams.get("slide") || "cover";
        const dayIndex = parseInt(searchParams.get("day") || "1", 10) - 1;
        const isPaidUser = searchParams.get("paid") === "true";
        diagnostics.params = { id, slide, dayIndex, isPaidUser };

        const supabase = createSupabaseAdmin();
        diagnostics.supabaseCreated = true;

        // Use select("*") — safe even if ai_backgrounds column doesn't exist yet
        // (select("*") returns whatever columns exist, unlike named selects which error)
        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .single();

        diagnostics.queryResult = { hasData: !!itinerary, error: error?.message || null };

        if (debugMode && (error || !itinerary)) {
            return NextResponse.json({ ...diagnostics, step: "query_failed" });
        }

        if (error || !itinerary) {
            console.error("[STORY_ROUTE] Itinerary query failed:", error?.message || "not found", { id });
            // Return a valid PNG error slide instead of text 404
            const errResponse = new ImageResponse(
                (
                    <div style={{
                        width: STORY_WIDTH, height: STORY_HEIGHT, display: "flex",
                        justifyContent: "center", alignItems: "center",
                        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
                    }}>
                        <span style={{ fontSize: 48, color: "white", fontWeight: "bold" }}>Localley</span>
                    </div>
                ),
                { width: STORY_WIDTH, height: STORY_HEIGHT }
            );
            errResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            return errResponse;
        }

        // ai_backgrounds may or may not exist depending on migration status
        const aiBackgrounds = (itinerary.ai_backgrounds && typeof itinerary.ai_backgrounds === 'object')
            ? itinerary.ai_backgrounds as Record<string, string>
            : null;

        let aiBackground: string | undefined;

        console.log("[STORY_ROUTE] Rendering slide:", {
            slide,
            dayIndex,
            title: itinerary.title,
            city: itinerary.city,
            hasAiBackgrounds: !!aiBackgrounds,
            backgroundKeys: aiBackgrounds ? Object.keys(aiBackgrounds) : [],
        });

        if (aiBackgrounds) {
            if (slide === "cover" && aiBackgrounds.cover) {
                aiBackground = aiBackgrounds.cover;
                console.log("[STORY_ROUTE] Using cover background, length:", aiBackground.length);
            } else if (slide === "summary" && aiBackgrounds.summary) {
                aiBackground = aiBackgrounds.summary;
                console.log("[STORY_ROUTE] Using summary background, length:", aiBackground.length);
            } else if (slide === "day") {
                // Check for day-specific background
                const dayBgKey = `day${dayIndex + 1}`;
                if (aiBackgrounds[dayBgKey]) {
                    aiBackground = aiBackgrounds[dayBgKey];
                    console.log("[STORY_ROUTE] Using", dayBgKey, "background, length:", aiBackground.length);
                } else {
                    console.log("[STORY_ROUTE] No background for", dayBgKey, "- using fallback");
                }
            }
        } else {
            console.log("[STORY_ROUTE] No ai_backgrounds in database for itinerary:", id);
        }

        // Use fallback image if no background was found
        if (!aiBackground && itinerary.city) {
            aiBackground = getFallbackImage(itinerary.city);
            console.log("[STORY_ROUTE] Using fallback image for", itinerary.city, ":", aiBackground);
        }

        // Ensure JPEG format for Satori compatibility (no WebP)
        if (aiBackground) {
            aiBackground = ensureJpegFormat(aiBackground);
        }

        // Pre-fetch the image as base64 for Satori (Node.js fetch is unreliable in Satori)
        let backgroundDataUri: string | undefined;
        if (aiBackground) {
            backgroundDataUri = await prefetchImage(aiBackground);
            if (!backgroundDataUri && itinerary.city) {
                const fallback = ensureJpegFormat(getFallbackImage(itinerary.city, aiBackground));
                backgroundDataUri = await prefetchImage(fallback);
            }
        }
        diagnostics.background = {
            aiBackground: aiBackground?.substring(0, 80),
            prefetchSuccess: !!backgroundDataUri,
            dataUriLength: backgroundDataUri?.length,
        };

        if (debugMode) {
            return NextResponse.json({ ...diagnostics, step: "pre_render" });
        }

        // Robust activities parsing — handle all possible data shapes
        let rawActivities: unknown = itinerary.activities;
        if (typeof rawActivities === "string") {
            try { rawActivities = JSON.parse(rawActivities); } catch { rawActivities = []; }
        }
        const parsedActivities = Array.isArray(rawActivities) ? rawActivities : [];

        // Normalize: detect DayPlan[] (has nested .activities) vs other formats
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dailyPlans: DayPlan[] = parsedActivities.length > 0 && (parsedActivities[0] as any)?.activities
            ? parsedActivities as DayPlan[]
            : [];

        console.log("[STORY_ROUTE] Parsed activities:", {
            rawType: typeof itinerary.activities,
            isArray: Array.isArray(rawActivities),
            parsedLength: parsedActivities.length,
            dailyPlansLength: dailyPlans.length,
            hasDayActivities: dailyPlans.length > 0 ? !!dailyPlans[0]?.activities : false,
        });

        let element;

        switch (slide) {
            case "cover":
                element = (
                    <CoverSlide
                        title={itinerary.title}
                        city={itinerary.city}
                        days={itinerary.days}
                        backgroundImage={backgroundDataUri || undefined}
                    />
                );
                break;

            case "day":
                // Graceful fallback: if dayPlan doesn't exist, render a minimal day slide
                // instead of returning 404 (which causes broken image icon in the client)
                const dayPlan = dailyPlans[dayIndex] || {
                    day: dayIndex + 1,
                    theme: `Day ${dayIndex + 1}`,
                    activities: [],
                };
                console.log("[STORY_ROUTE] Day slide data:", {
                    dayIndex,
                    hasDayPlan: !!dailyPlans[dayIndex],
                    activitiesCount: dayPlan.activities?.length || 0,
                    theme: dayPlan.theme,
                });
                element = (
                    <DaySlide
                        dayPlan={dayPlan}
                        dayNumber={dayIndex + 1}
                        backgroundImage={backgroundDataUri || undefined}
                        isPaidUser={isPaidUser}
                    />
                );
                break;

            case "summary":
                element = (
                    <SummarySlide
                        title={itinerary.title}
                        city={itinerary.city}
                        highlights={itinerary.highlights || []}
                        backgroundImage={backgroundDataUri || undefined}
                        isPaidUser={isPaidUser}
                    />
                );
                break;

            default:
                return new Response("Invalid slide type", { status: 400 });
        }

        // Wrap ImageResponse in try-catch to never return error responses
        try {
            const response = new ImageResponse(element, {
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
            });
            // Prevent browsers/CDNs from caching gradient fallbacks or stale images
            response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            return response;
        } catch (renderError) {
            console.error("[STORY_ROUTE] ImageResponse render failed:", renderError);
            // Return a minimal gradient PNG instead of a 500 text error
            const fallbackLabel = slide === "day" ? `Day ${dayIndex + 1}` : slide === "cover" ? (itinerary.title || "Your Trip") : "Summary";
            const fallbackResponse = new ImageResponse(
                (
                    <div style={{
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
                    }}>
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            backgroundColor: "rgba(0,0,0,0.3)",
                            padding: "12px 28px",
                            borderRadius: 100,
                            border: "1px solid rgba(255,255,255,0.2)",
                            marginBottom: 40,
                        }}>
                            <span style={{ fontSize: 32, color: "white", fontWeight: "bold" }}>Localley</span>
                        </div>
                        <span style={{ fontSize: 56, color: "white", fontWeight: "bold", textShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
                            {fallbackLabel}
                        </span>
                    </div>
                ),
                { width: STORY_WIDTH, height: STORY_HEIGHT }
            );
            fallbackResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            return fallbackResponse;
        }
    } catch (error) {
        console.error("[STORY_ROUTE] Fatal error:", error);
        if (debugMode) {
            return NextResponse.json({
                ...diagnostics,
                step: "fatal_error",
                error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
            });
        }
        // Even the outermost catch should try to return a PNG, not text
        try {
            const fatalResponse = new ImageResponse(
                (
                    <div style={{
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
                    }}>
                        <span style={{ fontSize: 48, color: "white", fontWeight: "bold" }}>Localley</span>
                    </div>
                ),
                { width: STORY_WIDTH, height: STORY_HEIGHT }
            );
            fatalResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            return fatalResponse;
        } catch {
            return new Response("Failed to generate story", { status: 500 });
        }
    }
}
