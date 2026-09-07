import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase";
import type { ImageProvider } from "@/lib/image-provider";

const state = z.enum(["reserved", "submitted", "succeeded", "failed"]);
const reservation = z.object({
    state: z.enum(["reserved", "submitted", "succeeded", "failed", "limit"]),
    owner_token: z.uuid().nullable(),
    output_url: z.string().nullable(),
}).strict().superRefine((value, ctx) => {
    if ((value.owner_token !== null && value.state !== "reserved") ||
        ((value.state === "succeeded") !== (value.output_url !== null))) {
        ctx.addIssue({ code: "custom", message: "Invalid reservation state" });
    }
});

export async function reserveStoryImageJob(input: {
    userId: string; key: string; payloadHash: string; provider: ImageProvider;
    credits: number; limit: number; outputPrefix: string;
}) {
    const { data, error } = await createSupabaseAdmin().rpc("reserve_story_image_job", {
        p_user: input.userId, p_key: input.key, p_payload_hash: input.payloadHash,
        p_provider: input.provider, p_credits: input.credits, p_limit: input.limit,
        p_output_prefix: input.outputPrefix,
    });
    if (error) throw new Error("Image reservation unavailable", { cause: error });
    const result = reservation.parse(data);
    if (result.output_url !== null && ![`${input.outputPrefix}png`, `${input.outputPrefix}jpg`].includes(result.output_url)) {
        throw new Error("Invalid reservation output");
    }
    return result;
}

export async function submitStoryImageJob(userId: string, key: string, token: string) {
    const { data, error } = await createSupabaseAdmin().rpc("submit_story_image_job", {
        p_user: userId, p_key: key, p_token: token,
    });
    if (error) throw new Error("Image submission unavailable", { cause: error });
    z.object({ state: z.literal("submitted") }).strict().parse(data);
}

export async function settleStoryImageJob(userId: string, key: string, token: string, outputUrl: string | null) {
    const { data, error } = await createSupabaseAdmin().rpc("settle_story_image_job", {
        p_user: userId, p_key: key, p_token: token, p_output_url: outputUrl,
    });
    if (error) throw new Error("Image settlement unavailable", { cause: error });
    z.object({ state: z.literal(outputUrl === null ? "failed" : "succeeded") }).strict().parse(data);
}

// Run separately for each expired reserved job. Submitted jobs require manual provider/storage review.
export async function reconcileStoryImageJob(userId: string, key: string) {
    const { data, error } = await createSupabaseAdmin().rpc("reconcile_story_image_job", { p_user: userId, p_key: key });
    if (error) throw new Error("Image reconciliation unavailable", { cause: error });
    return z.object({ state }).strict().parse(data);
}
