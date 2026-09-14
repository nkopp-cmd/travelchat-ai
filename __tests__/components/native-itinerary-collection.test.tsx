import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeItineraryCollection, type NativeItinerarySummary } from "@/components/itineraries/native-itinerary-collection";
import { AppSessionProvider } from "@/providers/app-session-provider";
import type { AppSessionValue } from "@/lib/auth/session-contract";

const id = "aaaaaaaa-1111-4111-8111-111111111111";
const id2 = "bbbbbbbb-1111-4111-8111-111111111111";
const row: NativeItinerarySummary = { id, ownerId: "owner", title: "Private Seoul trip", city: "Seoul", days: 2,
    local_score: null, created_at: "2026-09-01", status: null, subtitle: null, highlights: null, estimated_cost: null, is_favorite: false };
const session = (changes: Partial<AppSessionValue> = {}): AppSessionValue => ({ status: "ready", provider: "better-auth",
    ownerId: "owner", accountKey: "account", sessionId: "session", authUserId: "auth", userRecordId: "profile",
    canBookmark: false, refresh: vi.fn().mockResolvedValue(undefined), requestSignIn: vi.fn(), ...changes });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const page = (itineraries = [row], nextOffset: number | null = null) => response({ itineraries, nextOffset });
const deferred = () => {
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>((done) => { resolve = done; });
    return { promise, resolve };
};
const deleted = vi.fn(), navigate = vi.fn();
function native(value = session()) {
    return <AppSessionProvider value={value}><NativeItineraryCollection onDeleted={deleted} onNavigate={navigate} /></AppSessionProvider>;
}
async function menu(title = row.title!) {
    const button = await screen.findByRole("button", { name: `Actions for ${title}` });
    fireEvent.keyDown(button, { key: "Enter" });
    await screen.findByRole("menuitem", { name: "Delete" });
    return button;
}
async function confirm() {
    await menu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Delete", exact: true })); });
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("native collection using the existing cards", () => {
    it("preserves named routes with hyphens so deletion targets remain distinguishable", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page([
            { ...row, title: "Tokyo-Seoul weekend" },
            { ...row, id: id2, title: "Busan-Seoul weekend" },
        ])));
        render(native());
        expect(await screen.findAllByRole("heading", { name: "Tokyo-Seoul weekend" })).toHaveLength(2);
        expect(screen.getByRole("heading", { name: "Busan-Seoul weekend" })).toBeTruthy();
        await menu("Tokyo-Seoul weekend");
        fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
        expect((await screen.findByRole("alertdialog")).textContent).toContain("Tokyo-Seoul weekend");
    });
    it("loads cookie-scoped summaries, keeps navigation explicit, and offers no unsupported actions or images", async () => {
        const fetch = vi.fn().mockResolvedValue(page()); vi.stubGlobal("fetch", fetch); render(native());
        const links = await screen.findAllByRole("link", { name: /Private Seoul trip/ });
        fireEvent.click(links[0]); expect(navigate).toHaveBeenCalledWith(`/itineraries/${id}`);
        expect(fetch).toHaveBeenCalledWith("/api/itineraries?limit=25&offset=0", expect.objectContaining({ credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "x-localley-session-id": "session" } }));
        expect(screen.getByText("Not scored")).toBeTruthy();
        expect(screen.queryByRole("img")).toBeNull();
        expect(screen.queryByText("Create New Itinerary")).toBeNull();
        await menu();
        expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeTruthy();
        expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("creates an owned trip through the native collection form and opens it", async () => {
        const created = { ...row, id: id2, title: "Harbor walk", city: "Busan" };
        const fetch = vi.fn((_input: string, init?: RequestInit) => {
            if (init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ itinerary: created }), { status: 201 }));
            return Promise.resolve(page(init?.method ? [created] : [row]));
        });
        vi.stubGlobal("fetch", fetch);
        render(native());
        await waitFor(() => expect((screen.getByRole("button", { name: "Create a trip" }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Harbor walk" } });
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Busan" } });
        await act(async () => { fireEvent.submit(screen.getByRole("form", { name: "Create a trip" })); });
        await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/itineraries/${id2}`));
        const posted = fetch.mock.calls.find((call) => call[1]?.method === "POST");
        expect(posted?.[0]).toBe("/api/itineraries");
        expect(JSON.parse(String(posted?.[1]?.body))).toEqual({ title: "Harbor walk", city: "Busan", days: [{ day: 1, activities: [{ name: "To plan" }] }] });
    });

    it("duplicates an owned trip from the collection menu and opens the copy", async () => {
        const copy = { ...row, id: id2, title: "Private Seoul trip (Copy)" };
        const fetch = vi.fn((_input: string, init?: RequestInit) => {
            if (init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ itinerary: copy }), { status: 201 }));
            return Promise.resolve(page());
        });
        vi.stubGlobal("fetch", fetch);
        render(native());
        await menu();
        await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" })); });
        await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/itineraries/${id2}`));
        expect(fetch).toHaveBeenCalledWith(`/api/itineraries/${id}/duplicate`, expect.objectContaining({
            method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
            headers: { "x-localley-session-id": "session" },
        }));
    });

    it("uses the actual dialog, focuses Cancel, restores focus, and never writes on cancel", async () => {
        const fetch = vi.fn().mockResolvedValue(page()); vi.stubGlobal("fetch", fetch); render(native());
        const trigger = await menu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
        const cancel = within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" });
        await waitFor(() => expect(document.activeElement).toBe(cancel));
        fireEvent.click(cancel);
        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("locks pending confirmation and reloads offset zero after deleting the last trip", async () => {
        const pending = deferred();
        const fetch = vi.fn().mockResolvedValueOnce(page()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page([]));
        vi.stubGlobal("fetch", fetch); render(native()); await confirm();
        const button = screen.getByRole("button", { name: "Deleting..." });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(button); expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[1]).toEqual([`/api/itineraries/${id}`, expect.objectContaining({ method: "DELETE", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "x-localley-session-id": "session" } })]);
        expect(fetch.mock.calls[1][1].body).toBeUndefined();
        await act(async () => pending.resolve(response({ success: true })));
        await screen.findByText("No itineraries yet");
        expect(fetch.mock.calls[2][0]).toBe("/api/itineraries?limit=25&offset=0");
        expect(deleted).toHaveBeenCalledExactlyOnceWith(id);
        expect(screen.queryByText("Create Your First Itinerary")).toBeNull();
    });

    it("preserves server cursor progress through short pages and labels loaded-only search until complete", async () => {
        const fetch = vi.fn().mockResolvedValueOnce(page([row], 1)).mockResolvedValueOnce(page([{ ...row, id: id2, title: "Tokyo trip", city: "Tokyo" }], 2)).mockResolvedValueOnce(page([]));
        vi.stubGlobal("fetch", fetch); render(native());
        fireEvent.change(await screen.findByRole("textbox", { name: "Search loaded trips" }), { target: { value: "Tokyo" } });
        expect(await screen.findByText("No itineraries found")).toBeTruthy();
        expect(screen.getByText(/filters, and sorting apply to loaded trips only/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Load more" }));
        await screen.findByText("Tokyo trip");
        expect(fetch.mock.calls[1][0]).toBe("/api/itineraries?limit=25&offset=1");
        fireEvent.click(screen.getByRole("button", { name: "Load more" }));
        await screen.findByRole("textbox", { name: "Search itineraries" });
        expect(fetch.mock.calls[2][0]).toBe("/api/itineraries?limit=25&offset=2");
        expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
        expect(screen.queryByText(/loaded trips only/)).toBeNull();
    });

    it.each([
        null, { itineraries: [], nextOffset: 0 }, { itineraries: [], nextOffset: -1 }, { itineraries: [], nextOffset: 1.5 },
        { itineraries: [row], nextOffset: 2 }, { itineraries: [], nextOffset: 1 },
        { itineraries: [row, { ...row, id: id2, ownerId: "foreign" }], nextOffset: null },
        ...[{ id: "bad" }, { title: {} }, { city: 2 }, { days: 0 }, { highlights: [2] }, { estimated_cost: 2 },
            { local_score: "8" }, { created_at: null }, { status: 4 }, { is_favorite: null }, { subtitle: undefined }, { activities: [] }]
            .map((change) => ({ itineraries: [{ ...row, ...change }], nextOffset: null })),
        { itineraries: [row, row], nextOffset: null },
        { itineraries: Array.from({ length: 26 }, () => row), nextOffset: null },
    ])("fails closed without false empty state for invalid page %#", async (body) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body))); render(native());
        await screen.findByRole("alert");
        expect(screen.queryByText("Private Seoul trip")).toBeNull();
        expect(screen.queryByText("No itineraries yet")).toBeNull();
    });

    it.each(["duplicate", "cursor", "mixed owner"])("clears previously loaded private rows on %s in a later page", async (fault) => {
        const fetch = vi.fn().mockResolvedValueOnce(page([row], 1)).mockResolvedValueOnce(page(
            [{ ...row, id: fault === "duplicate" ? id.toUpperCase() : id2, ownerId: fault === "mixed owner" ? "other" : "owner" }], fault === "cursor" ? 3 : null));
        vi.stubGlobal("fetch", fetch); render(native());
        fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
        await screen.findByRole("alert"); expect(screen.queryByText("Private Seoul trip")).toBeNull();
    });

    it("rejects a response larger than 1 MiB without trusting Content-Length", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page([{ ...row, title: "x".repeat(1024 * 1024) }]))); render(native());
        await screen.findByRole("alert"); expect(screen.queryByRole("link")).toBeNull();
    });

    it("shows honest null fields and invalid dates", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page([{ ...row, title: null, city: null, created_at: "" }]))); render(native());
        expect((await screen.findAllByText("Untitled itinerary")).length).toBe(2);
        expect(screen.getByText("Date unavailable")).toBeTruthy();
        expect(screen.getByText("Not scored")).toBeTruthy();
        expect(screen.queryByText("0/10")).toBeNull();
    });

    it("rejects an empty advancing page without claiming an empty collection", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page([], 4))); render(native());
        await screen.findByRole("alert");
        expect(screen.queryByText("No itineraries yet")).toBeNull();
        expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    });

    it("requests the remaining two rows at 998 and caps summaries at 1,000 without clearing them", async () => {
        const fetch = vi.fn().mockImplementation((url: string) => {
            const params = new URL(url, "https://localley.io").searchParams;
            const offset = Number(params.get("offset"));
            const count = offset === 0 ? 23 : Number(params.get("limit"));
            return Promise.resolve(page(Array.from({ length: count }, (_, i) => ({ ...row,
                id: `${(offset + i).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111` })), offset + count));
        });
        vi.stubGlobal("fetch", fetch); render(native());
        fireEvent.change(await screen.findByRole("textbox", { name: "Search loaded trips" }), { target: { value: "unmatched" } });
        for (let i = 1; i < 41; i++) {
            await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load more" })); });
        }
        expect((await screen.findByRole("alert")).textContent).toContain("Loaded 1,000 trips. More trips exist");
        expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(41);
        expect(fetch.mock.calls[40][0]).toBe("/api/itineraries?limit=2&offset=998");
        expect(screen.getByRole("textbox", { name: "Search loaded trips" })).toBeTruthy();
    }, 20000);

    it("retains validated trips at the aggregate byte cap without advancing or claiming completeness", async () => {
        const fetch = vi.fn().mockImplementation((url: string) => {
            const offset = Number(new URL(url, "https://localley.io").searchParams.get("offset"));
            return Promise.resolve(page([{ ...row, id: `${offset.toString().padStart(8, "0")}-1111-4111-8111-111111111111`,
                title: `Trip ${offset}`, highlights: ["x".repeat(900_000)] }], offset + 1));
        });
        vi.stubGlobal("fetch", fetch); render(native());
        await screen.findByRole("button", { name: "Actions for Trip 0" });
        for (let i = 1; i <= 4; i++) {
            await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load more" })); });
        }
        expect((await screen.findByRole("alert")).textContent).toContain("Collection size limit reached (4 MiB)");
        for (let i = 0; i < 4; i++) expect(screen.getByRole("button", { name: `Actions for Trip ${i}` })).toBeTruthy();
        expect(screen.queryByText("Trip 4")).toBeNull();
        expect(screen.getByRole("textbox", { name: "Search loaded trips" })).toBeTruthy();
        const more = screen.getByRole("button", { name: "Load more" });
        expect((more as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(more);
        expect(fetch).toHaveBeenCalledTimes(5);
        expect(fetch.mock.calls[4][0]).toBe("/api/itineraries?limit=25&offset=4");
        expect(screen.getByRole("region", { name: "Your itineraries" }).getAttribute("aria-busy")).toBe("false");
    });

    it.each(["headers", "body"])("ends a stalled GET %s, clears busy, and permits manual reload", async (stall) => {
        vi.useFakeTimers();
        const cancel = vi.fn().mockRejectedValue(new Error("cancel failed"));
        const stalled = stall === "headers" ? new Promise<Response>(() => {})
            : Promise.resolve(new Response(new ReadableStream({ cancel })));
        const fetch = vi.fn().mockReturnValueOnce(stalled).mockResolvedValueOnce(page());
        vi.stubGlobal("fetch", fetch);
        render(native());
        await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
        expect(screen.getByRole("alert").textContent).toContain("Could not load itineraries");
        expect(screen.getByRole("region", { name: "Your itineraries" }).getAttribute("aria-busy")).toBe("false");
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
        if (stall === "body") expect(cancel).toHaveBeenCalledTimes(1);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reload itineraries" })); });
        expect(screen.getByRole("button", { name: "Actions for Private Seoul trip" })).toBeTruthy();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each(["headers", "body"])("does not claim deletion after stalled DELETE %s and allows a manual read", async (stall) => {
        const pending = deferred();
        const cancel = vi.fn().mockImplementation(() => new Promise<void>(() => {}));
        const fetch = vi.fn().mockResolvedValueOnce(page()).mockReturnValueOnce(stall === "headers" ? pending.promise
            : Promise.resolve(new Response(new ReadableStream({ cancel })))).mockResolvedValueOnce(page([]));
        vi.stubGlobal("fetch", fetch); render(native());
        await menu(); fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
        const dialog = await screen.findByRole("alertdialog");
        vi.useFakeTimers();
        await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Delete", exact: true })); });
        await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
        expect(screen.getByRole("alert").textContent).toContain("Could not confirm deletion. Reload the list and check before retrying.");
        expect(screen.getByRole("region", { name: "Your itineraries" }).getAttribute("aria-busy")).toBe("false");
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2); expect(deleted).not.toHaveBeenCalled();
        if (stall === "body") expect(cancel).toHaveBeenCalledTimes(1);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reload itineraries" })); });
        expect(screen.getByText("No itineraries yet")).toBeTruthy();
        expect(fetch.mock.calls[2][0]).toBe("/api/itineraries?limit=25&offset=0");
        await act(async () => pending.resolve(response({ success: true })));
        expect(deleted).not.toHaveBeenCalled(); expect(screen.queryByText("Itinerary deleted.")).toBeNull();
    });

    it("keeps validated deletion success when the reload body times out", async () => {
        const cancel = vi.fn();
        const fetch = vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(response({ success: true }))
            .mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
        vi.stubGlobal("fetch", fetch); render(native());
        await menu(); fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
        const dialog = await screen.findByRole("alertdialog");
        vi.useFakeTimers();
        await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Delete", exact: true })); });
        await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
        expect(screen.getByRole("alert").textContent).toContain("Itinerary deleted, but the list could not reload.");
        expect(deleted).toHaveBeenCalledExactlyOnceWith(id);
        expect(screen.getByRole("region", { name: "Your itineraries" }).getAttribute("aria-busy")).toBe("false");
    });

    it("cancels a stalled body on account change without showing a late timeout in the new collection", async () => {
        vi.useFakeTimers();
        const cancel = vi.fn().mockRejectedValue(new Error("cancel failed"));
        const fetch = vi.fn().mockResolvedValueOnce(new Response(new ReadableStream({ cancel })))
            .mockResolvedValueOnce(page([{ ...row, ownerId: "other", title: "New account trip" }]));
        vi.stubGlobal("fetch", fetch);
        const view = render(native());
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        await act(async () => { view.rerender(native(session({ ownerId: "other", accountKey: "other", sessionId: "new" }))); });
        await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
        expect(screen.getByRole("button", { name: "Actions for New account trip" })).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(deleted).not.toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each([401, 403, 409])("closes private views and refreshes context on GET %s", async (status) => {
        const refresh = vi.fn().mockRejectedValue(new Error("offline"));
        const fetch = vi.fn().mockResolvedValueOnce(page([row], 1)).mockResolvedValueOnce(response({}, status));
        vi.stubGlobal("fetch", fetch); render(native(session({ refresh })));
        const more = await screen.findByRole("button", { name: "Load more" });
        await act(async () => { fireEvent.click(more); });
        await screen.findByRole("alert");
        expect(screen.queryByText("Private Seoul trip")).toBeNull(); expect(refresh).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each([{ status: "loading" }, { status: "signedout" }, { provider: "clerk" }, { authUserId: null }, { userRecordId: null }, { sessionId: null }, { ownerId: null }, { accountKey: null }] as Partial<AppSessionValue>[])("requires full ready Better Auth identity %#", (change) => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); render(native(session(change))); expect(fetch).not.toHaveBeenCalled();
    });

    it("aborts late GETs and clears the previous account before new data arrives", async () => {
        const old = deferred(), next = deferred();
        const fetch = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(page()).mockReturnValueOnce(next.promise);
        vi.stubGlobal("fetch", fetch); const view = render(native());
        view.rerender(native(session({ sessionId: "second" })));
        await screen.findByRole("button", { name: /Actions for/ });
        await act(async () => old.resolve(page([{ ...row, title: "Stale secret" }])));
        expect(screen.queryByText("Stale secret")).toBeNull();
        view.rerender(native(session({ ownerId: "other", accountKey: "other" })));
        expect(screen.queryByText("Private Seoul trip")).toBeNull();
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
        await act(async () => next.resolve(page()));
        await screen.findByRole("alert");
    });

    it.each([200, 500, 401])("suppresses late DELETE %s callbacks, errors, and new-list changes", async (status) => {
        const pending = deferred();
        const fetch = vi.fn().mockResolvedValueOnce(page()).mockReturnValueOnce(pending.promise)
            .mockResolvedValueOnce(page([{ ...row, id: id2, title: "New account trip", ownerId: "other" }]));
        vi.stubGlobal("fetch", fetch); const value = session(); const view = render(native(value)); await confirm();
        view.rerender(native(session({ ownerId: "other", accountKey: "other", sessionId: "new" })));
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(screen.queryByText("Private Seoul trip")).toBeNull();
        await screen.findByRole("button", { name: "Actions for New account trip" });
        await act(async () => pending.resolve(response({ success: true }, status)));
        expect(deleted).not.toHaveBeenCalled(); expect(value.refresh).not.toHaveBeenCalled();
        expect(screen.queryByRole("alert")).toBeNull(); expect(screen.queryByText("Itinerary deleted.")).toBeNull();
        expect(screen.getByRole("button", { name: "Actions for New account trip" })).toBeTruthy();
        expect(fetch.mock.calls[1][1].signal.aborted).toBe(true); expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("cancels an open confirmation on session changes without accepting its old intent", async () => {
        const fetch = vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(page()); vi.stubGlobal("fetch", fetch);
        const view = render(native()); await menu(); fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
        const oldButton = within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" });
        view.rerender(native(session({ sessionId: "replacement" })));
        fireEvent.click(oldButton); await screen.findByRole("button", { name: /Actions for/ });
        expect(screen.queryByRole("alertdialog")).toBeNull(); expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each([response({ success: false }), response({ success: true }, 500), response({})])("retains the row after write failure and permits explicit error dismissal %#", async (failure) => {
        const fetch = vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(failure); vi.stubGlobal("fetch", fetch); render(native()); await confirm();
        expect((await screen.findByRole("alert")).textContent).toContain("Could not confirm deletion");
        expect(screen.getAllByText("Private Seoul trip").length).toBe(2);
        expect(deleted).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByRole("button", { name: "Dismiss error" })); expect(screen.queryByRole("alert")).toBeNull();
    });

    it("distinguishes successful deletion from a failed reload and clears stale pages", async () => {
        const fetch = vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(response({ success: true })).mockRejectedValueOnce(new Error("offline"));
        vi.stubGlobal("fetch", fetch); render(native()); await confirm();
        expect((await screen.findByRole("alert")).textContent).toContain("Itinerary deleted, but the list could not reload");
        expect(deleted).toHaveBeenCalledExactlyOnceWith(id);
        expect(screen.queryByText("Private Seoul trip")).toBeNull(); expect(screen.queryByText("No itineraries yet")).toBeNull();
    });

    it("discards all loaded offsets after deletion rather than presenting a partial page as complete", async () => {
        const other = { ...row, id: id2, title: "Second trip" };
        const fetch = vi.fn().mockResolvedValueOnce(page([row], 1)).mockResolvedValueOnce(page([other], 2))
            .mockResolvedValueOnce(response({ success: true })).mockResolvedValueOnce(page([other], 1));
        vi.stubGlobal("fetch", fetch); render(native());
        const more = await screen.findByRole("button", { name: "Load more" });
        await act(async () => { fireEvent.click(more); });
        await confirm();
        await screen.findByRole("button", { name: "Actions for Second trip" });
        expect(screen.queryByText("Private Seoul trip")).toBeNull();
        expect(fetch.mock.calls[3][0]).toBe("/api/itineraries?limit=25&offset=0");
        expect(screen.getByRole("textbox", { name: "Search loaded trips" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
    });

    it("cancels a pending page read before deletion and ignores its late rows", async () => {
        const pending = deferred();
        const fetch = vi.fn().mockResolvedValueOnce(page([row], 1)).mockReturnValueOnce(pending.promise)
            .mockResolvedValueOnce(response({ success: true })).mockResolvedValueOnce(page([]));
        vi.stubGlobal("fetch", fetch); render(native());
        fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
        await confirm(); await screen.findByText("No itineraries yet");
        expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
        await act(async () => pending.resolve(page([{ ...row, id: id2, title: "Late page" }])));
        expect(screen.queryByText("Late page")).toBeNull();
        expect(screen.getByText("No itineraries yet")).toBeTruthy();
        expect(deleted).toHaveBeenCalledExactlyOnceWith(id);
    });

    it.each([401, 403, 409])("refreshes identity on DELETE %s without retrying the write, even when refresh fails", async (status) => {
        const refresh = vi.fn().mockRejectedValue(new Error("offline"));
        const fetch = vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(response({}, status));
        vi.stubGlobal("fetch", fetch); render(native(session({ refresh }))); await confirm();
        await screen.findByRole("alert"); expect(refresh).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(2);
        expect(screen.queryByText("Private Seoul trip")).toBeNull(); expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(deleted).not.toHaveBeenCalled();
    });
});
