import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryDialog } from "@/components/itineraries/story-dialog";
import { requestStoryBackground, StoryBackgroundPendingError } from "@/lib/story-background-client";
import { setStoryVideoOwner } from "@/lib/story-video-client";

vi.mock("@/lib/story-background-client", async importOriginal => ({
    ...await importOriginal<typeof import("@/lib/story-background-client")>(),
    requestStoryBackground: vi.fn(),
}));
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: { id: "story-image-owner" } }) }));

describe("StoryDialog pending orchestration", () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        vi.clearAllMocks();
        setStoryVideoOwner(null);
        fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}))));
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });
    const start = async () => {
        const view = render(<StoryDialog itineraryId="trip" itineraryTitle="Trip" totalDays={2} city="Seoul" />);
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        fireEvent.click(screen.getByRole("button", { name: "Generate 4 Slides" }));
        await waitFor(() => expect(requestStoryBackground).toHaveBeenCalled());
        return view;
    };

    it("keeps cover first, then all days and summary, with one deadline and no save while pending", async () => {
        vi.mocked(requestStoryBackground).mockResolvedValueOnce({ image: "https://example.com/cover.png", source: "ai" })
            .mockRejectedValue(new StoryBackgroundPendingError());
        await start();
        await screen.findByRole("status");
        const calls = vi.mocked(requestStoryBackground).mock.calls;
        expect(calls).toHaveLength(4);
        expect(calls.map(([body]) => JSON.parse(body).slotIndex)).toEqual([0, 1, 2, 3]);
        expect(new Set(calls.map(([, , deadline]) => deadline)).size).toBe(1);
        for (const [body] of calls.slice(1)) {
            expect(JSON.parse(body).excludeUrls).toEqual(["https://example.com/cover.png"]);
        }
        expect(screen.getByRole("status").textContent).toContain("Completion is not confirmed");
        expect(fetchMock.mock.calls.every(([, options]) => !options?.method)).toBe(true);
        expect(toast.mock.calls.some(([value]) => /ready|generated!/i.test(value.title))).toBe(false);
    });

    it.each(["close", "unmount"])("cancels on %s and ignores a late cover result", async action => {
        let resolve!: (value: { image: string; source: string }) => void;
        vi.mocked(requestStoryBackground).mockImplementation(() => new Promise(done => { resolve = done; }));
        const view = await start();
        const signal = vi.mocked(requestStoryBackground).mock.calls[0][1];
        if (action === "unmount") view.unmount();
        else fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(signal.aborted).toBe(true);
        await act(async () => resolve({ image: "https://example.com/cover.png", source: "ai" }));
        expect(requestStoryBackground).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls.every(([, options]) => !options?.method)).toBe(true);
    });

    it("does not let an old generation clear the next generation's busy state", async () => {
        let resolveOld!: (value: undefined) => void;
        vi.mocked(requestStoryBackground)
            .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
            .mockImplementation(() => new Promise(() => {}));
        await start();
        const first = vi.mocked(requestStoryBackground).mock.calls[0];
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        fireEvent.click(screen.getByRole("button", { name: "Generate 4 Slides" }));
        await waitFor(() => expect(requestStoryBackground).toHaveBeenCalledTimes(2));
        await act(async () => resolveOld(undefined));
        const second = vi.mocked(requestStoryBackground).mock.calls[1];
        expect(first[1].aborted).toBe(true);
        expect(second[1].aborted).toBe(false);
        expect(second[0]).toBe(first[0]);
        expect(screen.getByRole("button", { name: /Generating backgrounds/ }).hasAttribute("disabled")).toBe(true);
    });

    it("rotates only confirmed failed slots on explicit generation and preserves pending and unknown bodies", async () => {
        const uuid = vi.spyOn(crypto, "randomUUID");
        vi.mocked(requestStoryBackground).mockImplementation(async body => {
            const { slotIndex } = JSON.parse(body);
            if (slotIndex === 0) return { image: "https://example.com/cover.png", source: "ai" };
            if (slotIndex === 1) return { state: "failed" };
            if (slotIndex === 2) return undefined;
            throw new StoryBackgroundPendingError();
        });
        await start();
        await screen.findByRole("status");
        const original = vi.mocked(requestStoryBackground).mock.calls.map(([body]) => body);
        expect(uuid).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        expect(uuid).not.toHaveBeenCalled();
        for (let generation = 1; generation <= 2; generation++) {
            fireEvent.click(screen.getByRole("button", { name: "Generate 4 Slides" }));
            await screen.findByRole("status");
            const bodies = vi.mocked(requestStoryBackground).mock.calls.slice(generation * 4).map(([body]) => body);
            expect(bodies).toHaveLength(4);
            for (const slot of [0, 2, 3]) expect(bodies[slot]).toBe(original[slot]);
            const retry = JSON.parse(bodies[1]);
            expect(retry.cacheKey).toMatch(/^trip-day-1-attempt-[a-f0-9-]{36}$/);
            expect(retry.cacheKey).not.toBe(JSON.parse(vi.mocked(requestStoryBackground).mock.calls[(generation - 1) * 4 + 1][0]).cacheKey);
            expect({ ...retry, cacheKey: "trip-day-1" }).toEqual(JSON.parse(original[1]));
            expect(uuid).toHaveBeenCalledTimes(generation);
        }
    });

    it("retains other slot bodies when a failed cover recovers, then reuses the succeeded retry key", async () => {
        let coverCalls = 0;
        const uuid = vi.spyOn(crypto, "randomUUID");
        vi.mocked(requestStoryBackground).mockImplementation(async body => {
            const { slotIndex } = JSON.parse(body);
            if (slotIndex === 0 && coverCalls++ === 0) return { state: "failed" };
            return { image: `https://example.com/${slotIndex}.png`, source: "ai" };
        });
        await start();
        const generateAgain = await screen.findByRole("button", { name: "Generate again" });
        await waitFor(() => expect(generateAgain.hasAttribute("disabled")).toBe(false));
        const original = vi.mocked(requestStoryBackground).mock.calls.map(([body]) => body);
        fireEvent.click(generateAgain);
        await waitFor(() => expect(requestStoryBackground).toHaveBeenCalledTimes(8));
        await waitFor(() => expect(screen.getByRole("button", { name: "Generate again" }).hasAttribute("disabled")).toBe(false));
        const retry = vi.mocked(requestStoryBackground).mock.calls.slice(4).map(([body]) => body);
        expect(retry[0]).not.toBe(original[0]);
        expect(retry.slice(1)).toEqual(original.slice(1));
        fireEvent.click(screen.getByRole("button", { name: "Generate again" }));
        await waitFor(() => expect(requestStoryBackground).toHaveBeenCalledTimes(12));
        expect(vi.mocked(requestStoryBackground).mock.calls.slice(8).map(([body]) => body)).toEqual(retry);
        expect(uuid).toHaveBeenCalledTimes(1);
    });

    it("defaults to carousel, supports keyboard tabs, and hides image controls in video", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ videoUiEnabled: true }))));
        render(<StoryDialog itineraryId="tab-trip" itineraryTitle="Trip" totalDays={2} />);
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        const carousel = screen.getByRole("tab", { name: "Image carousel" });
        expect(carousel.getAttribute("aria-selected")).toBe("true");
        expect(screen.getByRole("button", { name: "Generate 4 Slides" })).toBeTruthy();
        await screen.findByRole("tab", { name: "Video" });
        act(() => carousel.focus());
        fireEvent.keyDown(carousel, { key: "ArrowRight" });
        await waitFor(() => expect(screen.getByRole("tab", { name: "Video" }).getAttribute("aria-selected")).toBe("true"));
        expect(screen.queryByRole("button", { name: "Generate 4 Slides" })).toBeNull();
        expect(screen.queryByText("Shareable Link")).toBeNull();
        expect(screen.getByRole("region", { name: "Video pilot" })).toBeTruthy();
        fireEvent.mouseDown(carousel, { button: 0, ctrlKey: false });
        expect(screen.getByRole("button", { name: "Generate 4 Slides" })).toBeTruthy();
    });

    it("blocks the video tab while image generation is active", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ videoUiEnabled: true }))));
        vi.mocked(requestStoryBackground).mockImplementation(() => new Promise(() => {}));
        await start();
        expect(screen.getByRole("tab", { name: "Video" }).hasAttribute("disabled")).toBe(true);
    });

    it.each([undefined, false, "true", "failure"])("hides video without an explicit capability: %s", async capability => {
        fetchMock.mockImplementation(url => Promise.resolve(new Response(JSON.stringify(url === "/api/images/story-background"
            ? { videoUiEnabled: capability } : {}), { status: capability === "failure" ? 503 : 200 })));
        render(<StoryDialog itineraryId="hidden-trip" itineraryTitle="Trip" totalDays={2} />);
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        await act(async () => {});
        expect(screen.getByRole("tab", { name: "Image carousel" }).getAttribute("aria-selected")).toBe("true");
        expect(screen.getByRole("button", { name: "Generate 4 Slides" })).toBeTruthy();
        expect(screen.queryByRole("tab", { name: "Video" })).toBeNull();
        expect(screen.queryByRole("region", { name: "Video pilot" })).toBeNull();
        expect(fetchMock.mock.calls).toHaveLength(3);
        expect(fetchMock.mock.calls.some(([url]) => url.includes("/story/video"))).toBe(false);
    });

    it.each(["running", "submission_unknown"])("keeps a known %s attempt visible when creation is disabled", async status => {
        const base = "/api/itineraries/known-trip/story/video";
        let enabled = true;
        let resolveEligibility!: (response: Response) => void;
        const job = { jobId: "known-job", status: "running", statusUrl: `${base}/known-job`, errorCode: null };
        fetchMock.mockImplementation((url, options) => {
            if (options?.method === "POST") return status === "submission_unknown"
                ? Promise.reject(new TypeError("network")) : Promise.resolve(new Response(JSON.stringify(job), { status: 202 }));
            if (url === base && !enabled) return new Promise(resolve => { resolveEligibility = resolve; });
            return Promise.resolve(new Response(JSON.stringify(url === base
                ? { canSubmit: true, reason: null, eligibleDurations: [4, 5, 6], model: "MiniMax-H3", format: "mp4", ratio: "9:16" }
                : url === `${base}/known-job` ? job : { videoUiEnabled: enabled })));
        });
        const first = render(<StoryDialog itineraryId="known-trip" itineraryTitle="Trip" totalDays={2} />);
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        fireEvent.mouseDown(await screen.findByRole("tab", { name: "Video" }), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("button", { name: "Create video" }));
        await screen.findByText(status === "running" ? "Your video is being generated."
            : "The request needs review. Check the existing request before starting another video.");
        first.unmount();
        enabled = false;
        render(<StoryDialog itineraryId="known-trip" itineraryTitle="Trip" totalDays={2} />);
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        await act(async () => {});
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Video" }), { button: 0, ctrlKey: false });
        expect(screen.getByRole("region", { name: "Video pilot" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Create.*video/ })).toBeNull();
        await act(async () => resolveEligibility(new Response(JSON.stringify({ canSubmit: false, reason: "unavailable",
            eligibleDurations: [], model: "MiniMax-H3", format: "mp4", ratio: "9:16" }))));
        expect(screen.getByRole("tab", { name: "Video" }).getAttribute("aria-selected")).toBe("true");
        expect(screen.queryByRole("button", { name: /Create.*video/ })).toBeNull();
        expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
        if (status === "submission_unknown") expect(screen.getByRole("button", { name: "Check existing request" })).toBeTruthy();
        else expect(fetchMock.mock.calls.some(([url]) => url === `${base}/known-job`)).toBe(true);
    });

    it("uses a 44px close control with header clearance and opaque high-contrast placeholder text", () => {
        render(<StoryDialog itineraryId="contrast-trip" itineraryTitle="Trip" totalDays={2} />);
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        const close = screen.getByRole("button", { name: "Close" });
        expect(close.classList.contains("h-11")).toBe(true);
        expect(close.classList.contains("w-11")).toBe(true);
        expect(close.getAttribute("data-slot")).toBe("dialog-close");
        expect(screen.getByRole("heading", { name: "Create Story" }).closest('[data-slot="dialog-header"]')?.classList.contains("pr-10")).toBe(true);
        const label = screen.getByText("Story Format");
        expect(label.className).not.toContain("opacity-");
        expect(screen.getByText("1080 × 1920").className).not.toContain("opacity-");
        expect(label.parentElement?.classList.contains("text-white")).toBe(true);
        expect(label.parentElement?.parentElement?.classList.contains("from-violet-600")).toBe(true);
        expect(label.parentElement?.parentElement?.classList.contains("to-indigo-700")).toBe(true);
        fireEvent.click(close);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("gives image model radios visible borders without changing disabled state", async () => {
        fetchMock.mockImplementation(url => Promise.resolve(new Response(JSON.stringify(url === "/api/images/story-background"
            ? { sources: { ai: true }, models: [
                { provider: "flux", label: "FLUX", available: true, credits: 1 },
                { provider: "locked", label: "Locked", available: false, credits: 2 },
            ] } : { tier: "premium" }))));
        render(<StoryDialog itineraryId="radio-trip" itineraryTitle="Trip" totalDays={2} city="Seoul" />);
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        const radios = await screen.findAllByRole("radio");
        expect(radios).toHaveLength(2);
        expect(radios.every(radio => radio.classList.contains("border-muted-foreground"))).toBe(true);
        expect(radios[0].hasAttribute("disabled")).toBe(false);
        expect(radios[1].hasAttribute("disabled")).toBe(true);
    });

    it("keeps generation success and cloud save failure inside the carousel, without global toasts", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ videoUiEnabled: true }))));
        render(<StoryDialog itineraryId="notice-trip" itineraryTitle="Trip" totalDays={2} />);
        fireEvent.click(screen.getByRole("button", { name: "Stories" }));
        fireEvent.click(screen.getByRole("button", { name: "Generate 4 Slides" }));
        expect(screen.getByRole("status").textContent).toContain("Stories generated!");
        expect(screen.getByRole("dialog").contains(screen.getByRole("status"))).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Save to Localley" }));
        expect((await screen.findByRole("alert")).textContent).toContain("Could not save to cloud");
        expect(screen.queryByRole("status")).toBeNull();
        expect(toast).not.toHaveBeenCalled();
        await act(async () => {
            fireEvent.mouseDown(screen.getByRole("tab", { name: "Video" }), { button: 0, ctrlKey: false });
        });
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("reports generation failure inline with an alert and no global toast", async () => {
        vi.mocked(requestStoryBackground).mockRejectedValue(new Error("generation failed"));
        await start();
        expect((await screen.findByRole("alert")).textContent).toContain("Generation failed");
        expect(toast).not.toHaveBeenCalled();
    });

    it("shares an uncertain attempt between the two real dialog triggers", async () => {
        fetchMock.mockImplementation((url, options) => {
            if (options?.method === "POST") return Promise.reject(new TypeError("network"));
            return Promise.resolve(new Response(JSON.stringify(url.endsWith("/story/video")
                ? { canSubmit: true, reason: null, eligibleDurations: [4, 5, 6], model: "MiniMax-H3", format: "mp4", ratio: "9:16" } : { videoUiEnabled: true })));
        });
        render(<><div data-testid="dialog-one"><StoryDialog itineraryId="shared-trip" itineraryTitle="Trip" totalDays={2} /></div>
            <div data-testid="dialog-two"><StoryDialog itineraryId="shared-trip" itineraryTitle="Trip" totalDays={2} /></div></>);
        fireEvent.click(within(screen.getByTestId("dialog-one")).getByRole("button", { name: "Stories" }));
        fireEvent.mouseDown(await screen.findByRole("tab", { name: "Video" }), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("button", { name: "Create video" }));
        await screen.findByRole("button", { name: "Check existing request" });
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        fireEvent.click(within(screen.getByTestId("dialog-two")).getByRole("button", { name: "Stories" }));
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Video" }), { button: 0, ctrlKey: false });
        const posts = () => fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
        expect(posts()).toHaveLength(1);
        fireEvent.click(await screen.findByRole("button", { name: "Check existing request" }));
        await screen.findByRole("button", { name: "Check existing request" });
        expect(posts()).toHaveLength(2);
        expect(posts()[1][1].headers).toEqual(posts()[0][1].headers);
        expect(posts()[1][1].body).toBe(posts()[0][1].body);
    });
});
