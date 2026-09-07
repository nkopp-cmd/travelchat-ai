import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase";
import { H3SubmissionRejectedError, H3VideoError, queryH3Video, submitH3Video } from "@/lib/minimax-video";
import { formatStoryVideoText } from "@/lib/story-video-overlay";
import { getUserTier } from "@/lib/usage-tracking";

export const STORY_VIDEO_MAX_CENTS = 2000;
export const storyVideoInput = z.object({ duration: z.number().int().min(4).max(6).default(4) }).strict();
export const storyVideoKey = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const storyVideoId = z.uuid();
const publicJob = z.object({
    jobId: z.uuid(),
    status: z.enum(["reserved", "submitting", "queued", "running", "provider_ready", "submission_unknown", "failed", "cancelled", "processing", "delivered", "processing_failed"]),
    statusUrl: z.string(),
    downloadUrl: z.string().optional(),
    errorCode: z.enum(["requires_review", "provider_failed", "provider_cancelled", "reservation_expired"]).nullable(),
}).strict();
type PublicJob = z.infer<typeof publicJob>;

export class StoryVideoError extends Error {
    constructor(public readonly code: "unavailable" | "conflict" | "limit" | "not_found" | "unsupported_story_text") {
        super(code);
    }
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
        const { data, error } = await createSupabaseAdmin().rpc(name, args);
        if (error) {
            const code = error.code === "23505" ? "conflict" : error.code === "P0003" ? "limit" :
                error.code === "P0002" ? "not_found" : "unavailable";
            throw new StoryVideoError(code);
        }
        return data;
    } catch (error) {
        if (error instanceof StoryVideoError) throw error;
        throw new StoryVideoError("unavailable");
    }
}

export async function getStoryVideoItinerary(userId: string, itineraryId: string) {
    const { data, error } = await createSupabaseAdmin().from("itineraries").select("*")
        .eq("id", itineraryId).eq("clerk_user_id", userId).maybeSingle();
    if (error) throw new StoryVideoError("unavailable");
    if (!data || data.clerk_user_id !== userId) throw new StoryVideoError("not_found");
    return data as Record<string, unknown>;
}

export function storyVideoSnapshot(itinerary: Record<string, unknown>) {
    const title = typeof itinerary.title === "string" ? itinerary.title.trim().slice(0, 200) : "";
    const city = typeof itinerary.city === "string" ? itinerary.city.trim().slice(0, 100) : "";
    return { title, caption: `${city ? `${city} - ` : ""}AI-generated travel scene` };
}

export function storyVideoPrompt(itinerary: Record<string, unknown>) {
    const text = (value: unknown, max: number) => typeof value === "string"
        ? value.trim().slice(0, max).replace(/https?:\/\/\S+/gi, "").replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
    return `Create a short cinematic travel scene. City: ${text(itinerary.city, 100)}. ` +
        `Trip: ${text(itinerary.title, 200)}. Vertical composition, natural motion, no text or logos.`;
}

export type StoryVideoEligibility = {
    canSubmit: boolean;
    reason: null | "premium_required" | "unavailable" | "unsupported_story_text" | "limit" | "processing_unavailable";
    eligibleDurations: number[];
    model: "MiniMax-H3";
    format: "mp4";
    ratio: "9:16";
};

export async function storyVideoReadiness(userId: string, itinerary: Record<string, unknown>): Promise<StoryVideoEligibility["reason"]> {
    if (await getUserTier(userId) !== "premium") return "premium_required";
    if (process.env.ENABLE_MINIMAX_H3 !== "true" || !process.env.MINIMAX_API_KEY?.trim()) return "unavailable";
    // Operator confirmation, not a worker heartbeat. Never infer delivery readiness from provider availability.
    if (process.env.ENABLE_STORY_VIDEO_PROCESSING !== "true" || process.env.STORY_VIDEO_DELIVERY_READY !== "true") {
        return "processing_unavailable";
    }
    try { formatStoryVideoText(storyVideoSnapshot(itinerary)); } catch { return "unsupported_story_text"; }
    await verifyStoryVideoBucket(createSupabaseAdmin());
    return null;
}

export async function getStoryVideoEligibility(userId: string, itineraryId: string, itinerary: Record<string, unknown>): Promise<StoryVideoEligibility> {
    let reason = await storyVideoReadiness(userId, itinerary);
    let eligibleDurations: number[] = [];
    if (!reason) {
        const budget = z.object({ eligibleDurations: z.array(z.number().int().min(4).max(6)).max(3) }).strict().parse(
            await rpc("get_story_video_eligibility", { p_user: userId, p_itinerary: itineraryId }));
        eligibleDurations = budget.eligibleDurations;
        if (!eligibleDurations.length) reason = "limit";
    }
    return { canSubmit: reason === null, reason, eligibleDurations, model: "MiniMax-H3", format: "mp4", ratio: "9:16" };
}

export function checkedStoryVideoJob(value: unknown, itineraryId: string, jobId?: string): PublicJob {
    const job = publicJob.parse(value);
    if ((jobId && job.jobId !== jobId) || job.statusUrl !== `/api/itineraries/${itineraryId}/story/video/${job.jobId}`) {
        throw new StoryVideoError("unavailable");
    }
    if (job.status === "delivered" ? job.downloadUrl !== `${job.statusUrl}/download` : job.downloadUrl !== undefined) {
        throw new StoryVideoError("unavailable");
    }
    return job;
}

const checkedJob = checkedStoryVideoJob;

export const STORY_VIDEO_BUCKET = "story-videos";
export const storyVideoArtifact = z.object({ jobId: z.uuid(), token: z.uuid(), outputKey: z.string() });

