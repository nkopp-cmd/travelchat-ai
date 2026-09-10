import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getGooglePlacesApiKey, normalizePhotoWidth } from "@/lib/place-images";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const developmentLimit = rateLimit({ windowMs: 60_000, maxRequests: 120 });
const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function unavailable(status = 502) {
    return new NextResponse("Place photo unavailable", {
        status, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
    });
}

function trustedImageUrl(value: string): URL {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !(host === "googleusercontent.com" || host.endsWith(".googleusercontent.com") ||
          host === "ggpht.com" || host.endsWith(".ggpht.com"))) {
        throw new Error("Untrusted image host");
    }
    return url;
}

async function readBounded(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
    if (Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel();
        throw new Error("Response too large");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) throw new Error("Response too large");
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
}

function imageType(bytes: Uint8Array): string | null {
    const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
    const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    if (bytes.length < 12) return null;
    if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
    if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
    if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
    if (["GIF87a", "GIF89a"].includes(text(0, 6))) return "image/gif";
    if (text(4, 8) === "ftyp") {
        const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
        if (boxSize >= 16 && boxSize <= bytes.length) {
            if (["avif", "avis"].includes(text(8, 12))) return "image/avif";
            for (let i = 16; i + 4 <= boxSize; i += 4) {
                if (["avif", "avis"].includes(text(i, i + 4))) return "image/avif";
            }
        }
    }
    return null;
}

export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams;
    const name = params.get("name");
    const ref = params.get("ref");
    if ((!!name === !!ref) || params.getAll("name").length > 1 || params.getAll("ref").length > 1 ||
        (name && !/^places\/[A-Za-z0-9_-]{1,256}\/photos\/[A-Za-z0-9_-]{1,4096}$/.test(name)) ||
        (ref && !/^[A-Za-z0-9_-]{1,4096}$/.test(ref))) return unavailable(400);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
        // The shared helper deliberately fails open. Production must not use that fallback.
        if (process.env.NODE_ENV === "production") {
            const url = process.env.UPSTASH_REDIS_REST_URL;
            const token = process.env.UPSTASH_REDIS_REST_TOKEN;
            if (!url || !token) return unavailable(503);
            const limiter = new Ratelimit({ redis: new Redis({ url, token }),
                limiter: Ratelimit.slidingWindow(120, "60 s"), prefix: "localley_venue_images_v2", timeout: 2000 });
            const ip = req.headers.get("x-vercel-forwarded-for")?.trim() || "";
            const result = await limiter.limit(isIP(ip) ? ip : "unknown");
            if (result.reason === "timeout") return unavailable(503);
            if (!result.success) return unavailable(429);
        } else {
            const limited = await developmentLimit(req);
            if (limited) return unavailable(limited.status);
        }
        const apiKey = getGooglePlacesApiKey();
        if (!apiKey) return unavailable(503);
        const width = normalizePhotoWidth(params.get("w"));
        const upstream = name
            ? new URL(`https://places.googleapis.com/v1/${name}/media`)
            : new URL("https://maps.googleapis.com/maps/api/place/photo");
        if (name) {
            upstream.searchParams.set("maxWidthPx", String(width));
            upstream.searchParams.set("skipHttpRedirect", "true");
        } else {
            upstream.searchParams.set("maxwidth", String(width));
            upstream.searchParams.set("photo_reference", ref!);
            // The shipped legacy API requires its key in the query string.
            upstream.searchParams.set("key", apiKey);
        }
        const response = await fetch(upstream.toString(), { cache: "no-store", redirect: "manual",
            signal: controller.signal, headers: name ? { "X-Goog-Api-Key": apiKey } : {} });
        let imageUrl: URL;
        if (name) {
            if (!response.ok) { await response.body?.cancel(); return unavailable(response.status === 404 ? 404 : 502); }
            const data = JSON.parse(new TextDecoder().decode(await readBounded(response, 256 * 1024)));
            if (typeof data?.photoUri !== "string") return unavailable();
            imageUrl = trustedImageUrl(data.photoUri);
        } else {
            await response.body?.cancel();
            if (![301, 302, 303, 307, 308].includes(response.status)) return unavailable();
            imageUrl = trustedImageUrl(response.headers.get("location") || "");
        }
        for (let redirects = ref ? 1 : 0; redirects <= 2; redirects++) {
            const image = await fetch(imageUrl.toString(), { cache: "no-store", redirect: "manual", signal: controller.signal });
            if ([301, 302, 303, 307, 308].includes(image.status)) {
                await image.body?.cancel();
                const location = image.headers.get("location");
                if (!location || redirects === 2) return unavailable();
                imageUrl = trustedImageUrl(new URL(location, imageUrl).toString());
                continue;
            }
            if (!image.ok) { await image.body?.cancel(); return unavailable(); }
            const bytes = await readBounded(image, 10 * 1024 * 1024);
            const contentType = imageType(bytes);
            if (!contentType) return unavailable();
            return new NextResponse(bytes, { headers: { ...noStore, "Content-Type": contentType } });
        }
        return unavailable();
    } catch {
        return unavailable(controller.signal.aborted ? 504 : 502);
    } finally {
        clearTimeout(timeout);
    }
}
