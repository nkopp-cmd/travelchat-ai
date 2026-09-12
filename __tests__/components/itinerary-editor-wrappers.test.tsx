import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditForm } from "@/components/itineraries/edit-form";
import { NativeItineraryEditor } from "@/components/itineraries/native-itinerary-editor";
import { AppSessionProvider } from "@/providers/app-session-provider";
import type { AppSessionValue } from "@/lib/auth/session-contract";

const { toast, push } = vi.hoisted(() => ({ toast: vi.fn(), push: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/itineraries/day-editor", () => ({ DayEditor: ({ dayPlan }: { dayPlan: unknown }) => <pre>{JSON.stringify(dayPlan)}</pre> }));
const row = { id: "trip", ownerId: "owner", clerk_user_id: "owner", title: "Private trip", city: "Seoul", days: 1,
    activities: { dailyPlans: [{ day: 7, theme: "Culture", activities: [{ name: "Museum" }], localTip: "Keep this note" }] },
    highlights: null, estimated_cost: null };
const session = (changes: Partial<AppSessionValue> = {}): AppSessionValue => ({ status: "ready", provider: "better-auth",
    ownerId: "owner", accountKey: "account", sessionId: "session", authUserId: "auth", userRecordId: "profile",
    canBookmark: false, refresh: vi.fn().mockResolvedValue(undefined), requestSignIn: vi.fn(), ...changes });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const deferred = () => {
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>((done) => { resolve = done; });
    return { promise, resolve };
};
function native(value = session(), id = "trip") {
    return <AppSessionProvider value={value}><NativeItineraryEditor id={id} onNavigate={push} /></AppSessionProvider>;
}
function next(value = session({ provider: "clerk" }), itinerary = row) {
    return <AppSessionProvider value={value}><EditForm itinerary={itinerary} /></AppSessionProvider>;
}
async function editAndSave() {
    fireEvent.change(screen.getByDisplayValue("Private trip"), { target: { value: "My draft" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save", exact: true })); });
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("Next editor owner gate", () => {
    it("shows and saves only a ready Clerk owner's server row", async () => {
        const fetch = vi.fn().mockResolvedValue(response({ itinerary: row })); vi.stubGlobal("fetch", fetch);
        render(next());
        await editAndSave();
        expect(fetch).toHaveBeenCalledWith("/api/itineraries/trip/update", expect.objectContaining({ method: "PATCH", signal: expect.any(AbortSignal) }));
    });
    it.each(["loading", "signedout", "blocked"] as const)("hides server data for %s", (status) => {
        render(next(session({ provider: "clerk", status })));
        expect(screen.queryByDisplayValue("Private trip")).toBeNull();
    });
    it("rejects a missing or different owner and hides drafts immediately on account changes", () => {
        const view = render(next());
        fireEvent.change(screen.getByDisplayValue("Private trip"), { target: { value: "Secret draft" } });
        view.rerender(next(session({ provider: "clerk", ownerId: "other", accountKey: "other" })));
        expect(screen.queryByDisplayValue("Secret draft")).toBeNull();
        expect(screen.getByRole("alert")).toBeTruthy();
        view.rerender(next(session({ provider: "clerk" }), { ...row, clerk_user_id: "" }));
        expect(screen.queryByDisplayValue("Private trip")).toBeNull();
    });
});

describe("native existing editor integration", () => {
    it("uses the same canonical itinerary for an uppercase UUID", async () => {
        const id = "aaaaaaaa-1111-4111-8111-111111111111";
        const fetch = vi.fn().mockResolvedValue(response({ ...row, id }));
        vi.stubGlobal("fetch", fetch);
        render(native(session(), id.toUpperCase()));
        await screen.findByDisplayValue("Private trip");
        expect(fetch).toHaveBeenCalledWith(`/api/itineraries/${id}`, expect.any(Object));
    });
    it("supports persisted JSON strings while preserving the raw expected snapshot", async () => {
        const activities = JSON.stringify(row.activities);
        const fetch = vi.fn().mockResolvedValueOnce(response({ ...row, activities }))
            .mockResolvedValueOnce(response({ itinerary: { ...row, title: "My draft" } }));
        vi.stubGlobal("fetch", fetch); render(native());
        await screen.findByDisplayValue("Private trip");
        await editAndSave();
        expect(JSON.parse(fetch.mock.calls[1][1].body).expected.activities).toBe(activities);
    });
    it("loads decoded owned data without canBookmark and sends cookies, session, and the current raw snapshot", async () => {
        const saved = { ...row, title: "My draft", activities: [{ day: 7, activities: [] }] };
        const fetch = vi.fn().mockResolvedValueOnce(response(row)).mockResolvedValueOnce(response({ itinerary: saved }))
            .mockResolvedValueOnce(response({ itinerary: { ...saved, title: "Again" } }));
        vi.stubGlobal("fetch", fetch); render(native());
        await screen.findByDisplayValue("Private trip");
        expect(screen.getByText(/Museum/)).toBeTruthy();
        await editAndSave();
        const options = fetch.mock.calls[1][1];
        expect(options).toMatchObject({ method: "PATCH", credentials: "same-origin", redirect: "error", headers: { "x-localley-session-id": "session" } });
        expect(JSON.parse(options.body).expected).toEqual({ title: row.title, city: row.city, activities: row.activities, highlights: null, estimated_cost: null });
        fireEvent.change(screen.getByDisplayValue("My draft"), { target: { value: "Again" } });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save", exact: true })); });
        expect(JSON.parse(fetch.mock.calls[2][1].body).expected.activities).toEqual(saved.activities);
    });
    it.each([
        { ...row, id: "wrong" }, { ...row, ownerId: "other" }, { ...row, title: {} }, { ...row, days: "1" },
        { ...row, highlights: [1] }, { ...row, estimated_cost: 4 }, { ...row, activities: "not JSON" },
        { ...row, activities: [{ day: 1, activities: [null] }] },
        { ...row, activities: JSON.stringify([{ day: 1, activities: [], extra: Array.from({ length: 70 }).reduce<Record<string, unknown>>((value) => ({ nested: value }), {}) }]) },
        { ...row, activities: [{ day: 1, activities: [{ name: "Museum", address: {} }] }] },
        { itinerary: row }, null,
    ])("fails closed for invalid or foreign DTO %#", async (body) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body))); render(native());
        await screen.findByRole("alert"); expect(screen.queryByDisplayValue("Private trip")).toBeNull();
    });
    it.each(["loading", "signedout", "blocked", "unlinked"] as const)("does not load for %s", (status) => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); render(native(session({ status })));
        expect(fetch).not.toHaveBeenCalled();
    });
    it("does not expose foreign 404 response details", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(row, 404))); render(native());
        expect((await screen.findByRole("alert")).textContent).toBe("This itinerary is not available.");
        expect(screen.queryByText(/Private trip/)).toBeNull();
    });
    it("ignores old GETs and hides an existing draft while another account loads", async () => {
        const old = deferred(), pending = deferred();
        const fetch = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(row)).mockReturnValueOnce(pending.promise);
        vi.stubGlobal("fetch", fetch); const view = render(native());
        view.rerender(native(session({ sessionId: "new-session" })));
        await screen.findByDisplayValue("Private trip");
        await act(async () => { old.resolve(response({ ...row, title: "Stale trip" })); });
        expect(screen.queryByDisplayValue("Stale trip")).toBeNull();
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
        fireEvent.change(screen.getByDisplayValue("Private trip"), { target: { value: "Secret draft" } });
        view.rerender(native(session({ ownerId: "other", accountKey: "other" })));
        expect(screen.queryByDisplayValue("Secret draft")).toBeNull();
        expect(screen.getByRole("status").textContent).toBe("Loading itinerary...");
        await act(async () => { pending.resolve(response(row)); });
        expect(screen.getByRole("alert")).toBeTruthy();
    });
    it.each([200, 500])("aborts old saves and suppresses late %s toasts and navigation", async (status) => {
        const pending = deferred();
        const fetch = vi.fn().mockResolvedValueOnce(response(row)).mockReturnValueOnce(pending.promise);
        vi.stubGlobal("fetch", fetch); const view = render(native());
        await screen.findByDisplayValue("Private trip"); await editAndSave();
        view.unmount();
        expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
        await act(async () => { pending.resolve(response({ itinerary: row }, status)); });
        expect(toast).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
    });
    it("aborts a pending save on account switch while the next read stays pending", async () => {
        const pending = deferred(), read = deferred();
        const fetch = vi.fn().mockResolvedValueOnce(response(row)).mockReturnValueOnce(pending.promise).mockReturnValueOnce(read.promise);
        vi.stubGlobal("fetch", fetch); const view = render(native());
        await screen.findByDisplayValue("Private trip"); await editAndSave();
        view.rerender(native(session({ ownerId: "other", accountKey: "other" })));
        expect(screen.queryByDisplayValue("My draft")).toBeNull();
        expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
        await act(async () => { pending.resolve(response({ itinerary: row })); });
        expect(toast).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
        expect(screen.getByRole("status").textContent).toBe("Loading itinerary...");
    });
    it("fences a requested trip change and aborts its pending read on unmount", async () => {
        const pending = deferred();
        const fetch = vi.fn().mockResolvedValueOnce(response(row)).mockReturnValueOnce(pending.promise);
        vi.stubGlobal("fetch", fetch); const view = render(native());
        await screen.findByDisplayValue("Private trip");
        view.rerender(native(session(), "different"));
        expect(screen.queryByDisplayValue("Private trip")).toBeNull();
        expect(fetch.mock.calls[1][0]).toBe("/api/itineraries/different");
        view.unmount(); expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
        await act(async () => { pending.resolve(response(row)); });
        expect(toast).not.toHaveBeenCalled();
    });
    it("guards late response decoding after unmount", async () => {
        const cancel = vi.fn();
        const result = new Response(new ReadableStream({ cancel }));
        const fetch = vi.fn().mockResolvedValueOnce(response(row)).mockResolvedValueOnce(result);
        vi.stubGlobal("fetch", fetch); const view = render(native());
        await screen.findByDisplayValue("Private trip"); await editAndSave();
        view.unmount();
        await act(async () => {});
        expect(cancel).toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
    });
    it.each(["headers", "body"])("times out stalled GET %s and permits a manual read", async (phase) => {
        vi.useFakeTimers();
        const fetch = vi.fn().mockImplementationOnce(() => phase === "headers" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream())))
            .mockResolvedValueOnce(response(row));
        vi.stubGlobal("fetch", fetch); render(native());
        await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
        expect(screen.getByRole("alert").textContent).toContain("timed out");
        await act(async () => { fireEvent.click(screen.getByText("Retry loading itinerary")); });
        expect(screen.getByDisplayValue("Private trip")).toBeTruthy();
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it.each(["headers", "body"])("keeps the draft after stalled PATCH %s without autosave replay", async (phase) => {
        const fetch = vi.fn().mockResolvedValueOnce(response(row)).mockImplementationOnce(() => phase === "headers"
            ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream())));
        vi.stubGlobal("fetch", fetch); render(native()); await screen.findByDisplayValue("Private trip");
        vi.useFakeTimers(); await editAndSave();
        await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
        expect(screen.getByDisplayValue("My draft")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("may have reached the server");
        expect(screen.getByRole("alert").textContent).toContain("Automatic saving has stopped");
        expect(screen.getByRole("button", { name: "Save", exact: true }).hasAttribute("disabled")).toBe(false);
        await act(async () => { await vi.advanceTimersByTimeAsync(90000); });
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it("cannot repaint an old editor when the account changes just before its save deadline", async () => {
        const fetch = vi.fn().mockResolvedValueOnce(response(row)).mockImplementationOnce(() => new Promise(() => {}))
            .mockResolvedValueOnce(response({ ...row, ownerId: "other", title: "Other account" }));
        vi.stubGlobal("fetch", fetch); const view = render(native()); await screen.findByDisplayValue("Private trip");
        vi.useFakeTimers(); await editAndSave();
        await act(async () => { await vi.advanceTimersByTimeAsync(19000); });
        await act(async () => { view.rerender(native(session({ ownerId: "other", accountKey: "other" }))); });
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(screen.getByDisplayValue("Other account")).toBeTruthy();
        expect(screen.queryByDisplayValue("My draft")).toBeNull(); expect(screen.queryByRole("alert")).toBeNull();
        expect(toast).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
    });
    it.each([401, 403, 409])("refreshes GET identity faults %s without showing response data", async (status) => {
        const value = session(); const fetch = vi.fn().mockResolvedValue(response({ ...row, error: { code: "session_changed" } }, status));
        vi.stubGlobal("fetch", fetch); render(native(value)); await screen.findByRole("alert");
        expect(value.refresh).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
        expect(screen.queryByDisplayValue("Private trip")).toBeNull();
    });
    it("retains a 409 snapshot draft without refresh or autosave replay", async () => {
        const value = session(); const fetch = vi.fn().mockResolvedValueOnce(response(row)).mockResolvedValue(response({ error: "Itinerary changed" }, 409));
        vi.stubGlobal("fetch", fetch); render(native(value)); await screen.findByDisplayValue("Private trip");
        vi.useFakeTimers(); await editAndSave();
        expect(screen.getByDisplayValue("My draft")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("Automatic saving has stopped");
        await act(async () => { await vi.advanceTimersByTimeAsync(90000); });
        expect(fetch).toHaveBeenCalledTimes(2); expect(value.refresh).not.toHaveBeenCalled();
    });
    it.each([401, 403, 409])("refreshes identity for a session fault %s without replay", async (status) => {
        const value = session(); const fetch = vi.fn().mockResolvedValueOnce(response(row)).mockResolvedValue(response({ error: { code: "session_changed" } }, status));
        vi.stubGlobal("fetch", fetch); render(native(value)); await screen.findByDisplayValue("Private trip"); await editAndSave();
        expect(value.refresh).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(2);
        expect(screen.queryByDisplayValue("My draft")).toBeNull();
        expect(screen.getByRole("alert").textContent).toContain("editor closed");
        expect(toast).not.toHaveBeenCalled();
    });
});
