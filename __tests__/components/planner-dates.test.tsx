import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WizardProvider, useWizard } from "@/components/itineraries/wizard/wizard-context";
import { StepDuration } from "@/components/itineraries/wizard/step-duration";

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ value, onValueChange, ...props }: { value: number[]; onValueChange: (value: number[]) => void }) =>
    <input type="range" value={value[0]} onChange={event => onValueChange([Number(event.target.value)])} {...props} />,
}));
function Values() { return <pre data-testid="values">{JSON.stringify(useWizard().data)}</pre>; }

describe("optional planner dates", () => {
  it("updates the inclusive date range when the start or length changes", () => {
    render(<WizardProvider><StepDuration /><Values /></WizardProvider>);
    fireEvent.change(screen.getByLabelText("Start date (optional)"), { target: { value: "2026-12-30" } });
    expect(screen.getByRole("status").textContent).toBe("Dec 30, 2026 to Jan 1, 2027 · 3 days");
    fireEvent.change(screen.getByRole("slider", { name: "Trip duration in days" }), { target: { value: "2" } });
    expect(screen.getByRole("status").textContent).toBe("Dec 30, 2026 to Dec 31, 2026 · 2 days");
    expect(JSON.parse(screen.getByTestId("values").textContent!).startDate).toBe("2026-12-30");
  });
  it("lets a visitor leave dates flexible and clear a chosen date", () => {
    render(<WizardProvider initialData={{ startDate: "2026-12-30" }}><StepDuration /><Values /></WizardProvider>);
    fireEvent.change(screen.getByLabelText("Start date (optional)"), { target: { value: "" } });
    expect(screen.getByRole("status").textContent).toContain("Dates flexible?");
    expect(JSON.parse(screen.getByTestId("values").textContent!).startDate).toBeUndefined();
  });
});
