import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItineraryEditor, type ItineraryEditorProps } from "@/components/itineraries/itinerary-editor";

function EditForm(props: Omit<ItineraryEditorProps, "onNavigate" | "saveRequest">) {
    return <ItineraryEditor {...props} onNavigate={() => {}} saveRequest={(payload, signal) => fetch(`/api/itineraries/${props.itinerary.id}/update`, {
        method: "PATCH", body: JSON.stringify(payload), signal,
    })} />;
}

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/itineraries/day-editor", () => ({ DayEditor: ({ dayPlan }: { dayPlan: unknown }) => <pre>{JSON.stringify(dayPlan)}</pre> }));
const spot = { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Cafe Onion", city: "Seoul", address: "Seoul", description: "Cafe", category: "cafe", latitude: 37.58, longitude: 126.98 };
const itinerary = { id: "trip", title: "Original", city: "Seoul", days: 1, activities: [{ day: 7, activities: [{ name: "Museum" }], localTip: "Keep this note" }], highlights: null, estimated_cost: null };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("spot editor staging and saves", () => {
    it("does not mutate on open and requires explicit day and position", () => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
        render(<EditForm itinerary={itinerary} planningSpot={spot} />);
        expect((screen.getByRole("button", { name: "Save", exact: true }) as HTMLButtonElement).disabled).toBe(true);
        const add = screen.getByRole("button", { name: "Add to draft" }) as HTMLButtonElement;
        expect(add.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("Day"), { target: { value: "7" } });
        expect(add.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("Position"), { target: { value: "0" } });
        fireEvent.click(add);
        expect(screen.getByText("This spot is already in your plan.")).toBeTruthy();
        expect(screen.getByText(/Spot added to your draft/)).toBeTruthy();
        expect(fetch).not.toHaveBeenCalled();
    });
    it("serializes saves, retains pending edits, advances raw snapshot, and re-arms autosave", async () => {
        vi.useFakeTimers();
        let finish!: (response: Response) => void;
        const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
            .mockResolvedValue(new Response(JSON.stringify({ itinerary: { ...itinerary, title: "Second" } })));
        vi.stubGlobal("fetch", fetch);
        render(<EditForm itinerary={itinerary} />);
        const title = screen.getByDisplayValue("Original");
        fireEvent.change(title, { target: { value: "First" } });
        fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
        fireEvent.change(title, { target: { value: "Second" } });
        await act(async () => { await vi.advanceTimersByTimeAsync(31000); });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetch.mock.calls[0][1].body).expected).toEqual({ title: "Original", city: "Seoul", activities: itinerary.activities, highlights: null, estimated_cost: null });
        await act(async () => { finish(new Response(JSON.stringify({ itinerary: { ...itinerary, title: "First", activities: [{ day: 7, activities: [] }] } }))); });
        expect(screen.getByText("Unsaved changes")).toBeTruthy();
        const unload = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(true);
        await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
        expect(fetch).toHaveBeenCalledTimes(2);
        const second = JSON.parse(fetch.mock.calls[1][1].body);
        expect(second.title).toBe("Second");
        expect(second.expected.title).toBe("First");
        expect(second.expected.activities).toEqual([{ day: 7, activities: [] }]);
        expect(screen.queryByText("Unsaved changes")).toBeNull();
    });
    it.each([409, 428])("retains draft and stops all retries after %s", async (status) => {
        vi.useFakeTimers();
        const fetch = vi.fn().mockResolvedValue(new Response("{}", { status }));
        vi.stubGlobal("fetch", fetch);
        render(<EditForm itinerary={itinerary} />);
        fireEvent.change(screen.getByDisplayValue("Original"), { target: { value: "Keep my draft" } });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save", exact: true })); });
        expect(screen.getByRole("alert").textContent).toContain("Automatic saving has stopped");
        expect(screen.getByDisplayValue("Keep my draft")).toBeTruthy();
        await act(async () => { await vi.advanceTimersByTimeAsync(90000); });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect((screen.getByRole("button", { name: "Save", exact: true }) as HTMLButtonElement).disabled).toBe(true);
    });
});
