import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { previewBackgroundId, previewBackgroundData } from "@/lib/app-data/preview-story-background-cache";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { previewItineraryDetail } from "@/lib/app-data/preview-itinerary-detail";
import { parsePreviewStoryPatch } from "@/lib/app-data/preview-story-metadata";
import { normalizeDailyPlansForDisplay } from "@/lib/itineraries/normalize-daily-plans";
import { STORY_MEDIA_R2 } from "@/lib/story-media-manifest";
import { getActivityEmoji, getHighlightEmoji } from "@/lib/story-emoji";
import { STORY_EMOJI_SVG } from "@/lib/story-emoji-svg";
import { isRetiredLibraryPath } from "@/lib/image-library";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Detect image format from buffer magic bytes.
 * CRITICAL: Supabase may report wrong content type if the file was uploaded with wrong type.
 * Always trust magic bytes over HTTP headers or blob.type.
 */
function detectMimeFromBytes(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    if (bytes.length < 4) return "image/png";
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "image/png";
    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "image/jpeg";
    // WebP: RIFF...WEBP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes.length > 11 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
    return "image/png";
}

interface StoryMediaBucket { get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null> }

/**
 * Story media step 1 (shared/plans/localley-decisions.md): read a known Supabase story
 * background from its byte-identical copy in R2 (binding STORY_MEDIA_R2). Same checks as the
 * Supabase path (size, magic bytes, no WebP). Any miss or error returns undefined, and the
 * caller falls back to the unchanged Supabase download.
 */
/** Content-addressed story media path stored in ai_backgrounds (no host): /media/story/<sha256>.<ext>. */
const STORY_MEDIA_PATH = /^\/media\/story\/([0-9a-f]{64}\.(?:png|jpg))$/;

async function prefetchFromR2(url: string): Promise<string | undefined> {
    // Painted library switched off (lib/image-library.json live=false): saved library slides render the gradient.
    if (isRetiredLibraryPath(url)) return undefined;
    const direct = STORY_MEDIA_PATH.exec(url)?.[1];
    const marker = "/storage/v1/object/public/generated-images/";
    const idx = url.indexOf(marker);
    if (!direct && idx === -1) return undefined;
    const object = direct ?? STORY_MEDIA_R2[decodeURIComponent(url.substring(idx + marker.length).split("?")[0])];
    if (!object) return undefined;
    try {
        const bucket = (globalThis as Record<symbol, { env?: { STORY_MEDIA_R2?: StoryMediaBucket } } | undefined>)
            [Symbol.for("__cloudflare-context__")]?.env?.STORY_MEDIA_R2;
        const found = await bucket?.get(`legacy/${object}`);
        if (!found) return undefined;
        const buf = await found.arrayBuffer();
        if (buf.byteLength < 500) return undefined;
        const detectedMime = detectMimeFromBytes(buf);
        if (detectedMime === "image/webp") return undefined;
        return `data:${detectedMime};base64,${Buffer.from(buf).toString("base64")}`;
    } catch {
        return undefined;
    }
}

/**
 * Pre-fetch an image via HTTP and return as base64 data URI.
 * Fallback for non-Supabase URLs. Uses magic byte detection for MIME type.
 */
async function prefetchImage(url: string): Promise<string | undefined> {
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            headers: { 'Accept': 'image/jpeg,image/png,image/gif,image/*' },
        });
        if (!res.ok) {
            console.error(`[STORY_ROUTE] Prefetch HTTP ${res.status} for:`, url.substring(0, 100));
            return undefined;
        }
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 500) {
            console.error("[STORY_ROUTE] Prefetch image too small:", buf.byteLength);
            return undefined;
        }
        // Detect actual format from magic bytes — don't trust Content-Type header
        const detectedMime = detectMimeFromBytes(buf);
        const headerType = res.headers.get('content-type') || 'unknown';
        if (detectedMime === "image/webp") {
            console.error("[STORY_ROUTE] Prefetch rejected WebP (detected from bytes)");
            return undefined;
        }
        if (headerType !== detectedMime && headerType !== "unknown") {
            console.log(`[STORY_ROUTE] HTTP MIME mismatch: header=${headerType} actual=${detectedMime} — using detected`);
        }
        console.log(`[STORY_ROUTE] HTTP fetch success: ${buf.byteLength} bytes, detected: ${detectedMime}, header: ${headerType}`);
        return `data:${detectedMime};base64,${Buffer.from(buf).toString('base64')}`;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[STORY_ROUTE] Prefetch error:", msg, "URL:", url.substring(0, 100));
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
    LEFT: 140,       // Match RIGHT for centered content
    RIGHT: 140,      // Like, comment, share, bookmark buttons
};

