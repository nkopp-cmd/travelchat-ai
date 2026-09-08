// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/itineraries/[id]/story/video/[jobId]/download/route";
import { pollStoryVideoJob } from "@/lib/story-video-jobs";
const m = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), single: vi.fn(), bucket: vi.fn(), sign: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/minimax-video", () => ({ queryH3Video: m.provider, submitH3Video: m.provider }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: m.single };
    return { from: () => chain, rpc: m.rpc, storage: { getBucket: m.bucket, from: () => ({ createSignedUrl: m.sign }) } };
} }));
const id = "31e781e9-1ce8-4d01-b986-4e70154ff3d8";
const jobId = "51e781e9-1ce8-4d01-b986-4e70154ff3d8";
const token = "71e781e9-1ce8-4d01-b986-4e70154ff3d8";
const outputKey = `${jobId}/${token}.mp4`;
const statusUrl = `/api/itineraries/${id}/story/video/${jobId}`;
const signedUrl = `https://project.supabase.co/storage/v1/object/sign/story-videos/${outputKey}?token=private`;
const get = () => GET(new Request("https://localley.io/download"), { params: Promise.resolve({ id, jobId }) });
describe("owner-only private video delivery", () => {
    beforeEach(() => {
        vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
        m.auth.mockResolvedValue({ userId: "owner" }); m.single.mockResolvedValue({ data: { clerk_user_id: "owner" }, error: null });
        m.rpc.mockResolvedValue({ data: { jobId, token, outputKey }, error: null });
        m.bucket.mockResolvedValue({ data: { id: "story-videos", public: false }, error: null });
        m.sign.mockResolvedValue({ data: { signedUrl }, error: null });
    });
    afterEach(() => { expect(m.provider).not.toHaveBeenCalled(); vi.unstubAllEnvs(); });
    it("redirects without proxying bytes and signs for only 60 seconds", async () => {
        const response = await get(); expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(signedUrl);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        expect(await response.text()).toBe("");
        expect(m.rpc).toHaveBeenCalledWith("get_story_video_delivery", { p_user: "owner", p_itinerary: id, p_job: jobId });
        expect(m.sign).toHaveBeenCalledWith(outputKey, 60);
    });
    it("requires authentication", async () => {
        m.auth.mockResolvedValue({ userId: null }); expect((await get()).status).toBe(401); expect(m.rpc).not.toHaveBeenCalled();
    });
    it.each([null, { clerk_user_id: "other" }])("requires current owned itinerary %j", async data => {
        m.single.mockResolvedValue({ data, error: null }); expect((await get()).status).toBe(404); expect(m.sign).not.toHaveBeenCalled();
    });
    it("rejects SQL cross-owner or undelivered job", async () => {
        m.rpc.mockResolvedValue({ data: null, error: { code: "P0002" } });
        expect((await get()).status).toBe(404); expect(m.sign).not.toHaveBeenCalled();
    });
    it("refuses a public bucket before signing", async () => {
        m.bucket.mockResolvedValue({ data: { id: "story-videos", public: true }, error: null });
        expect((await get()).status).toBe(503); expect(m.sign).not.toHaveBeenCalled();
    });
    it.each(["../other.mp4", `${id}/${token}.mp4`, "https://provider.example/video"])("refuses arbitrary key %s", async key => {
        m.rpc.mockResolvedValue({ data: { jobId, token, outputKey: key }, error: null });
        expect((await get()).status).toBe(503); expect(m.sign).not.toHaveBeenCalled();
    });
    it.each(["https://evil.example/video?token=x", `https://project.supabase.co/storage/v1/object/public/story-videos/${outputKey}`,
        `https://project.supabase.co/storage/v1/object/sign/story-videos/${id}/${token}.mp4?token=x`])("refuses unsafe signed response %s", async url => {
        m.sign.mockResolvedValue({ data: { signedUrl: url }, error: null }); expect((await get()).status).toBe(503);
    });
    it.each(["processing", "processing_failed", "delivered"])("public status exposes only application download route: %s", async status => {
        const job = { jobId, status, statusUrl, errorCode: null, ...(status === "delivered" ? { downloadUrl: `${statusUrl}/download` } : {}) };
        m.rpc.mockResolvedValue({ data: { job, pollFence: null, taskId: null, duration: 4 }, error: null });
        expect(await pollStoryVideoJob("owner", id, jobId)).toEqual(job); expect(m.sign).not.toHaveBeenCalled();
    });
});
