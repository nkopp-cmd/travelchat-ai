import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase";
import { downloadStoryVideo, STORY_VIDEO_DOWNLOAD_MAX_BYTES } from "@/lib/story-video-download";
import { checkStoryVideoArtifact, checkedStoryVideoJob, STORY_VIDEO_BUCKET, StoryVideoError,
    storyVideoArtifact, storyVideoId, verifyStoryVideoBucket } from "@/lib/story-video-jobs";

export type StoryVideoEncoder = (input: Buffer, options: {
    title: string; caption: string; durationSeconds: number;
}) => Promise<Buffer>;

const claimSchema = storyVideoArtifact.extend({ userId: z.string().min(1), itineraryId: z.uuid(),
    attempt: z.number().int().min(1).max(3), duration: z.number().int().min(4).max(6),
    providerUrl: z.url(), title: z.string().trim().min(1).max(200), caption: z.string().min(1).max(160),
}).strict();

/** Node worker only. The injected encoder must probe/decode and bound its output. Never calls the provider API. */
export async function processStoryVideoJob(jobId: string, { allowedHosts, encode }: {
    allowedHosts: readonly string[]; encode: StoryVideoEncoder;
}): Promise<{ jobId: string; status: "not_claimed" | "delivered" }> {
    if (process.env.ENABLE_STORY_VIDEO_PROCESSING !== "true" || !storyVideoId.safeParse(jobId).success ||
        !Array.isArray(allowedHosts) || allowedHosts.length === 0 ||
        allowedHosts.some(host => typeof host !== "string" || !host.trim()) || typeof encode !== "function") {
        throw new StoryVideoError("unavailable");
    }
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc("claim_story_video_processing", { p_job: jobId });
    if (error) throw new StoryVideoError("unavailable");
    if (data === null) return { jobId, status: "not_claimed" };
    const claim = claimSchema.parse(data);
    checkStoryVideoArtifact(claim, jobId);
    let uploadStarted = false;
    try {
        await verifyStoryVideoBucket(admin);
        const { buffer } = await downloadStoryVideo(claim.providerUrl, allowedHosts);
        const output = await encode(buffer, { title: claim.title, caption: claim.caption, durationSeconds: claim.duration });
        if (!Buffer.isBuffer(output) || output.length === 0 || output.length > STORY_VIDEO_DOWNLOAD_MAX_BYTES) {
            throw new StoryVideoError("unavailable");
        }
        const hash = createHash("sha256").update(output).digest("hex");
        await verifyStoryVideoBucket(admin);
        const bucket = admin.storage.from(STORY_VIDEO_BUCKET);
        // Any upload acknowledgement can be lost. Leave that attempt leased, with no deletes or failure settlement.
        uploadStarted = true;
        const uploaded = await bucket.upload(claim.outputKey, output, { contentType: "video/mp4", upsert: false });
        if (uploaded.error) throw new StoryVideoError("unavailable");
        const stored = await bucket.download(claim.outputKey);
        if (stored.error || !stored.data || stored.data.size !== output.length || stored.data.size > STORY_VIDEO_DOWNLOAD_MAX_BYTES) {
            throw new StoryVideoError("unavailable");
        }
        const readback = Buffer.from(await stored.data.arrayBuffer());
        if (readback.length !== output.length || createHash("sha256").update(readback).digest("hex") !== hash) {
            throw new StoryVideoError("unavailable");
        }
        const settled = await admin.rpc("finish_story_video_processing", { p_job: jobId, p_token: claim.token,
            p_key: claim.outputKey, p_sha256: hash, p_bytes: output.length });
        if (settled.error || checkedStoryVideoJob(settled.data, claim.itineraryId, jobId).status !== "delivered") {
            throw new StoryVideoError("unavailable");
        }
        return { jobId, status: "delivered" };
    } catch {
        if (!uploadStarted) {
            try { await admin.rpc("fail_story_video_processing", { p_job: jobId, p_token: claim.token }); }
            catch { /* Lost settlement remains leased for recovery. */ }
        }
        throw new StoryVideoError("unavailable");
    }
}
