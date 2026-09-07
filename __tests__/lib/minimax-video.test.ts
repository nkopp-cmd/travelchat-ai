// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
    estimateH3OutputCents, H3AmbiguousSubmissionError, H3SubmissionRejectedError,
    H3VideoError, MINIMAX_H3_MODEL, MINIMAX_H3_SETTINGS_REVISION,
    MINIMAX_H3_MAX_RESPONSE_BYTES, MINIMAX_H3_TIMEOUT_MS, queryH3Video, submitH3Video,
} from "@/lib/minimax-video";

const fetchMock = vi.fn<typeof fetch>();
const id = "424010985738629";
const prompt = "A quiet Seoul street";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const task = (overrides: Record<string, unknown> = {}) => ({
    task: { id, model: MINIMAX_H3_MODEL, status: "queued", ...overrides },
});

beforeEach(() => {
    vi.stubEnv("ENABLE_MINIMAX_H3", "true");
    vi.stubEnv("MINIMAX_API_KEY", "test-secret");
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

describe("H3 submission", () => {
    it.each([undefined, 4, 5, 6])("sends one fixed T2V request for duration %s", async (duration) => {
        fetchMock.mockResolvedValue(json({ task_id: id }));
        await expect(submitH3Video({ prompt, duration })).resolves.toEqual({ taskId: id });
        expect(MINIMAX_H3_SETTINGS_REVISION).toBe("shortstory-t2v-768p-9x16-v1");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.minimax.io/v2/video_generation");
        expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store",
            headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" } });
        expect(JSON.parse(init!.body as string)).toEqual({ model: "MiniMax-H3",
            content: [{ type: "text", text: prompt }], duration: duration ?? 4, resolution: "768P", ratio: "9:16" });
    });

    it.each([undefined, "false", "TRUE", "1", " true ", ""])("blocks flag %s", async (flag) => {
        vi.stubEnv("ENABLE_MINIMAX_H3", flag);
        await expect(submitH3Video({ prompt })).rejects.toMatchObject({ code: "disabled" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([undefined, "", "   "])("requires a key for both operations: %s", async (key) => {
        vi.stubEnv("MINIMAX_API_KEY", key);
        await expect(submitH3Video({ prompt })).rejects.toMatchObject({ code: "missing_key" });
        await expect(queryH3Video(id)).rejects.toMatchObject({ code: "missing_key" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([0, 3, 7, 4.5, NaN, Infinity, "4", null])("rejects duration %s", async (duration) => {
        await expect(submitH3Video({ prompt, duration: duration as number })).rejects.toMatchObject({ code: "invalid_input" });
        expect(() => estimateH3OutputCents(duration as number)).toThrow(H3VideoError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(["", " \n ", "a".repeat(7001), null])("rejects bad prompts", async (value) => {
        await expect(submitH3Video({ prompt: value as string })).rejects.toMatchObject({ code: "invalid_input" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects reference inputs and estimates output only", async () => {
        await expect(submitH3Video({ prompt, image: "https://example.com/x" } as never)).rejects.toMatchObject({ code: "invalid_input" });
        expect([4, 5, 6].map(estimateH3OutputCents)).toEqual([32, 40, 48]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([400, 401, 402, 422, 429])("rejects HTTP %s without retries or raw errors", async (status) => {
        fetchMock.mockResolvedValue(json({ error: { message: `test-secret ${prompt}` } }, status));
        const error = await submitH3Video({ prompt }).catch((error: unknown) => error);
        expect(error).toBeInstanceOf(H3SubmissionRejectedError);
        expect(error).toMatchObject({ httpStatus: status });
        expect(String(error)).not.toContain("test-secret");
        expect(String(error)).not.toContain(prompt);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([500, 503, 529])("marks HTTP %s ambiguous", async (status) => {
        fetchMock.mockResolvedValue(json({}, status));
        await expect(submitH3Video({ prompt })).rejects.toBeInstanceOf(H3AmbiguousSubmissionError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("sanitizes network errors without retrying", async () => {
        fetchMock.mockRejectedValue(new Error(`test-secret ${prompt}`));
        await expect(submitH3Video({ prompt })).rejects.toMatchObject({
            name: "H3AmbiguousSubmissionError", code: "transport_error", message: "MiniMax H3: transport_error.",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([{}, null, [], { task_id: 123 }, { task_id: "" }, { task_id: "../x" }, { task_id: "a".repeat(129) }])(
        "marks malformed submission metadata ambiguous", async (body) => {
            fetchMock.mockResolvedValue(json(body));
            await expect(submitH3Video({ prompt })).rejects.toBeInstanceOf(H3AmbiguousSubmissionError);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        },
    );
});

describe("H3 query", () => {
    it.each(["queued", "running", "succeeded", "failed", "cancelled"])("returns exact status %s with submission disabled", async (status) => {
        vi.stubEnv("ENABLE_MINIMAX_H3", "false");
        fetchMock.mockResolvedValue(json(task({ status, content: { url: "https://cdn.example.com/video.mp4" },
            error: { code: "1026", message: prompt }, usage: { output_seconds: 4, secret: prompt } })));
        const result = await queryH3Video(id);
        expect(result).toEqual({ id, model: MINIMAX_H3_MODEL, status, usage: { output_seconds: 4 },
            ...(status === "succeeded" ? { url: "https://cdn.example.com/video.mp4" } : {}) });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`https://api.minimax.io/v2/query/video_generation/${id}`,
            expect.objectContaining({ method: "GET", redirect: "error", cache: "no-store" }));
        expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
    });

    it.each(["", "../x", "a/b", "a?x", "a".repeat(129)])("blocks bad ID %s", async (value) => {
        await expect(queryH3Video(value)).rejects.toMatchObject({ code: "invalid_input" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([{ id: "other" }, { model: "MiniMax-H3-Max" }, { status: "Success" }, { status: "unknown" },
        { status: null }, { usage: { output_seconds: -1 } }, { modality: "text" }, { task_type: "h3_context_ir" }])(
        "rejects mismatched or malformed task metadata", async (overrides) => {
            fetchMock.mockResolvedValue(json(task(overrides)));
            await expect(queryH3Video(id)).rejects.toMatchObject({ code: "invalid_response" });
        },
    );

    it.each([undefined, "", "not a URL", "http://cdn.example.com/x", "https://user:pass@example.com/x",
        "https://localhost/x", "https://foo.localhost./x", "https://internal/x", "https://foo.local/x",
        "https://127.0.0.1/x", "https://10.0.0.1/x", "https://172.16.0.1/x", "https://192.168.0.1/x",
        "https://169.254.169.254/x", "https://2130706433/x", "https://0x7f000001/x",
        "https://[::1]/x", "https://[fc00::1]/x", "https://[::ffff:127.0.0.1]/x", "file:///x"])(
        "rejects unsafe or missing output URL %s", async (url) => {
            fetchMock.mockResolvedValue(json(task({ status: "succeeded", content: { url } })));
            await expect(queryH3Video(id)).rejects.toMatchObject({ code: "invalid_response" });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        },
    );
});

describe.each(["submit", "query"] as const)("%s response bounds", (operation) => {
    const run = () => operation === "submit" ? submitH3Video({ prompt }) : queryH3Video(id);
    it.each(["not-json", "", "null", "[]"])("rejects malformed body %s", async (body) => {
        fetchMock.mockResolvedValue(new Response(body));
        await expect(run()).rejects.toMatchObject({ code: "invalid_response" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([true, false])("bounds response size with content-length %s", async (advertised) => {
        const cancel = vi.fn();
        const stream = new ReadableStream<Uint8Array>({ start(controller) {
            controller.enqueue(new Uint8Array(MINIMAX_H3_MAX_RESPONSE_BYTES));
            controller.enqueue(new Uint8Array(1));
        }, cancel });
        fetchMock.mockResolvedValue(new Response(stream, { headers: advertised ? {
            "content-length": String(MINIMAX_H3_MAX_RESPONSE_BYTES + 1),
        } : {} }));
        await expect(run()).rejects.toMatchObject({ code: "response_too_large" });
        expect(cancel).toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each(["headers", "body"])("times out stalled %s without retries", async (stage) => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        if (stage === "headers") fetchMock.mockImplementation(() => new Promise(() => {}));
        else fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel })));
        const pending = expect(run()).rejects.toMatchObject({ code: "timeout",
            name: operation === "submit" ? "H3AmbiguousSubmissionError" : "H3VideoError" });
        await vi.advanceTimersByTimeAsync(MINIMAX_H3_TIMEOUT_MS);
        await pending;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
        if (stage === "body") expect(cancel).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
