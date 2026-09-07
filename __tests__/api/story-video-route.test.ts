// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET as ELIGIBILITY } from "@/app/api/itineraries/[id]/story/video/route";
import { GET } from "@/app/api/itineraries/[id]/story/video/[jobId]/route";
import { H3AmbiguousSubmissionError, H3SubmissionRejectedError, H3VideoError } from "@/lib/minimax-video";

const m = vi.hoisted(() => ({ auth: vi.fn(), tier: vi.fn(), admin: vi.fn(), rpc: vi.fn(),
    from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), submit: vi.fn(), query: vi.fn(), bucket: vi.fn(), signed: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: m.tier }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: m.admin }));
vi.mock("@/lib/minimax-video", async importOriginal => ({
    ...await importOriginal<typeof import("@/lib/minimax-video")>(), submitH3Video: m.submit, queryH3Video: m.query,
}));

const id = "31e781e9-1ce8-4d01-b986-4e70154ff3d8";
const jobId = "51e781e9-1ce8-4d01-b986-4e70154ff3d8";
const token = "71e781e9-1ce8-4d01-b986-4e70154ff3d8";
const fence = "91e781e9-1ce8-4d01-b986-4e70154ff3d8";
const statusUrl = `/api/itineraries/${id}/story/video/${jobId}`;
const job = (status = "reserved", errorCode: string | null = null) => ({ jobId, status, statusUrl, errorCode });
const result = (data: unknown) => ({ data, error: null });
const request = (body: unknown = {}, key: string | null = "key") => new Request(`https://localley.io/api/itineraries/${id}/story/video`, {
    method: "POST", body: JSON.stringify(body), headers: key === null ? {} : { "Idempotency-Key": key },
});
const post = (body: unknown = {}, key: string | null = "key", path = id) => POST(request(body, key), { params: Promise.resolve({ id: path }) });
const eligibility = (path = id) => ELIGIBILITY(new Request(`https://localley.io/api/itineraries/${path}/story/video`), {
    params: Promise.resolve({ id: path }),
});
const eligible = (reason: string | null = null, eligibleDurations = reason ? [] : [4, 5, 6]) => ({
    canSubmit: reason === null, reason, eligibleDurations, model: "MiniMax-H3", format: "mp4", ratio: "9:16",
});
const get = (path = id, jobPath = jobId) => GET(new Request(`https://localley.io${statusUrl}`), {
    params: Promise.resolve({ id: path, jobId: jobPath }),
});
const claim = (status = "queued", claimed = true) => result({ job: job(status,
    ["submission_unknown", "submitting"].includes(status) ? "requires_review" : null),
    taskId: claimed ? "task-1" : null, pollFence: claimed ? fence : null, duration: 4 });