// Slide cards use the full width (TikTok's side buttons sit below the card rows); text must stay
// readable on a phone, so the card is ~940 px wide and the brand pill / footer sit just inside the
// top and bottom safe zones.
const CARD_SIDE = 70;
const CARD_WIDTH = STORY_WIDTH - CARD_SIDE * 2;

interface Activity {
    name: string | Record<string, string>;
    description?: string;
    time?: string;
    localleyScore?: number;
    category?: string;
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

/**
 * Compute a font size that fits `text` within `maxWidth` pixels,
 * starting from `basePx` and scaling down to at least `minPx`.
 */
function dynamicFontSize(text: string, maxWidth: number, basePx: number, minPx: number): number {
    const charWidthRatio = 0.55;
    const estimatedWidth = text.length * basePx * charWidthRatio;
    if (estimatedWidth <= maxWidth) return basePx;
    const scaled = Math.floor(basePx * (maxWidth / estimatedWidth));
    return Math.max(scaled, minPx);
}

/**
 * Draw an emoji from the bundled Twemoji set, so a slide never waits on (or loses) a CDN fetch.
 * Unknown characters fall back to text rendering.
 */
function StoryEmoji({ char, size }: { char: string; size: number }) {
    const src = STORY_EMOJI_SVG[char];
    if (!src) return <span style={{ fontSize: size }}>{char}</span>;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={src} width={size} height={size} style={{ width: size, height: size, flexShrink: 0 }} />;
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
                        display: "flex",
                    }}
                >
                    {/* Base gradient */}
                    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 35%, #4f46e5 65%, #2563eb 100%)" }} />
                    {/* Decorative glow orbs */}
                    <div style={{ position: "absolute", top: "15%", left: "10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)" }} />
                    <div style={{ position: "absolute", bottom: "20%", right: "5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%)" }} />
                    <div style={{ position: "absolute", top: "55%", left: "40%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.2) 0%, transparent 70%)" }} />
                </div>
            )}
            {/* Gradient overlay for text readability */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: backgroundImage
                        ? "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.6) 100%)"
                        : "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.35) 100%)",
                }}
            />

            {/* Safe zone content container */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    position: "relative",
                    paddingTop: SAFE_ZONE.TOP + 20,
                    paddingBottom: SAFE_ZONE.BOTTOM + 20,
                    paddingLeft: CARD_SIDE,
                    paddingRight: CARD_SIDE,
                    flex: 1,
                }}
            >
                {/* Logo - Glassmorphism style - positioned at top of safe zone */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: "rgba(0,0,0,0.3)",
                        padding: "12px 28px",
                        borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.2)",
                    }}
                >
                    <span style={{ fontSize: 36, color: "white", fontWeight: "bold" }}>
                        Localley
                    </span>
                </div>

                <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", width: "100%" }}>
                {/* Main content card - Glassmorphism */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        padding: "56px 56px",
                        borderRadius: 32,
                        border: "1px solid rgba(255,255,255,0.15)",
                        width: CARD_WIDTH,
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
                        <StoryEmoji char="📍" size={40} />
                        <span style={{ fontSize: 40, color: "white" }}>{city}</span>
                    </div>

                    {/* Title */}
                    <h1
                        style={{
                            fontSize: dynamicFontSize(title, 820, 80, 52),
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
                        <StoryEmoji char="🗓️" size={38} />
                        <span style={{ fontSize: 38, color: "white" }}>
                            {days} {days === 1 ? "Day" : "Days"} of Adventure
                        </span>
                    </div>
                </div>
                </div>

                {/* Swipe indicator - just above the bottom safe zone */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <span style={{ fontSize: 30, color: "rgba(255,255,255,0.85)" }}>
                        Swipe to explore →
                    </span>
                </div>
            </div>
        </div>
    );
}

// Rotating gradient palette for day slides (vibrant, branded)
const DAY_GRADIENTS = [
    { base: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)", orb1: "rgba(168,85,247,0.3)", orb2: "rgba(236,72,153,0.25)" },   // purple → pink
    { base: "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)", orb1: "rgba(59,130,246,0.3)", orb2: "rgba(6,182,212,0.25)" },     // blue → cyan
    { base: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)", orb1: "rgba(124,58,237,0.3)", orb2: "rgba(37,99,235,0.25)" },     // purple → blue
    { base: "linear-gradient(135deg, #059669 0%, #06b6d4 100%)", orb1: "rgba(5,150,105,0.3)", orb2: "rgba(6,182,212,0.25)" },      // emerald → cyan
    { base: "linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)", orb1: "rgba(109,40,217,0.3)", orb2: "rgba(79,70,229,0.25)" },     // violet → indigo
];

// Day slide template
function DaySlide({ dayPlan, dayNumber, backgroundImage, isPaidUser }: { dayPlan: DayPlan; dayNumber: number; backgroundImage?: string; isPaidUser?: boolean }) {
    const activities = dayPlan.activities?.slice(0, 4) || [];
    const dayGradient = DAY_GRADIENTS[(dayNumber - 1) % DAY_GRADIENTS.length];

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
                        display: "flex",
                    }}
                >
                    {/* Base gradient — rotates per day */}
                    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: dayGradient.base }} />
                    {/* Decorative glow orbs */}
                    <div style={{ position: "absolute", top: "10%", right: "15%", width: 350, height: 350, borderRadius: "50%", background: `radial-gradient(circle, ${dayGradient.orb1} 0%, transparent 70%)` }} />
                    <div style={{ position: "absolute", bottom: "25%", left: "10%", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${dayGradient.orb2} 0%, transparent 70%)` }} />
                </div>
            )}
            {/* Gradient overlay for readability */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: backgroundImage
                        ? "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0.5) 100%)"
                        : "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.3) 100%)",
                }}
            />

            {/* Safe zone content container — centered like Cover/Summary */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    position: "relative",
                    paddingTop: SAFE_ZONE.TOP + 20,
                    paddingBottom: SAFE_ZONE.BOTTOM + 20,
                    paddingLeft: CARD_SIDE,
                    paddingRight: CARD_SIDE,
                    flex: 1,
                }}
            >
                {/* Logo — centered at top of safe zone */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.3)",
                        padding: "10px 24px",
                        borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.2)",
                    }}
                >
                    <span style={{ fontSize: 36, color: "white", fontWeight: "bold" }}>
                        Localley
                    </span>
                </div>

                {/* Card sits low, above the footer: the photo shows on top, the card uses the lower space */}
                <div style={{ display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "center", width: "100%", paddingBottom: 28 }}>
                {/* Main content card — centered glass card with Day title + activities */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        padding: "48px 48px",
                        borderRadius: 28,
                        border: "1px solid rgba(255,255,255,0.15)",
                        width: CARD_WIDTH,
                    }}
                >
                    {/* Day number badge */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            backgroundColor: "rgba(124,58,237,0.5)",
                            padding: "12px 40px",
                            borderRadius: 100,
                            border: "1px solid rgba(255,255,255,0.25)",
                            marginBottom: 24,
                        }}
                    >
                        <span style={{ fontSize: 40, color: "white", fontWeight: "bold" }}>
                            Day {dayPlan.day || dayNumber}
                        </span>
                    </div>

                    {/* Day theme */}
                    {dayPlan.theme && (
                        <span
                            style={{
                                fontSize: dynamicFontSize(safeString(dayPlan.theme), 840, 52, 38),
                                lineHeight: 1.2,
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
                                gap: 16,
                                width: "100%",
                            }}
                        >
                            {activities.map((activity, index) => (
                                <div
                                    key={index}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 22,
                                        backgroundColor: "rgba(0,0,0,0.3)",
                                        padding: "22px 28px",
                                        borderRadius: 20,
                                        border: "1px solid rgba(255,255,255,0.12)",
                                    }}
                                >
                                    <StoryEmoji char={getActivityEmoji(activity)} size={48} />
                                    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                                        <span
                                            style={{
                                                fontSize: 40,
                                                fontWeight: "bold",
                                                lineHeight: 1.15,
                                                color: "white",
                                            }}
                                        >
                                            {safeString(activity.name, "Activity")}
                                        </span>
                                        {activity.time && (
                                            <span style={{ fontSize: 28, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
                                                {safeString(activity.time)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                </div>

                {/* Footer — only show for free users */}
                {!isPaidUser && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        <span style={{ fontSize: 30, color: "rgba(255,255,255,0.7)" }}>
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
                        display: "flex",
                    }}
                >
                    {/* Base gradient — purple/pink brand */}
                    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 45%, #ec4899 100%)" }} />
                    {/* Decorative glow orbs */}
                    <div style={{ position: "absolute", bottom: "15%", left: "15%", width: 450, height: 450, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.3) 0%, transparent 70%)" }} />
                    <div style={{ position: "absolute", top: "20%", right: "10%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)" }} />
                </div>
            )}
            {/* Subtle gradient overlay for readability - lets background show through */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: backgroundImage
                        ? "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.5) 100%)"
                        : "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.3) 100%)",
                }}
            />

            {/* Safe zone content container */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    position: "relative",
                    paddingTop: SAFE_ZONE.TOP + 20,
                    paddingBottom: SAFE_ZONE.BOTTOM + 20,
                    paddingLeft: CARD_SIDE,
                    paddingRight: CARD_SIDE,
                    flex: 1,
                }}
            >
                {/* Logo - Glassmorphism style - positioned at top of safe zone */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: "rgba(0,0,0,0.3)",
                        padding: "10px 24px",
                        borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.2)",
                    }}
                >
                    <span style={{ fontSize: 36, color: "white", fontWeight: "bold" }}>
                        Localley
                    </span>
                </div>

                {/* Card sits low, above the footer: the photo shows on top, the card uses the lower space */}
                <div style={{ display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "center", width: "100%", paddingBottom: 28 }}>
                {/* Main content card - Glassmorphism */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        padding: "48px 48px",
                        borderRadius: 28,
                        border: "1px solid rgba(255,255,255,0.15)",
                        width: CARD_WIDTH,
                    }}
                >
                    {/* Title */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                        <StoryEmoji char="✨" size={48} />
                        <span style={{ fontSize: 48, color: "rgba(255,255,255,0.9)" }}>Trip Highlights</span>
                    </div>

                    <h2
                        style={{
                            fontSize: dynamicFontSize(title, 840, 60, 40),
                            lineHeight: 1.2,
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
                                    gap: 22,
                                    backgroundColor: "rgba(0,0,0,0.3)",
                                    padding: "22px 28px",
                                    borderRadius: 20,
                                    border: "1px solid rgba(255,255,255,0.15)",
                                }}
                            >
                                <StoryEmoji char={getHighlightEmoji(highlight)} size={44} />
                                <span style={{ fontSize: 36, color: "white", flex: 1, lineHeight: 1.2 }}>{highlight}</span>
                            </div>
                        ))}
                    </div>
                </div>
                </div>

                {/* CTA - only show for free users */}
                {!isPaidUser && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 12,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                backgroundColor: "rgba(255,255,255,0.95)",
                                padding: "18px 44px",
                                borderRadius: 100,
                                boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                            }}
                        >
                            <span style={{ fontSize: 32, fontWeight: "bold", color: "#7c3aed" }}>
                                Plan yours at localley.io
                            </span>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                backgroundColor: "rgba(0,0,0,0.3)",
                                padding: "10px 26px",
                                borderRadius: 100,
                                border: "1px solid rgba(255,255,255,0.2)",
                            }}
                        >
                            <StoryEmoji char="📍" size={28} />
                            <span style={{ fontSize: 28, color: "rgba(255,255,255,0.9)" }}>{city}</span>
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
    let authorized = false;
    const candidate = isPreviewStoryCandidate(req);
    const responseHeaders: Record<string, string> = { "Cache-Control": "private, no-store" };
    if (candidate) responseHeaders["X-Localley-Data-Source"] = "d1-preview";

    try {
        const { userId } = await auth();
        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const slide = searchParams.get("slide") || "cover";
        const dayIndex = parseInt(searchParams.get("day") || "1", 10) - 1;
        const isPaidUser = searchParams.get("paid") === "true";
        diagnostics.params = { id, slide, dayIndex, isPaidUser };

        // Candidate reads reuse the exact-ID owner/public rules of the D1 detail repository.
        // Never instantiate the source admin client or fall back to it on candidate failure.
        let supabase: ReturnType<typeof createSupabaseAdmin> | undefined;
        let itinerary;
        if (candidate) {
            const result = await previewItineraryDetail(id, userId ?? "");
            if (result.state !== "found") {
                return NextResponse.json({ error: "Itinerary not found" }, { status: 404, headers: responseHeaders });
            }
            itinerary = result.itinerary;
            diagnostics.dataSource = "d1-preview";
            const backgrounds = itinerary.ai_backgrounds;
            if (backgrounds !== null && Object.keys(backgrounds as object).length > 0
                && !parsePreviewStoryPatch(backgrounds)) throw new Error("Invalid candidate background metadata");
        } else {
            supabase = createSupabaseAdmin();
            diagnostics.supabaseCreated = true;
            // Keep select("*"): deployments can have different optional media columns.
            const { data, error } = await supabase.from("itineraries").select("*").eq("id", id).single();
            diagnostics.queryResult = { hasData: !!data, error: error?.message || null };
            if (error && error.code !== "PGRST116") throw error;
            if (error || !data || (data.is_public !== true && (!userId || data.clerk_user_id !== userId))) {
                return NextResponse.json({ error: "Itinerary not found" }, { status: 404, headers: responseHeaders });
            }
            itinerary = data;
        }
        authorized = true;
        if (itinerary.is_public === true) {
            // The paid flag is a URL option, not viewer-specific tier data. Keep existing no-store behavior.
            responseHeaders["Cache-Control"] = "no-store, no-cache, must-revalidate";
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
            backgroundValues: aiBackgrounds
                ? Object.fromEntries(Object.entries(aiBackgrounds).map(([k, v]) => [k, typeof v === 'string' ? v.substring(0, 80) : typeof v]))
                : null,
        });

        if (aiBackgrounds) {
            if (slide === "cover" && aiBackgrounds.cover) {
                aiBackground = aiBackgrounds.cover;
                console.log("[STORY_ROUTE] Using cover background, length:", aiBackground.length, "url:", aiBackground.substring(0, 120));
            } else if (slide === "summary" && aiBackgrounds.summary) {
                aiBackground = aiBackgrounds.summary;
                console.log("[STORY_ROUTE] Using summary background, length:", aiBackground.length, "url:", aiBackground.substring(0, 120));
            } else if (slide === "day") {
                const dayBgKey = `day${dayIndex + 1}`;
                if (aiBackgrounds[dayBgKey]) {
                    aiBackground = aiBackgrounds[dayBgKey];
                    console.log("[STORY_ROUTE] Using", dayBgKey, "background, length:", aiBackground.length, "url:", aiBackground.substring(0, 120));
                } else {
                    console.log("[STORY_ROUTE] No background for", dayBgKey, "- available keys:", Object.keys(aiBackgrounds), "- using branded gradient fallback");
                }
            }
        } else {
            console.log("[STORY_ROUTE] No ai_backgrounds in database for itinerary:", id, "- using branded gradient fallback");
        }

        // Pre-fetch the image as base64 for Satori (Node.js fetch is unreliable in Satori)
        // R2 first for stored backgrounds, then HTTP fetch for stock (non-Supabase) URLs.
        let backgroundDataUri: string | undefined;
        if (candidate && aiBackground && previewBackgroundId(aiBackground)) {
            const background = await previewBackgroundData(aiBackground, String(itinerary.clerk_user_id));
            if (!background) throw new Error("Candidate background unavailable");
            backgroundDataUri = `data:${background.contentType};base64,${Buffer.from(background.bytes).toString("base64")}`;
        } else if (aiBackground) {
            const isSupabaseUrl = aiBackground.includes("supabase.co/storage/");
            const hasMarker = aiBackground.includes("/storage/v1/object/public/generated-images/");
            console.log("[STORY_ROUTE] Prefetch attempt:", { isSupabaseUrl, hasMarker, urlLength: aiBackground.length, urlPreview: aiBackground.substring(0, 150) });

            if (STORY_MEDIA_PATH.test(aiBackground)) {
                // Migrated backgrounds live only in R2; there is no Supabase or HTTP fallback.
                backgroundDataUri = await prefetchFromR2(aiBackground);
                console.log(`[STORY_ROUTE] story_media_source=${backgroundDataUri ? "r2_path" : "r2_path_missing"}`);
            } else if (isSupabaseUrl) {
                backgroundDataUri = await prefetchFromR2(aiBackground);
                // An R2 miss renders the branded gradient; Supabase is never read (exit 8b).
                console.log(`[STORY_ROUTE] story_media_source=${backgroundDataUri ? "r2" : "r2_missing"}`);
            }
            // Supabase exit 8b: archived Supabase URLs are served from R2 only, never fetched from supabase.co.
            if (!backgroundDataUri && !STORY_MEDIA_PATH.test(aiBackground) && !isSupabaseUrl) {
                backgroundDataUri = await prefetchImage(aiBackground);
                if (backgroundDataUri) {
                    console.log("[STORY_ROUTE] HTTP fetch succeeded, dataUri length:", backgroundDataUri.length);
                }
            }
            if (!backgroundDataUri) {
                console.error("[STORY_ROUTE] ALL prefetch methods failed for URL:", aiBackground, "- falling back to branded gradient");
            }
        }
        diagnostics.background = {
            aiBackground: aiBackground?.substring(0, 80),
            prefetchSuccess: !!backgroundDataUri,
            dataUriLength: backgroundDataUri?.length,
        };

        if (debugMode) {
            // In debug mode, actually try to render to see if ImageResponse works
            diagnostics.step = "attempting_render";
        }

        // Robust activities parsing — handle all possible data shapes
        let rawActivities: unknown = itinerary.activities;
        if (typeof rawActivities === "string") {
            try { rawActivities = JSON.parse(rawActivities); } catch { rawActivities = []; }
        }
        const dailyPlans = normalizeDailyPlansForDisplay<DayPlan>(rawActivities).dailyPlans;

        console.log("[STORY_ROUTE] Parsed activities:", {
            rawType: typeof itinerary.activities,
            isArray: Array.isArray(rawActivities),
            parsedLength: Array.isArray(rawActivities) ? rawActivities.length : dailyPlans.length,
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
                return new Response("Invalid slide type", { status: 400, headers: responseHeaders });
        }

        // Render the slide as PNG.
        // CRITICAL: Force-consume the ReadableStream with arrayBuffer() to catch
        // rendering errors. next/og's ImageResponse uses a lazy ReadableStream —
        // Satori renders asynchronously when the stream is consumed. If we return
        // the Response directly, stream errors produce corrupt/partial responses
        // that the client sees as broken images. By consuming first, we catch
        // errors and can return a proper fallback.
        try {
            const ogResponse = new ImageResponse(element, {
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
            });
            const pngBuffer = await ogResponse.arrayBuffer();
            console.log("[STORY_ROUTE] Render success:", pngBuffer.byteLength, "bytes");

            if (debugMode) {
                return NextResponse.json({
                    ...diagnostics,
                    step: "render_success",
                    pngBytes: pngBuffer.byteLength,
                }, { headers: responseHeaders });
            }

            return new Response(pngBuffer, {
                headers: {
                    'Content-Type': 'image/png',
                    ...responseHeaders,
                },
            });
        } catch (renderError) {
            console.error("[STORY_ROUTE] ImageResponse render failed:", renderError);

            if (debugMode) {
                return NextResponse.json({
                    ...diagnostics,
                    step: "render_failed",
                    error: renderError instanceof Error
                        ? { message: renderError.message, stack: renderError.stack }
                        : String(renderError),
                }, { headers: responseHeaders });
            }

            // Try a SIMPLE gradient fallback (no background image — that might be what crashed)
            const fallbackLabel = slide === "day" ? `Day ${dayIndex + 1}` : slide === "cover" ? (itinerary.title || "Your Trip") : "Summary";
            try {
                const fallbackOg = new ImageResponse(
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
                const fallbackBuf = await fallbackOg.arrayBuffer();
                return new Response(fallbackBuf, {
                    headers: {
                        'Content-Type': 'image/png',
                        ...responseHeaders,
                    },
                });
            } catch {
                return new Response("Failed to generate story", { status: 500, headers: responseHeaders });
            }
        }
    } catch (error) {
        console.error("[STORY_ROUTE] Fatal error:", error);
        if (!authorized) {
            return NextResponse.json({ error: "Failed to load story" }, { status: 500, headers: responseHeaders });
        }
        if (debugMode) {
            return NextResponse.json({
                ...diagnostics,
                step: "fatal_error",
                error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
            }, { headers: responseHeaders });
        }
        // Even the outermost catch should try to return a PNG, not text
        try {
            const fatalOg = new ImageResponse(
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
            const fatalBuf = await fatalOg.arrayBuffer();
            return new Response(fatalBuf, {
                headers: {
                    'Content-Type': 'image/png',
                    ...responseHeaders,
                },
            });
        } catch {
            return new Response("Failed to generate story", { status: 500, headers: responseHeaders });
        }
    }
}
