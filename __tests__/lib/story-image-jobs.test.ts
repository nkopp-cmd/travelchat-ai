// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reserveStoryImageJob, submitStoryImageJob, settleStoryImageJob, reconcileStoryImageJob } from "@/lib/story-image-jobs";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({ rpc }) }));
const token = "7cff21b4-ef92-4506-a4d5-e888c83196cd";
const input = { userId: "owner", key: "flux:hash", payloadHash: "a".repeat(64), provider: "flux" as const,
    credits: 1, limit: 50, outputPrefix: "https://localley.io/storage/story-backgrounds/v3/owner/hash/background." };

describe("Story image RPC contracts", () => {
    beforeEach(() => rpc.mockReset());
    it("passes the complete reservation identity", async () => {
        rpc.mockResolvedValue({ data: { state: "reserved", owner_token: token, output_url: null }, error: null });
        expect((await reserveStoryImageJob(input)).owner_token).toBe(token);
        expect(rpc).toHaveBeenCalledExactlyOnceWith("reserve_story_image_job", {
            p_user: input.userId, p_key: input.key, p_payload_hash: input.payloadHash, p_provider: "flux",
            p_credits: 1, p_limit: 50, p_output_prefix: input.outputPrefix,
        });
    });
    it.each([null, [], {}, { state: "reserved" }, { state: "reserved", owner_token: "bad", output_url: null },
        { state: "submitted", owner_token: token, output_url: null },
        { state: "succeeded", owner_token: null, output_url: null },
        { state: "failed", owner_token: null, output_url: "https://evil.test/x" },
        { state: "succeeded", owner_token: null, output_url: "https://evil.test/x" },
        { state: "reserved", owner_token: null, output_url: null, secret: token },
    ])("rejects malformed reservation %j", async data => {
        rpc.mockResolvedValue({ data, error: null });
        await expect(reserveStoryImageJob(input)).rejects.toThrow();
    });
    it.each(["reserved", "submitted", "failed", "limit", "succeeded"])("accepts token-free %s replay", async state => {
        rpc.mockResolvedValue({ data: { state, owner_token: null, output_url: state === "succeeded" ? `${input.outputPrefix}png` : null } });
        expect((await reserveStoryImageJob(input)).state).toBe(state);
    });
    const operations = [() => reserveStoryImageJob(input), () => submitStoryImageJob("owner", "key", token),
        () => settleStoryImageJob("owner", "key", token, null), () => reconcileStoryImageJob("owner", "key")];
    it.each(operations)("fails closed on RPC errors without fallback", async operation => {
        rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
        await expect(operation()).rejects.toThrow();
        expect(rpc).toHaveBeenCalledTimes(1);
    });
    it.each(operations)("rejects invalid response payloads", async operation => {
        rpc.mockResolvedValue({ data: { state: "unknown" } });
        await expect(operation()).rejects.toThrow();
    });
    it("validates each transition response", async () => {
        rpc.mockResolvedValueOnce({ data: { state: "submitted" } })
            .mockResolvedValueOnce({ data: { state: "failed" } })
            .mockResolvedValueOnce({ data: { state: "succeeded" } })
            .mockResolvedValueOnce({ data: { state: "reserved" } });
        await submitStoryImageJob("owner", "key", token);
        await settleStoryImageJob("owner", "key", token, null);
        await settleStoryImageJob("owner", "key", token, `${input.outputPrefix}jpg`);
        expect(await reconcileStoryImageJob("owner", "key")).toEqual({ state: "reserved" });
    });
});
