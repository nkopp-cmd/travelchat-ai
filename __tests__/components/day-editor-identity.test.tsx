import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DayEditor } from "@/components/itineraries/day-editor";

vi.mock("@/components/ui/place-autocomplete", () => ({ PlaceAutocomplete: () => null }));

it("keeps pending activity edits on the original stop when a place is inserted before it", () => {
    function Fixture() {
        const [plan, setPlan] = useState({ day: 1, activities: [{ name: "Original stop" }] });
        return <>
            <button onClick={() => setPlan((current) => ({ ...current, activities: [{ name: "Added place" }, ...current.activities] }))}>Insert place first</button>
            <DayEditor dayPlan={plan} onUpdate={setPlan} />
            <output aria-label="Activity order">{plan.activities.map((activity) => activity.name).join(" / ")}</output>
        </>;
    }
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Original stop" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Activity name" }), { target: { value: "Edited original" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert place first" }));
    expect(screen.getByDisplayValue("Edited original")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply activity changes" }));
    expect(screen.getByLabelText("Activity order").textContent).toBe("Added place / Edited original");
});
