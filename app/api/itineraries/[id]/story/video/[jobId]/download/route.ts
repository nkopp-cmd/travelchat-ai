import { auth } from "@clerk/nextjs/server";
import { getStoryVideoDownload, getStoryVideoItinerary, storyVideoFailure, storyVideoId } from "@/lib/story-video-jobs";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
    const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
    try {
        const { userId } = await auth();
        if (!userId) return Response.json({ errorCode: "unauthorized" }, { status: 401, headers });
        const { id, jobId } = await params;
        if (!storyVideoId.safeParse(id).success || !storyVideoId.safeParse(jobId).success) {
            return Response.json({ errorCode: "invalid_input" }, { status: 400, headers });
        }
        await getStoryVideoItinerary(userId, id);
        return new Response(null, { status: 307, headers: { ...headers, Location: await getStoryVideoDownload(userId, id, jobId) } });
    } catch (error) {
        const response = storyVideoFailure(error);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        return response;
    }
}