export function checkStoryVideoArtifact(value: unknown, jobId: string) {
    const artifact = storyVideoArtifact.parse(value);
    if (artifact.jobId !== jobId || artifact.outputKey !== `${jobId}/${artifact.token}.mp4`) {
        throw new StoryVideoError("unavailable");
    }
    return artifact;
}

export async function verifyStoryVideoBucket(admin: ReturnType<typeof createSupabaseAdmin>) {
    const { data, error } = await admin.storage.getBucket(STORY_VIDEO_BUCKET);
    if (error || !data || data.id !== STORY_VIDEO_BUCKET || data.public !== false) throw new StoryVideoError("unavailable");
}

export async function getStoryVideoDownload(userId: string, itineraryId: string, jobId: string) {
    const artifact = checkStoryVideoArtifact(await rpc("get_story_video_delivery", {
        p_user: userId, p_itinerary: itineraryId, p_job: jobId,
    }), jobId);
    const admin = createSupabaseAdmin();
    await verifyStoryVideoBucket(admin);
    const { data, error } = await admin.storage.from(STORY_VIDEO_BUCKET).createSignedUrl(artifact.outputKey, 60);
    if (error || !data) throw new StoryVideoError("unavailable");
    const url = new URL(data.signedUrl);
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (url.protocol !== "https:" || url.origin !== base.origin || url.username || url.password || url.hash ||
        url.pathname !== `/storage/v1/object/sign/${STORY_VIDEO_BUCKET}/${artifact.outputKey}` || !url.searchParams.get("token")) {
        throw new StoryVideoError("unavailable");
    }
    return url.toString();
}

export async function createStoryVideoJob(userId: string, itineraryId: string, key: string, duration: number,
    itinerary: Record<string, unknown>) {
    const prompt = storyVideoPrompt(itinerary);
    const snapshot = storyVideoSnapshot(itinerary);
    try { formatStoryVideoText(snapshot); } catch { throw new StoryVideoError("unsupported_story_text"); }
    const hash = createHash("sha256").update(JSON.stringify({ prompt, duration, model: "MiniMax-H3",
        resolution: "768P", ratio: "9:16", price: "v1", ...snapshot })).digest("hex");
    const reservation = z.object({ job: publicJob, ownerToken: z.uuid().nullable() }).strict().parse(
        await rpc("reserve_story_video_job", { p_user: userId, p_itinerary: itineraryId, p_key: key,
            p_payload_hash: hash, p_prompt: prompt, p_duration: duration,
            p_render_title: snapshot.title, p_render_caption: snapshot.caption }));
    let job = checkedJob(reservation.job, itineraryId);
    if (!reservation.ownerToken) return job;
    if (job.status !== "reserved") throw new StoryVideoError("unavailable");
    const args = { p_user: userId, p_itinerary: itineraryId, p_job: job.jobId, p_token: reservation.ownerToken };
    job = checkedJob(await rpc("advance_story_video_job", { ...args, p_action: "submit" }), itineraryId, job.jobId);
    if (job.status !== "submitting") throw new StoryVideoError("unavailable");
    // The submission fence is committed before any provider POST. Never retry this POST.
    let taskId: string;
    try {
        ({ taskId } = await submitH3Video({ prompt, duration }));
    } catch (error) {
        return checkedJob(await rpc("advance_story_video_job", { ...args,
            p_action: error instanceof H3SubmissionRejectedError ? "reject" : "unknown" }), itineraryId, job.jobId);
    }
    // An acknowledgement failure leaves 'submitting' and held funds. It must not cause another POST.
    return checkedJob(await rpc("advance_story_video_job", { ...args, p_action: "ack", p_task: taskId }), itineraryId, job.jobId);
}

export async function pollStoryVideoJob(userId: string, itineraryId: string, jobId: string) {
    const args = { p_user: userId, p_itinerary: itineraryId, p_job: jobId };
    const claim = z.object({ job: publicJob, pollFence: z.uuid().nullable(),
        taskId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).nullable(), duration: z.number().int().min(4).max(6) }).strict()
        .parse(await rpc("claim_story_video_poll", args));
    const job = checkedJob(claim.job, itineraryId, jobId);
    if (!claim.pollFence) return job;
    if (!claim.taskId || !["queued", "running"].includes(job.status)) throw new StoryVideoError("unavailable");
    let status: PublicJob["status"];
    let url: string | null = null;
    try {
        const task = await queryH3Video(claim.taskId);
        const mismatch = task.id !== claim.taskId || task.model !== "MiniMax-H3" ||
            (task.duration !== undefined && task.duration !== claim.duration) ||
            (task.resolution !== undefined && task.resolution !== "768P") ||
            (task.ratio !== undefined && task.ratio !== "9:16");
        const unverifiedSuccess = task.status === "succeeded" && (task.duration !== claim.duration ||
            task.resolution !== "768P" || task.ratio !== "9:16" || !task.url);
        status = mismatch || unverifiedSuccess ? "submission_unknown" : task.status === "succeeded" ? "provider_ready" : task.status;
        if (status === "provider_ready") url = task.url ?? null;
    } catch (error) {
        // Transport failures keep the job pollable, but malformed metadata requires operator review.
        if (!(error instanceof H3VideoError) || !["invalid_response", "response_too_large"].includes(error.code)) return job;
        status = "submission_unknown";
    }
    return checkedJob(await rpc("advance_story_video_job", { ...args, p_action: "poll", p_task: claim.taskId,
        p_fence: claim.pollFence, p_status: status, p_url: url }), itineraryId, jobId);
}

export function storyVideoFailure(error: unknown) {
    const code = error instanceof StoryVideoError ? error.code : "unavailable";
    const status = { unavailable: 503, conflict: 409, limit: 429, not_found: 404, unsupported_story_text: 422 }[code];
    return Response.json({ errorCode: code }, { status, headers: { "Cache-Control": "no-store" } });
}
