import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ActivityEditor } from "@/components/itineraries/activity-editor";

vi.mock("@/components/ui/place-autocomplete", () => ({ PlaceAutocomplete: () => null }));

it("does not apply a blank activity name", () => {
    const onUpdate = vi.fn();
    render(<ActivityEditor index={0} activity={{ name: "Original stop" }} onUpdate={onUpdate} onDelete={vi.fn()} onDuplicate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Original stop" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Activity name" }), { target: { value: "   " } });
    const apply = screen.getByRole("button", { name: "Apply activity changes" });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Enter an activity name");
    fireEvent.click(apply);
    expect(onUpdate).not.toHaveBeenCalled();
});

it("edits the current spot after insertion changes an activity position", () => {
    const onUpdate = vi.fn();
    const props = { index: 1, onUpdate, onDelete: vi.fn(), onDuplicate: vi.fn() };
    const { rerender } = render(<ActivityEditor {...props} activity={{ name: "Existing stop" }} />);
    rerender(<ActivityEditor {...props} activity={{ name: "Added place" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Added place" }));
    expect(screen.getByDisplayValue("Added place")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply activity changes" }));
    expect(onUpdate).toHaveBeenCalledWith(1, { name: "Added place" });
});

it("keeps catalog identity fixed while allowing ordinary activity notes", () => {
    const onUpdate = vi.fn();
    const activity = { name: "Note", address: "Seoul", description: "Original notes", spotId: "aaaaaaaa-1111-4111-8111-111111111111", lat: 37.57, lng: 126.98 };
    render(<ActivityEditor index={0} activity={activity} onUpdate={onUpdate} onDelete={vi.fn()} onDuplicate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Note" }));
    expect((screen.getByRole("textbox", { name: "Activity name" }) as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByRole("textbox", { name: "Address" }) as HTMLInputElement).readOnly).toBe(true);
    fireEvent.change(screen.getByDisplayValue("Original notes"), { target: { value: "Visit in the afternoon" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply activity changes" }));
    expect(onUpdate).toHaveBeenCalledWith(0, { ...activity, description: "Visit in the afternoon" });
});
