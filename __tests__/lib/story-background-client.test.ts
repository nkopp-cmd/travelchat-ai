import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestStoryBackground, StoryBackgroundPendingError } from "@/lib/story-background-client";

describe("requestStoryBackground", () => {
    const body = JSON.stringify({ cacheKey: "trip-cover", excludeUrls: [], slotIndex: 0 });
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        vi.useFakeTimers();
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });
    const pending = () => new Response(JSON.stringify({ success: false, pending: true }), { status: 202 });

    it("polls pending to success with the identical serialized POST body", async () => {
        fetchMock.mockResolvedValueOnce(pending()).mockResolvedValueOnce(pending())
            .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, image: "https://example.com/image.png", source: "ai" })));
        const result = requestStoryBackground(body, new AbortController().signal);
        await vi.advanceTimersByTimeAsync(8_000);
        await expect(result).resolves.toMatchObject({ image: "https://example.com/image.png" });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        for (const [url, options] of fetchMock.mock.calls) {
            expect(url).toBe("/api/images/story-background");
            expect(options).toMatchObject({ method: "POST", body });
        }
        await vi.advanceTimersByTimeAsync(100_000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("stops at 90 seconds without submitting at or after the deadline", async () => {
        fetchMock.mockImplementation(pending);
        const result = requestStoryBackground(body, new AbortController().signal);
        const assertion = expect(result).rejects.toBeInstanceOf(StoryBackgroundPendingError);
        await vi.advanceTimersByTimeAsync(90_000);
        await assertion;
        expect(fetchMock).toHaveBeenCalledTimes(23);
        await vi.advanceTimersByTimeAsync(100_000);
        expect(fetchMock).toHaveBeenCalledTimes(23);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("bounds a stalled request and aborts its fetch", async () => {
        fetchMock.mockReturnValue(new Promise(() => {}));
        const result = requestStoryBackground(body, new AbortController().signal);
        const assertion = expect(result).rejects.toBeInstanceOf(StoryBackgroundPendingError);
        await vi.advanceTimersByTimeAsync(90_000);
        await assertion;
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not claim completion or retry when a pending job loses its connection", async () => {
        fetchMock.mockResolvedValueOnce(pending()).mockRejectedValueOnce(new Error("private error"));
        const result = requestStoryBackground(body, new AbortController().signal);
        const assertion = expect(result).rejects.toBeInstanceOf(StoryBackgroundPendingError);
        await vi.advanceTimersByTimeAsync(4_000);
        await assertion;
        await vi.advanceTimersByTimeAsync(100_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("uses fallback without retry permission for an unstructured failure", async () => {
        fetchMock.mockResolvedValueOnce(pending()).mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
        const result = requestStoryBackground(body, new AbortController().signal);
        await vi.advanceTimersByTimeAsync(4_000);
        await expect(result).resolves.toBeUndefined();
        await vi.advanceTimersByTimeAsync(100_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("reports confirmed terminal failure after polling without changing the body", async () => {
        fetchMock.mockResolvedValueOnce(pending()).mockResolvedValueOnce(new Response(JSON.stringify({ success: false, state: "failed" })));
        const result = requestStoryBackground(body, new AbortController().signal);
        await vi.advanceTimersByTimeAsync(4_000);
        await expect(result).resolves.toEqual({ state: "failed" });
        await vi.advanceTimersByTimeAsync(100_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.map(([, options]) => options.body)).toEqual([body, body]);
    });

    it.each([500, 503])("does not grant retry permission for HTTP %s even with a failed field", async status => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, state: "failed" }), { status }));
        await expect(requestStoryBackground(body, new AbortController().signal)).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not treat a pending response as terminal even with a failed field", async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, state: "failed", pending: true }), { status: 202 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, image: "image.png", source: "ai" })));
        const result = requestStoryBackground(body, new AbortController().signal);
        await vi.advanceTimersByTimeAsync(4_000);
        await expect(result).resolves.toMatchObject({ image: "image.png" });
    });

    it.each(["http", "network", "terminal", "json"])("does not retry %s errors", async kind => {
        if (kind === "network") fetchMock.mockRejectedValue(new Error("private provider error"));
        else fetchMock.mockResolvedValue(kind === "http" ? new Response("error", { status: 500 })
            : kind === "json" ? new Response("invalid")
                : new Response(JSON.stringify({ success: false, error: "private provider error" })));
        await expect(requestStoryBackground(body, new AbortController().signal)).resolves.toBeUndefined();
        await vi.advanceTimersByTimeAsync(100_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each(["before", "waiting", "fetching"])("aborts %s without future calls", async stage => {
        const controller = new AbortController();
        fetchMock.mockImplementation(stage === "fetching" ? () => new Promise(() => {}) : pending);
        if (stage === "before") controller.abort();
        const result = requestStoryBackground(body, controller.signal);
        const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        await assertion;
        await vi.advanceTimersByTimeAsync(100_000);
        expect(fetchMock).toHaveBeenCalledTimes(stage === "before" ? 0 : 1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("does not submit when the shared generation deadline has passed", async () => {
        await expect(requestStoryBackground(body, new AbortController().signal, Date.now()))
            .rejects.toBeInstanceOf(StoryBackgroundPendingError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
