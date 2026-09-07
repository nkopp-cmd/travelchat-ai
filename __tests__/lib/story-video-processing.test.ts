// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { processStoryVideoJob } from "@/lib/story-video-processing";

const m = vi.hoisted(() => ({ rpc: vi.fn(), bucket: vi.fn(), upload: vi.fn(), read: vi.fn(), download: vi.fn(), encode: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/minimax-video", () => ({ submitH3Video: m.provider, queryH3Video: m.provider }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({ rpc: m.rpc,
    storage: { getBucket: m.bucket, from: () => ({ upload: m.upload, download: m.read }) } }) }));
vi.mock("@/lib/story-video-download", () => ({ downloadStoryVideo: m.download, STORY_VIDEO_DOWNLOAD_MAX_BYTES: 33554432 }));
const jobId = "51e781e9-1ce8-4d01-b986-4e70154ff3d8";
const itineraryId = "31e781e9-1ce8-4d01-b986-4e70154ff3d8";
const token = "71e781e9-1ce8-4d01-b986-4e70154ff3d8";
const outputKey = `${jobId}/${token}.mp4`;
const claim = { jobId, itineraryId, userId: "owner", token, outputKey, attempt: 1, duration: 4,
    providerUrl: "https://provider.example/stored.mp4", title: "Seoul trip", caption: "Seoul - AI-generated travel scene" };