describe("durable story video authenticated API (offline)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("ENABLE_MINIMAX_H3", "true");
        vi.stubEnv("MINIMAX_API_KEY", "offline-fake-key");
        vi.stubEnv("ENABLE_STORY_VIDEO_PROCESSING", "true");
        vi.stubEnv("STORY_VIDEO_DELIVERY_READY", "true");
        vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network call"); }));
        m.auth.mockResolvedValue({ userId: "owner" });
        m.tier.mockResolvedValue("premium");
        const chain = { select: m.select, eq: m.eq, maybeSingle: m.single };
        m.admin.mockReturnValue({ from: m.from, rpc: m.rpc, storage: { getBucket: m.bucket, createSignedUrl: m.signed } });
        m.bucket.mockResolvedValue(result({ id: "story-videos", public: false }));
        m.from.mockReturnValue(chain);
        m.select.mockReturnValue(chain);
        m.eq.mockReturnValue(chain);
        m.single.mockResolvedValue(result({ id, clerk_user_id: "owner", city: "Seoul", title: "Quiet alleys" }));
        m.submit.mockResolvedValue({ taskId: "task-1" });
        m.query.mockResolvedValue({ id: "task-1", model: "MiniMax-H3", status: "running" });
        m.rpc.mockImplementation(async (name, args) => {
            if (name === "get_story_video_eligibility") return result({ eligibleDurations: [4, 5, 6] });
            if (name === "reserve_story_video_job") return result({ job: job(), ownerToken: token });
            if (name === "claim_story_video_poll") return claim();
            const status = { submit: "submitting", ack: "queued", unknown: "submission_unknown", reject: "failed", poll: args.p_status }[args.p_action as string];
            return result(job(status, status === "submission_unknown" ? "requires_review" : status === "failed" ? "provider_failed" : null));
        });
    });
    afterEach(() => {
        expect(fetch).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it.each(["post", "get"])("%s requires authentication before database access", async method => {
        m.auth.mockResolvedValue({ userId: null });
        const response = await (method === "post" ? post() : get());
        expect(response.status).toBe(401);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(m.admin).not.toHaveBeenCalled();
        expect(m.submit).not.toHaveBeenCalled();
    });

    it.each([
        { title: "Bad\u0001text", city: "Seoul" },
        { title: "Quiet alleys", city: "<b>Seoul</b>" },
        { title: "<script>bad</script>", city: "Seoul" },
        { title: "", city: "Seoul" },
    ])("rejects unsupported text before money reservation: %j", async text => {
        m.single.mockResolvedValue(result({ id, clerk_user_id: "owner", ...text }));
        const response = await post();
        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ errorCode: "unsupported_story_text" });
        expect(m.rpc).not.toHaveBeenCalled();
        expect(m.submit).not.toHaveBeenCalled();
    });

    it.each(["bad", "../../else", "00000000"])("rejects non-UUID itinerary %s", async path => {
        expect((await post({}, "key", path)).status).toBe(400);
        expect((await get(path)).status).toBe(400);
        expect(m.admin).not.toHaveBeenCalled();
    });
    it("rejects a non-UUID job path", async () => {
        expect((await get(id, "not-a-job")).status).toBe(400);
        expect(m.admin).not.toHaveBeenCalled();
    });
    it.each([null, "", "x".repeat(129), "has space", "../key"])("requires a bounded idempotency key: %s", async key => {
        expect((await post({}, key)).status).toBe(400);
        expect(m.rpc).not.toHaveBeenCalled();
    });
    it.each([null, [], { duration: 3 }, { duration: 7 }, { duration: 4.5 }, { duration: "4" },
        { duration: 4, userId: "other" }, { limit: 100 }, { cost: 1 }, { model: "other" },
        { mediaUrl: "https://private.example/source" }, { references: [] }, { prompt: "custom" }])("rejects unsupported input %j", async body => {
        expect((await post(body)).status).toBe(400);
        expect(m.admin).not.toHaveBeenCalled();
        expect(m.submit).not.toHaveBeenCalled();
    });
    it("rejects malformed or excessive bodies", async () => {
        for (const body of ["{", " ".repeat(1025)]) {
            const response = await POST(new Request("https://localley.io/api", { method: "POST", body,
                headers: { "Idempotency-Key": "key" } }), { params: Promise.resolve({ id }) });
            expect(response.status).toBe(400);
        }
        expect(m.admin).not.toHaveBeenCalled();
    });
    it("stops reading an oversized streamed body without a content-length header", async () => {
        const cancel = vi.fn();
        const stream = new ReadableStream({
            start(controller) { controller.enqueue(new Uint8Array(1025)); }, cancel,
        });
        const req = new Request("https://localley.io/api", { method: "POST", body: stream,
            duplex: "half", headers: { "Idempotency-Key": "key" } } as RequestInit);
        expect((await POST(req, { params: Promise.resolve({ id }) })).status).toBe(400);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(m.admin).not.toHaveBeenCalled();
    });
    it.each([null, { clerk_user_id: "other" }])("checks itinerary ownership for both routes", async data => {
        m.single.mockResolvedValue(result(data));
        expect((await post()).status).toBe(404);
        expect((await get()).status).toBe(404);
        expect(m.eq).toHaveBeenCalledWith("clerk_user_id", "owner");
        expect(m.select).toHaveBeenCalledWith("*");
        expect(m.rpc).not.toHaveBeenCalled();
        expect(m.query).not.toHaveBeenCalled();
    });
    it.each(["free", "pro"])("rejects %s without reserving", async tier => {
        m.tier.mockResolvedValue(tier);
        expect((await post()).status).toBe(403);
        expect(m.rpc).not.toHaveBeenCalled();
    });
    it.each([undefined, "false", "TRUE"])("keeps submission off unless flag is exactly true: %s", async flag => {
        vi.stubEnv("ENABLE_MINIMAX_H3", flag);
        expect((await post()).status).toBe(503);
        expect(m.rpc).not.toHaveBeenCalled();
    });
    it("does not reveal whether the key is absent", async () => {
        vi.stubEnv("MINIMAX_API_KEY", " ");
        const missing = await post();
        vi.stubEnv("MINIMAX_API_KEY", "offline-fake-key");
        vi.stubEnv("ENABLE_MINIMAX_H3", "false");
        const disabled = await post();
        expect(await missing.json()).toEqual(await disabled.json());
        expect(m.rpc).not.toHaveBeenCalled();
    });

    it.each([4, 5, 6])("reserves and commits submitting before provider POST at %i seconds", async duration => {
        const response = await post({ duration });
        expect(response.status).toBe(202);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await response.json()).toEqual(job("queued"));
        expect(m.rpc.mock.calls.map(c => c[1].p_action ?? "reserve")).toEqual(["reserve", "submit", "ack"]);
        expect(m.rpc.mock.invocationCallOrder[1]).toBeLessThan(m.submit.mock.invocationCallOrder[0]);
        expect(m.rpc.mock.invocationCallOrder[2]).toBeGreaterThan(m.submit.mock.invocationCallOrder[0]);
        expect(m.submit).toHaveBeenCalledExactlyOnceWith({ prompt: expect.stringContaining("Seoul"), duration });
        expect(m.rpc.mock.calls[0][1]).toMatchObject({ p_user: "owner", p_itinerary: id, p_duration: duration,
            p_payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
            p_render_title: "Quiet alleys", p_render_caption: "Seoul - AI-generated travel scene" });
        expect(m.rpc.mock.calls[0][1]).not.toHaveProperty("p_limit");
    });
    it("defaults to four seconds and bounds actual itinerary text without media URLs", async () => {
        m.single.mockResolvedValue(result({ clerk_user_id: "owner", city: "Seoul\nhttps://private.example/a",
            title: "t".repeat(5000), references: ["https://private.example/reference"] }));
        expect((await post()).status).toBe(202);
        const input = m.submit.mock.calls[0][0];
        expect(input.duration).toBe(4);
        expect(input.prompt.length).toBeLessThan(500);
        expect(input.prompt).not.toContain("https://");
        expect(Object.keys(input)).toEqual(["prompt", "duration"]);
    });
    it.each(["reserved", "submitting", "queued", "running", "provider_ready", "submission_unknown", "failed", "cancelled"])
        ("replays %s without submitting or returning a token", async status => {
            m.rpc.mockResolvedValueOnce(result({ job: job(status), ownerToken: null }));
            const response = await post();
            expect(await response.json()).toEqual(job(status));
            expect(m.rpc).toHaveBeenCalledTimes(1);
            expect(m.submit).not.toHaveBeenCalled();
        });
    it.each([["23505", 409, "conflict"], ["P0003", 429, "limit"], ["P0002", 404, "not_found"],
        ["PGRST202", 503, "unavailable"], ["42883", 503, "unavailable"]])("safely maps reserve failure %s", async (code, status, errorCode) => {
        m.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "secret database detail https://private.example" } });
        const response = await post();
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ errorCode });
        expect(m.submit).not.toHaveBeenCalled();
    });
    it("never submits after a missing submission RPC", async () => {
        m.rpc.mockResolvedValueOnce(result({ job: job(), ownerToken: token }))
            .mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
        expect((await post()).status).toBe(503);
        expect(m.submit).not.toHaveBeenCalled();
    });
    it.each([new H3AmbiguousSubmissionError("timeout"), new Error("https://private.example raw token"),
        new H3VideoError("invalid_response")])("marks ambiguous provider exceptions for review without retry", async error => {
        m.submit.mockRejectedValueOnce(error);
        const response = await post();
        expect(await response.json()).toEqual(job("submission_unknown", "requires_review"));
        expect(m.submit).toHaveBeenCalledTimes(1);
        expect(m.rpc.mock.calls.at(-1)?.[1].p_action).toBe("unknown");
    });
    it("records explicit provider rejection without a release action", async () => {
        m.submit.mockRejectedValueOnce(new H3SubmissionRejectedError(429));
        expect(await (await post()).json()).toEqual(job("failed", "provider_failed"));
        expect(m.rpc.mock.calls.at(-1)?.[1].p_action).toBe("reject");
        expect(m.submit).toHaveBeenCalledTimes(1);
    });
    it("does not resubmit or release after acknowledgement failure", async () => {
        m.rpc.mockResolvedValueOnce(result({ job: job(), ownerToken: token }))
            .mockResolvedValueOnce(result(job("submitting")))
            .mockRejectedValueOnce(new Error("database connection lost"));
        expect((await post()).status).toBe(503);
        expect(m.submit).toHaveBeenCalledTimes(1);
        expect(m.rpc).toHaveBeenCalledTimes(3);
        m.rpc.mockResolvedValueOnce(result({ job: job("submitting", "requires_review"), ownerToken: null }));
        expect(await (await post()).json()).toEqual(job("submitting", "requires_review"));
        expect(m.submit).toHaveBeenCalledTimes(1);
    });
    it("does not retry after unknown-state write fails", async () => {
        m.submit.mockRejectedValueOnce(new Error("uncertain"));
        m.rpc.mockResolvedValueOnce(result({ job: job(), ownerToken: token }))
            .mockResolvedValueOnce(result(job("submitting")))
            .mockRejectedValueOnce(new Error("database unavailable"));
        expect((await post()).status).toBe(503);
        expect(m.submit).toHaveBeenCalledTimes(1);
    });

    it("GET can poll with submissions off and without premium", async () => {
        vi.stubEnv("ENABLE_MINIMAX_H3", "false");
        vi.stubEnv("ENABLE_STORY_VIDEO_PROCESSING", "false");
        vi.stubEnv("STORY_VIDEO_DELIVERY_READY", "false");
        m.tier.mockResolvedValue("free");
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await response.json()).toEqual(job("running"));
        expect(m.query).toHaveBeenCalledExactlyOnceWith("task-1");
        expect(m.tier).not.toHaveBeenCalled();
        expect(m.rpc.mock.calls[1][1]).toMatchObject({ p_action: "poll", p_task: "task-1", p_fence: fence });
    });
    it("GET respects a denied ten-second poll claim", async () => {
        m.rpc.mockResolvedValueOnce(claim("running", false));
        expect(await (await get()).json()).toEqual(job("running"));
        expect(m.query).not.toHaveBeenCalled();
        expect(m.rpc).toHaveBeenCalledTimes(1);
    });
    it.each(["reserved", "submitting", "submission_unknown", "provider_ready", "failed", "cancelled"])
        ("GET never polls or resubmits terminal/unsubmitted %s", async status => {
            m.rpc.mockResolvedValueOnce(claim(status, false));
            const response = await get();
            const data = await response.json();
            expect(data.status).toBe(status);
            if (["submitting", "submission_unknown"].includes(status)) expect(data.errorCode).toBe("requires_review");
            expect(m.query).not.toHaveBeenCalled();
            expect(m.submit).not.toHaveBeenCalled();
        });
    it("GET SQL ownership failure does not query the provider", async () => {
        m.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002" } });
        expect((await get()).status).toBe(404);
        expect(m.query).not.toHaveBeenCalled();
    });
    it("GET missing migration fails closed", async () => {
        m.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "private details" } });
        const response = await get();
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ errorCode: "unavailable" });
        expect(m.query).not.toHaveBeenCalled();
    });
    it("stores successful metadata privately, never reports completed or delivered", async () => {
        m.query.mockResolvedValueOnce({ id: "task-1", model: "MiniMax-H3", duration: 4, resolution: "768P", ratio: "9:16",
            status: "succeeded", url: "https://private.example/video.mp4?secret=token" });
        const response = await get();
        expect(await response.json()).toEqual(job("provider_ready"));
        expect(m.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_status: "provider_ready", p_url: "https://private.example/video.mp4?secret=token" });
    });
    it.each([{ duration: 6 }, { model: "other" }, { resolution: "1080P" }, { ratio: "16:9" },
        { duration: undefined }, { resolution: undefined }, { ratio: undefined }, { url: undefined }, { id: "other-task" }])
        ("marks inconsistent success metadata for review: %j", async changed => {
            m.query.mockResolvedValueOnce({ id: "task-1", model: "MiniMax-H3", duration: 4, resolution: "768P", ratio: "9:16",
                status: "succeeded", url: "https://private.example/video.mp4", ...changed });
            expect(await (await get()).json()).toEqual(job("submission_unknown", "requires_review"));
            expect(m.rpc.mock.calls.at(-1)?.[1].p_url).toBeNull();
        });
    it.each([new H3VideoError("invalid_response"), new H3VideoError("response_too_large")])("marks malformed adapter results for review", async error => {
        m.query.mockRejectedValueOnce(error);
        expect(await (await get()).json()).toEqual(job("submission_unknown", "requires_review"));
    });
    it.each([new H3VideoError("timeout"), new H3VideoError("missing_key"), new Error("raw secret")])
        ("keeps transport failures pollable without exposing error details", async error => {
            m.query.mockRejectedValueOnce(error);
            expect(await (await get()).json()).toEqual(job("queued"));
            expect(m.rpc).toHaveBeenCalledTimes(1);
        });
    it("does not leak poll update errors or retry the provider", async () => {
        m.rpc.mockResolvedValueOnce(claim()).mockRejectedValueOnce(new Error("fence expired: https://private.example"));
        const response = await get();
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ errorCode: "unavailable" });
        expect(m.query).toHaveBeenCalledTimes(1);
    });
    it("eligibility requires authentication and current ownership", async () => {
        m.auth.mockResolvedValueOnce({ userId: null });
        const unauthorized = await eligibility();
        expect(unauthorized.status).toBe(401);
        expect(await unauthorized.json()).toEqual({ errorCode: "unauthorized" });
        expect(m.admin).not.toHaveBeenCalled();
        expect((await eligibility("bad")).status).toBe(400);
        for (const data of [null, { clerk_user_id: "other" }]) {
            m.single.mockResolvedValueOnce(result(data));
            expect((await eligibility()).status).toBe(404);
        }
        expect(m.rpc).not.toHaveBeenCalled();
    });
    it.each([[4, 5, 6], [4, 5], [4], []])("eligibility returns only database durations %j without side effects", async (...durations) => {
        m.rpc.mockResolvedValueOnce(result({ eligibleDurations: durations }));
        const response = await eligibility();
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await response.json()).toEqual(eligible(durations.length ? null : "limit", durations));
        expect(m.rpc).toHaveBeenCalledExactlyOnceWith("get_story_video_eligibility", { p_user: "owner", p_itinerary: id });
        expect(m.bucket).toHaveBeenCalledExactlyOnceWith("story-videos");
        expect(m.signed).not.toHaveBeenCalled();
        expect(m.submit).not.toHaveBeenCalled();
        expect(m.query).not.toHaveBeenCalled();
    });
    it.each(["free", "pro"])("eligibility explains %s tier denial", async tier => {
        m.tier.mockResolvedValue(tier);
        expect(await (await eligibility()).json()).toEqual(eligible("premium_required"));
        expect(m.rpc).not.toHaveBeenCalled();
    });
    it.each(["ENABLE_STORY_VIDEO_PROCESSING", "STORY_VIDEO_DELIVERY_READY"])("requires explicit %s operator confirmation", async name => {
        for (const value of [undefined, "false", "TRUE", ""]) {
            vi.stubEnv(name, value);
            expect(await (await eligibility()).json()).toEqual(eligible("processing_unavailable"));
            const response = await post();
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({ errorCode: "processing_unavailable" });
        }
        expect(m.rpc).not.toHaveBeenCalled();
        expect(m.submit).not.toHaveBeenCalled();
    });
    it("eligibility hides missing provider configuration and rejects unsupported text", async () => {
        vi.stubEnv("MINIMAX_API_KEY", " ");
        expect(await (await eligibility()).json()).toEqual(eligible("unavailable"));
        vi.stubEnv("MINIMAX_API_KEY", "fake");
        vi.stubEnv("ENABLE_MINIMAX_H3", "false");
        expect(await (await eligibility()).json()).toEqual(eligible("unavailable"));
        vi.stubEnv("ENABLE_MINIMAX_H3", "true");
        m.single.mockResolvedValue(result({ clerk_user_id: "owner", title: "<script>bad</script>", city: "Seoul" }));
        expect(await (await eligibility()).json()).toEqual(eligible("unsupported_story_text"));
        expect(m.rpc).not.toHaveBeenCalled();
    });
    it.each([null, { id: "story-videos", public: true }, { id: "other", public: false }])("fails closed on invalid private bucket %j", async data => {
        m.bucket.mockResolvedValue(result(data));
        for (const response of [await eligibility(), await post()]) {
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({ errorCode: "unavailable" });
        }
        expect(m.rpc).not.toHaveBeenCalled();
        expect(m.submit).not.toHaveBeenCalled();
    });
    it.each(["PGRST202", "42883", "42P01", "P0001", "P0002"])("eligibility safely handles readiness RPC failure %s", async code => {
        m.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "private budget details" } });
        const response = await eligibility();
        expect(response.status).toBe(code === "P0002" ? 404 : 503);
        expect(await response.json()).toEqual({ errorCode: code === "P0002" ? "not_found" : "unavailable" });
        expect(m.submit).not.toHaveBeenCalled();
    });
    it("includes the exact render snapshot in the hash even when sanitized prompts match", async () => {
        m.single.mockResolvedValueOnce(result({ clerk_user_id: "owner", title: " Quiet alleys ", city: "Seoul https://a.example" }));
        await post();
        const first = m.rpc.mock.calls[0][1];
        m.single.mockResolvedValueOnce(result({ clerk_user_id: "owner", title: "Quiet alleys", city: "Seoul https://b.example" }));
        await post();
        const second = m.rpc.mock.calls[3][1];
        expect(first.p_prompt).toBe(second.p_prompt);
        expect(first.p_payload_hash).not.toBe(second.p_payload_hash);
        expect(first.p_render_title).toBe("Quiet alleys");
        expect(first.p_render_caption).toBe("Seoul https://a.example - AI-generated travel scene");
    });
    it("accepts Korean through the shared formatter for eligibility and the reserved snapshot", async () => {
        m.single.mockResolvedValue(result({ clerk_user_id: "owner", title: " \uC11C\uC6B8 \uACE8\uBAA9 ", city: " \uC11C\uC6B8 " }));
        expect(await (await eligibility()).json()).toEqual(eligible());
        expect((await post()).status).toBe(202);
        expect(m.rpc).toHaveBeenCalledWith("reserve_story_video_job", expect.objectContaining({
            p_render_title: "\uC11C\uC6B8 \uACE8\uBAA9", p_render_caption: "\uC11C\uC6B8 - AI-generated travel scene",
        }));
    });
    it("returns conflict without calling the provider when SQL rejects changed preflight text", async () => {
        m.rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "Owned story text changed" } });
        const response = await post();
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ errorCode: "conflict" });
        expect(m.submit).not.toHaveBeenCalled();
        expect(m.rpc).toHaveBeenCalledTimes(1);
    });
    it("rejects unexpected public response fields and unsafe status URLs", async () => {
        for (const data of [{ ...job(), private_provider_url: "https://private.example" },
            { ...job(), statusUrl: "https://private.example" }, { ...job(), status: "delivered" }]) {
            m.rpc.mockResolvedValueOnce(result({ job: data, ownerToken: null }));
            const response = await post();
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({ errorCode: "unavailable" });
        }
        expect(m.submit).not.toHaveBeenCalled();
    });
});
