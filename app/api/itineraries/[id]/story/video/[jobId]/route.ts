import { auth } from "@clerk/nextjs/server";
import { getStoryVideoItinerary, pollStoryVideoJob, storyVideoFailure, storyVideoId } from "@/lib/story-video-jobs";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
    const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    try {
        const { userId } = await auth();
        if (!userId) return reply({ errorCode: "unauthorized" }, 401);
        const { id, jobId } = await params;
        if (!storyVideoId.safeParse(id).success || !storyVideoId.safeParse(jobId).success) {
            return reply({ errorCode: "invalid_input" }, 400);
        }
        await getStoryVideoItinerary(userId, id);
        // Polling stays available after disabling submissions or changing subscription tier.
        return reply(await pollStoryVideoJob(userId, id, jobId), 200);
    } catch (error) {
        return storyVideoFailure(error);
    }
}