const statusUrl = `/api/itineraries/${itineraryId}/story/video/${jobId}`;
const output = Buffer.from("encoded video");
const run = () => processStoryVideoJob(jobId, { allowedHosts: ["provider.example"], encode: m.encode });
describe("offline local render processing", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("ENABLE_STORY_VIDEO_PROCESSING", "true");
        vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network"); }));
        m.rpc.mockImplementation(async name => ({ error: null, data: name === "claim_story_video_processing" ? claim :
            { jobId, status: "delivered", statusUrl, downloadUrl: `${statusUrl}/download`, errorCode: null } }));
        m.bucket.mockResolvedValue({ data: { id: "story-videos", public: false }, error: null });
        m.download.mockResolvedValue({ buffer: Buffer.from("source") });
        m.encode.mockResolvedValue(output);
        m.upload.mockResolvedValue({ error: null });
        m.read.mockResolvedValue({ data: new Blob([output]), error: null });
    });
    afterEach(() => { expect(m.provider).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
    it("reads stored source, injects caption not prompt, writes once, verifies bytes before finish", async () => {
        expect(await run()).toEqual({ jobId, status: "delivered" });
        expect(m.download).toHaveBeenCalledWith(claim.providerUrl, ["provider.example"]);
        expect(m.encode).toHaveBeenCalledWith(Buffer.from("source"), { title: claim.title, caption: claim.caption, durationSeconds: 4 });
        expect(m.upload).toHaveBeenCalledWith(outputKey, output, { contentType: "video/mp4", upsert: false });
        expect(m.rpc).toHaveBeenLastCalledWith("finish_story_video_processing", { p_job: jobId, p_token: token,
            p_key: outputKey, p_sha256: expect.stringMatching(/^[a-f0-9]{64}$/), p_bytes: output.length });
        expect(m.read.mock.invocationCallOrder[0]).toBeLessThan(m.rpc.mock.invocationCallOrder[1]);
    });
    it.each([undefined, "false", "TRUE"])("requires exact runtime gate %s", async flag => {
        vi.stubEnv("ENABLE_STORY_VIDEO_PROCESSING", flag);
        await expect(run()).rejects.toThrow("unavailable"); expect(m.rpc).not.toHaveBeenCalled();
    });
    it("does nothing without a claim", async () => {
        m.rpc.mockResolvedValueOnce({ data: null, error: null });
        expect(await run()).toEqual({ jobId, status: "not_claimed" }); expect(m.download).not.toHaveBeenCalled();
    });
    it.each([{ allowedHosts: [] }, { allowedHosts: [""] }, { allowedHosts: ["  "] }])(
        "rejects empty host configuration before claiming: %j", async ({ allowedHosts }) => {
        await expect(processStoryVideoJob(jobId, { allowedHosts, encode: m.encode })).rejects.toThrow("unavailable");
        expect(m.rpc).not.toHaveBeenCalled(); expect(m.download).not.toHaveBeenCalled();
    });
    it.each([undefined, null, "encode"])("rejects a nonfunction encoder before claiming: %s", async encode => {
        await expect(processStoryVideoJob(jobId, { allowedHosts: ["provider.example"],
            encode: encode as unknown as Parameters<typeof processStoryVideoJob>[1]["encode"],
        })).rejects.toThrow("unavailable");
        expect(m.rpc).not.toHaveBeenCalled(); expect(m.download).not.toHaveBeenCalled();
    });
    it("rejects a nonprivate bucket before download or write", async () => {
        m.bucket.mockResolvedValue({ data: { id: "story-videos", public: true }, error: null });
        await expect(run()).rejects.toThrow("unavailable");
        expect(m.download).not.toHaveBeenCalled(); expect(m.upload).not.toHaveBeenCalled();
    });
    it("download failure consumes only the local attempt, without encoding", async () => {
        m.download.mockRejectedValue(new Error("private URL"));
        await expect(run()).rejects.toThrow("unavailable"); expect(m.encode).not.toHaveBeenCalled();
        expect(m.rpc).toHaveBeenLastCalledWith("fail_story_video_processing", { p_job: jobId, p_token: token });
    });
    it("decode failure records a local failure", async () => {
        m.encode.mockRejectedValue(new Error("decode failed"));
        await expect(run()).rejects.toThrow("unavailable"); expect(m.upload).not.toHaveBeenCalled();
        expect(m.rpc).toHaveBeenLastCalledWith("fail_story_video_processing", { p_job: jobId, p_token: token });
    });
    it.each([Buffer.alloc(0), Buffer.alloc(33554433)])("bounds encoded bytes", async buffer => {
        m.encode.mockResolvedValue(buffer); await expect(run()).rejects.toThrow("unavailable"); expect(m.upload).not.toHaveBeenCalled();
    });
    it.each(["upload", "read", "hash", "fence"])("leaves uncertain uploaded attempts leased: %s", async failure => {
        if (failure === "upload") m.upload.mockResolvedValue({ error: { message: "lost acknowledgement" } });
        if (failure === "read") m.read.mockResolvedValue({ error: {}, data: null });
        if (failure === "hash") m.read.mockResolvedValue({ error: null, data: new Blob([Buffer.alloc(output.length)]) });
        if (failure === "fence") m.rpc.mockImplementation(async name => name === "claim_story_video_processing" ?
            { data: claim, error: null } : { data: null, error: { message: "old worker fence" } });
        await expect(run()).rejects.toThrow("unavailable");
        expect(m.rpc.mock.calls.map(c => c[0])).not.toContain("fail_story_video_processing");
        if (failure !== "fence") expect(m.rpc.mock.calls.map(c => c[0])).not.toContain("finish_story_video_processing");
    });
    it("retry uses the same stored provider URL and a new fixed key", async () => {
        const nextToken = "91e781e9-1ce8-4d01-b986-4e70154ff3d8";
        m.rpc.mockResolvedValueOnce({ data: { ...claim, attempt: 2, token: nextToken, outputKey: `${jobId}/${nextToken}.mp4` }, error: null });
        await run(); expect(m.download).toHaveBeenCalledWith(claim.providerUrl, ["provider.example"]);
        expect(m.upload.mock.calls[0][0]).toBe(`${jobId}/${nextToken}.mp4`);
    });
    it.each([{ jobId: itineraryId }, { outputKey: "../other.mp4" }])("rejects mismatched claim %j", async changed => {
        m.rpc.mockResolvedValueOnce({ data: { ...claim, ...changed }, error: null });
        await expect(run()).rejects.toThrow(); expect(m.download).not.toHaveBeenCalled();
    });
});
