// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFalClient } from "@fal-ai/client";
import { previewFluxClient } from "@/lib/app-data/preview-flux-client";
const model = "fal-ai/flux-2-flex";
const input = { prompt: "Controlled SDK fixture", output_format: "png" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "x-fal-request-id": "controlled" },
});
afterEach(() => vi.useRealTimers());

describe("candidate FLUX uses the real pinned queue SDK", () => {
    it.each([429, 500, 502, 503, 504, 307])("does not repeat a physical POST after HTTP %i", async status => {
        const transport = vi.fn<typeof fetch>().mockResolvedValue(json({ detail: "private payload" }, status));
        const client = previewFluxClient("fixture-not-a-key", transport);
        await expect(client.subscribe(model, { input })).rejects.toThrow(`failed (${status})`);
        expect(transport).toHaveBeenCalledTimes(1);
        expect(transport.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "manual" });
        await expect(client.queue.submit(model, { input })).rejects.toThrow("already attempted");
        expect(transport).toHaveBeenCalledTimes(1);
    });
    it("retains the claim when the provider reply is lost", async () => {
        const transport = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("lost reply"));
        const client = previewFluxClient("fixture-not-a-key", transport);
        await expect(client.subscribe(model, { input })).rejects.toThrow("lost reply");
        await expect(client.queue.submit(model, { input })).rejects.toThrow("already attempted");
        expect(transport).toHaveBeenCalledTimes(1);
    });
    it("preserves successful submit, read-only status retries and PNG result", async () => {
        vi.useFakeTimers();
        const transport = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json({ request_id: "controlled", status: "IN_QUEUE" }))
            .mockResolvedValueOnce(json({ detail: "transient read" }, 503))
            .mockResolvedValueOnce(json({ request_id: "controlled", status: "COMPLETED" }))
            .mockResolvedValueOnce(json({ images: [{ url: "https://fixture.invalid/image.png", content_type: "image/png" }] }));
        const client = previewFluxClient("fixture-not-a-key", transport);
        const result = client.subscribe(model, { input });
        await vi.runAllTimersAsync();
        await expect(result).resolves.toMatchObject({ data: { images: [{ content_type: "image/png" }] } });
        expect(transport.mock.calls.map(call => call[1]?.method)).toEqual(["POST", "GET", "GET", "GET"]);
    });
    it("leaves normal SDK submission retry behavior intact", async () => {
        vi.useFakeTimers();
        const transport = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(json({ detail: "transient" }, 503))
            .mockResolvedValueOnce(json({ request_id: "normal", status: "IN_QUEUE" }));
        const result = createFalClient({ credentials: "fixture-not-a-key", fetch: transport }).queue.submit(model, { input });
        await vi.runAllTimersAsync();
        await expect(result).resolves.toMatchObject({ request_id: "normal" });
        expect(transport.mock.calls.map(call => call[1]?.method)).toEqual(["POST", "POST"]);
    });
    it("claims synchronously before concurrent dispatch and never repeats malformed replies", async () => {
        const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("invalid json", { headers: { "content-type": "application/json" } }));
        const client = previewFluxClient("fixture-not-a-key", transport);
        const results = await Promise.allSettled([client.queue.submit(model, { input }), client.queue.submit(model, { input })]);
        expect(results.map(result => result.status)).toEqual(["rejected", "rejected"]);
        expect(transport).toHaveBeenCalledTimes(1);
    });
    it("isolates submission claims between two candidate images", async () => {
        const transport = vi.fn<typeof fetch>().mockImplementation(async () => json({ request_id: "isolated", status: "IN_QUEUE" }));
        await Promise.all([previewFluxClient("fixture-not-a-key", transport).queue.submit(model, { input }),
            previewFluxClient("fixture-not-a-key", transport).queue.submit(model, { input })]);
        expect(transport).toHaveBeenCalledTimes(2);
    });
});
