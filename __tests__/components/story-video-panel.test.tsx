import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryVideoPanel } from "@/components/itineraries/story-video-panel";
import { setStoryVideoOwner } from "@/lib/story-video-client";

const base = "/api/itineraries/trip/story/video";
const ready = { canSubmit: true, reason: null, eligibleDurations: [4, 5, 6], model: "MiniMax-H3", format: "mp4", ratio: "9:16" };
const job = (status: string, downloadUrl?: string) => ({ jobId: "job-1", status, statusUrl: `${base}/job-1`, errorCode: null, downloadUrl });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const flush = () => act(async () => { await Promise.resolve(); });

describe("Story video panel", () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        vi.useFakeTimers();
        setStoryVideoOwner("owner");
        fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response(ready)));
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
        cleanup();
        setStoryVideoOwner(null);
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });
    const mount = (active = true) => render(<StoryVideoPanel userId="owner" itineraryId="trip" active={active} />);
    const posts = () => fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");

    it.each(["premium_required", "unavailable", "unsupported_story_text", "limit", "processing_unavailable"])("does not offer generation for %s", async reason => {
        fetchMock.mockResolvedValue(response({ ...ready, canSubmit: false, reason, eligibleDurations: [] }));
        mount();
        await flush();
        expect(screen.queryByRole("button", { name: "Create video" })).toBeNull();
        expect(posts()).toHaveLength(0);
        expect(screen.getAllByRole("radio").every(element => element.hasAttribute("disabled"))).toBe(true);
        expect(screen.getAllByRole("radio").every(element => element.classList.contains("border-muted-foreground"))).toBe(true);
    });

    it.each([401, 404, 503])("fails closed on readiness HTTP %s", async status => {
        fetchMock.mockResolvedValue(response({ errorCode: "unavailable" }, status));
        mount();
        await flush();
        expect(screen.queryByRole("button", { name: "Create video" })).toBeNull();
        expect(screen.getByRole("status").textContent).toContain("not available");
    });

    it("requires the exact server capability and handles an empty budget", async () => {
        fetchMock.mockResolvedValue(response({ ...ready, eligibleDurations: [] }));
        const view = mount();
        await flush();
        expect(screen.queryByRole("button", { name: "Create video" })).toBeNull();
        view.unmount();
        fetchMock.mockResolvedValue(response({ ...ready, model: "other" }));
        mount();
        await flush();
        expect(screen.queryByRole("button", { name: "Create video" })).toBeNull();
    });

    it("uses an eligible duration and synchronously locks two instances", async () => {
        fetchMock.mockImplementation((_url, options) => options?.method === "POST"
            ? new Promise(() => {}) : Promise.resolve(response({ ...ready, eligibleDurations: [5, 6] })));
        render(<><div data-testid="first"><StoryVideoPanel userId="owner" itineraryId="trip" active /></div>
            <div data-testid="second"><StoryVideoPanel userId="owner" itineraryId="trip" active /></div></>);
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const first = within(screen.getByTestId("first")).getByRole("button", { name: "Create video" });
        const second = within(screen.getByTestId("second")).getByRole("button", { name: "Create video" });
        act(() => { first.click(); second.click(); first.click(); });
        expect(posts()).toHaveLength(1);
        expect(JSON.parse(posts()[0][1].body)).toEqual({ duration: 5 });
        expect(posts()[0][1].headers["Idempotency-Key"]).toMatch(/^[a-f0-9-]{36}$/);
    });

    it("keeps the same uncertain identity across instances and reopens without automatic POST", async () => {
        fetchMock.mockImplementation((_url, options) => options?.method === "POST"
            ? Promise.reject(new TypeError("network")) : Promise.resolve(response(ready)));
        const first = mount();
        await flush();
        fireEvent.click(screen.getByRole("radio", { name: "6 seconds · Portrait MP4" }));
        fireEvent.click(screen.getByRole("button", { name: "Create video" }));
        await flush();
        first.unmount();
        mount();
        await flush();
        expect(posts()).toHaveLength(1);
        expect(screen.queryByRole("button", { name: "Create another video" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Check existing request" }));
        await flush();
        expect(posts()).toHaveLength(2);
        expect(posts()[1][1].body).toBe(posts()[0][1].body);
        expect(posts()[1][1].headers).toEqual(posts()[0][1].headers);
    });

    it("polls real stages sequentially and exposes only the delivered private download", async () => {
        const states = ["provider_ready", "processing", "delivered"];
        fetchMock.mockImplementation((url, options) => Promise.resolve(response(options?.method === "POST"
            ? job("queued") : url === base ? ready : job(states.shift()!, `${base}/job-1/download`), options?.method === "POST" ? 202 : 200)));
        mount();
        await flush();
        fireEvent.click(screen.getByRole("button", { name: "Create video" }));
        await flush();
        expect(screen.getByRole("status").textContent).toContain("queued");
        for (const text of ["Generation finished", "Preparing your private", "Your video is ready"]) {
            expect(screen.queryByRole("link")).toBeNull();
            await act(() => vi.advanceTimersByTimeAsync(10_000));
            expect(screen.getByRole("status").textContent).toContain(text);
        }
        expect(screen.getByRole("link", { name: "Download MP4" }).getAttribute("href")).toBe(`${base}/job-1/download`);
        expect(screen.queryByText("Shareable Link")).toBeNull();
        const calls = fetchMock.mock.calls.length;
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(fetchMock).toHaveBeenCalledTimes(calls);
        fireEvent.click(screen.getByRole("button", { name: "Create another video" }));
        await flush();
        expect(posts()[1][1].headers["Idempotency-Key"]).not.toBe(posts()[0][1].headers["Idempotency-Key"]);
        await act(() => vi.advanceTimersByTimeAsync(10_000));
        expect(fetchMock.mock.calls.length).toBeGreaterThan(calls + 1);
    });

    it.each(["https://evil.example/video.mp4", "//evil.example/video", `${base}/other/download`, `${base}/job-1/download?token=secret`])("rejects download URL %s", async download => {
        fetchMock.mockImplementation((_url, options) => Promise.resolve(response(options?.method === "POST" ? job("delivered", download) : ready, options?.method === "POST" ? 202 : 200)));
        mount();
        await flush();
        fireEvent.click(screen.getByRole("button", { name: "Create video" }));
        await flush();
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByText("Download is not available.")).toBeTruthy();
    });

    it.each(["failed", "cancelled", "processing_failed", "submission_unknown"])("allows another attempt only for confirmed terminal %s", async status => {
        fetchMock.mockImplementation((_url, options) => Promise.resolve(response(options?.method === "POST" ? job(status) : ready, options?.method === "POST" ? 202 : 200)));
        mount();
        await flush();
        fireEvent.click(screen.getByRole("button", { name: "Create video" }));
        await flush();
        expect(!!screen.queryByRole("button", { name: "Create another video" })).toBe(status !== "submission_unknown");
    });

    it("aborts polling on close and ignores late responses", async () => {
        let resolve!: (response: Response) => void;
        fetchMock.mockImplementation((url, options) => options?.method === "POST" ? Promise.resolve(response(job("running"), 202))
            : url === base ? Promise.resolve(response(ready)) : new Promise(done => { resolve = done; }));
        const view = mount();
        await flush();
        fireEvent.click(screen.getByRole("button", { name: "Create video" }));
        await flush();
        await act(() => vi.advanceTimersByTimeAsync(10_000));
        const pollSignal = fetchMock.mock.calls.at(-1)![1].signal;
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(fetchMock).toHaveBeenCalledTimes(3);
        view.rerender(<StoryVideoPanel userId="owner" itineraryId="trip" active={false} />);
        expect(pollSignal.aborted).toBe(true);
        await act(async () => resolve(response(job("delivered", `${base}/job-1/download`))));
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByRole("status").textContent).toContain("being generated");
    });

    it("does not overlap a pending status read with a retry status read", async () => {
        let resolve!: (response: Response) => void;
        fetchMock.mockImplementation((url, options) => options?.method === "POST" ? Promise.resolve(response(job("submission_unknown"), 202))
            : url === base ? Promise.resolve(response(ready)) : new Promise(done => { resolve = done; }));
        mount();
        await flush();
        fireEvent.click(screen.getByRole("button", { name: "Create video" }));
        await flush();
        await act(() => vi.advanceTimersByTimeAsync(10_000));
        fireEvent.click(screen.getByRole("button", { name: "Check existing request" }));
        await flush();
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(fetchMock.mock.calls.filter(([url]) => url === `${base}/job-1`)).toHaveLength(1);
        expect(posts()).toHaveLength(1);
        await act(async () => resolve(response(job("failed"))));
        expect(screen.getByRole("button", { name: "Create another video" })).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(10_000));
        expect(fetchMock.mock.calls.filter(([url]) => url === `${base}/job-1`)).toHaveLength(1);
    });

    it("checks a known uncertain job with GET even when readiness now requires Premium", async () => {
        let eligibility = ready;
        fetchMock.mockImplementation((url, options) => Promise.resolve(response(options?.method === "POST"
            ? job("submission_unknown") : url === base ? eligibility : job("submission_unknown"), options?.method === "POST" ? 202 : 200)));
        const view = mount();
        await flush();
        fireEvent.click(screen.getByRole("button", { name: "Create video" }));
        await flush();
        view.unmount();
        eligibility = { ...ready, canSubmit: false, eligibleDurations: [] };
        fetchMock.mockImplementation((url, options) => Promise.resolve(response(url === base
            ? { ...eligibility, reason: "premium_required" } : job("submission_unknown"), options?.method === "POST" ? 403 : 200)));
        mount();
        await flush();
        expect(screen.getByText("Video requires Premium.")).toBeTruthy();
        const calls = fetchMock.mock.calls.length;
        fireEvent.click(screen.getByRole("button", { name: "Check existing request" }));
        await flush();
        expect(fetchMock.mock.calls.slice(calls).map(([url]) => url)).toEqual([`${base}/job-1`]);
        expect(posts()).toHaveLength(1);
    });

    it("ignores aborted readiness after unmount and checks again on reopen", async () => {
        let resolve!: (response: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const view = mount();
        const signal = fetchMock.mock.calls[0][1].signal;
        view.unmount();
        expect(signal.aborted).toBe(true);
        await act(async () => resolve(response(ready)));
        fetchMock.mockResolvedValue(response({ ...ready, canSubmit: false, reason: "limit", eligibleDurations: [] }));
        mount();
        await flush();
        expect(screen.queryByRole("button", { name: "Create video" })).toBeNull();
        expect(screen.getByRole("status").textContent).toContain("limit");
    });

    it("preserves an aborted POST identity and clears private state on owner change", async () => {
        let resolve!: (response: Response) => void;
        fetchMock.mockImplementation((_url, options) => options?.method === "POST"
            ? new Promise(done => { resolve = done; }) : Promise.resolve(response(ready)));
        const view = mount();
        await flush();
        fireEvent.click(screen.getByRole("button", { name: "Create video" }));
        const signal = posts()[0][1].signal;
        view.rerender(<StoryVideoPanel userId="owner" itineraryId="trip" active={false} />);
        expect(signal.aborted).toBe(true);
        expect(screen.getByRole("button", { name: "Check existing request" })).toBeTruthy();
        act(() => setStoryVideoOwner("other"));
        view.rerender(<StoryVideoPanel userId="other" itineraryId="trip" active />);
        await act(async () => resolve(response(job("delivered", `${base}/job-1/download`), 202)));
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.queryByRole("button", { name: "Check existing request" })).toBeNull();
        act(() => setStoryVideoOwner(null));
        view.rerender(<StoryVideoPanel userId={null} itineraryId="trip" active />);
        expect(screen.queryByRole("button", { name: "Create video" })).toBeNull();
    });
});
