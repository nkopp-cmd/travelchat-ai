import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ItineraryList } from "@/components/itineraries/itinerary-list";

const mocks = vi.hoisted(() => ({ duplicate: vi.fn(), remove: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/use-queries", () => ({
    useDuplicateItinerary: () => ({ mutate: mocks.duplicate, isPending: false }),
    useDeleteItinerary: () => ({ mutate: mocks.remove, isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
const row = { id: "trip", title: "Seoul weekend", city: "Seoul", days: 2, local_score: 8, created_at: "2026-09-01" };
beforeEach(() => vi.clearAllMocks());
async function menu() {
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Seoul weekend" }), { key: "Enter" });
    await screen.findByRole("menuitem", { name: "Duplicate" });
}

it("retains Next navigation, create actions, and legacy duplication through the real collection", async () => {
    mocks.duplicate.mockImplementation((_id, options) => options.onSuccess({ ...row, id: "copy", title: "Copied trip", localScore: 7, createdAt: "2026-09-02" }));
    render(<ItineraryList initialItineraries={[row]} />);
    expect(screen.getByRole("link", { name: /Create New Itinerary/ }).getAttribute("href")).toBe("/itineraries/new");
    await menu();
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" })); });
    expect(mocks.duplicate).toHaveBeenCalledWith("trip", expect.any(Object));
    expect(screen.getByRole("button", { name: "Actions for Copied trip" })).toBeTruthy();
    expect(screen.getByText("7/10")).toBeTruthy();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Itinerary duplicated" }));
});

it.each([true, false])("keeps legacy delete success/error behavior through confirmation: success=%s", async (success) => {
    mocks.remove.mockImplementation((_id, options) => success ? options.onSuccess() : options.onError(new Error("DB failed")));
    render(<ItineraryList initialItineraries={[row]} />); await menu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Delete", exact: true })); });
    expect(mocks.remove).toHaveBeenCalledWith("trip", expect.any(Object));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    if (success) expect(screen.getByText("No itineraries yet")).toBeTruthy();
    else expect(screen.getByRole("button", { name: "Actions for Seoul weekend" })).toBeTruthy();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: success ? "Itinerary deleted" : "Failed to delete" }));
});

it("retains search, grid/list selection, duration controls, and sort options", async () => {
    render(<ItineraryList initialItineraries={[row, { ...row, id: "other", title: "Tokyo trip", city: "Tokyo", days: 4 }]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search itineraries" }), { target: { value: "Tokyo" } });
    expect(screen.queryByText("Seoul weekend")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(screen.getByRole("button", { name: "Filters" }), { key: "Enter" });
    expect(await screen.findByText("Duration")).toBeTruthy();
    expect(screen.getByText("Sort by")).toBeTruthy();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
});
