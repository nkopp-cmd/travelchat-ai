import { auth } from "@clerk/nextjs/server";
import { createStoryVideoJob, getStoryVideoItinerary, storyVideoFailure, storyVideoId,
    storyVideoInput, storyVideoKey, getStoryVideoEligibility, storyVideoReadiness } from "@/lib/story-video-jobs";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    try {
        const { userId } = await auth();
        if (!userId) return reply({ errorCode: "unauthorized" }, 401);
        const { id } = await params;
        if (!storyVideoId.safeParse(id).success) return reply({ errorCode: "invalid_input" }, 400);
        const itinerary = await getStoryVideoItinerary(userId, id);
        return reply(await getStoryVideoEligibility(userId, id, itinerary), 200);
    } catch (error) { return storyVideoFailure(error); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    try {
        const { userId } = await auth();
        if (!userId) return reply({ errorCode: "unauthorized" }, 401);
        const { id } = await params;
        const key = storyVideoKey.safeParse(req.headers.get("Idempotency-Key"));
        if (!storyVideoId.safeParse(id).success || !key.success) return reply({ errorCode: "invalid_input" }, 400);
        // The only client-controlled generation setting is duration. No media references are accepted.
        const reader = req.body?.getReader();
        if (!reader) return reply({ errorCode: "invalid_input" }, 400);
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > 1024) {
                    void reader.cancel().catch(() => undefined);
                    return reply({ errorCode: "invalid_input" }, 400);
                }
                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply({ errorCode: "invalid_input" }, 400); }
        const input = storyVideoInput.safeParse(body);
        if (!input.success) return reply({ errorCode: "invalid_input" }, 400);
        const itinerary = await getStoryVideoItinerary(userId, id);
        const reason = await storyVideoReadiness(userId, itinerary);
        if (reason) return reply({ errorCode: reason }, reason === "premium_required" ? 403 : reason === "unsupported_story_text" ? 422 : 503);
        const job = await createStoryVideoJob(userId, id, key.data, input.data.duration, itinerary);
        return reply(job, 202);
    } catch (error) {
        return storyVideoFailure(error);
    }
}
