import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewBillingSummary } from "@/components/settings/preview-billing-summary";
const summary = { plan: "Pro", status: "Trial", periodEnd: "2026-11-01", trialEnd: "2026-10-10", cancelAtPeriodEnd: true,
  usage: [{ label: "AI images this month", used: 6, limit: 100, percent: 6 }] };
afterEach(cleanup);
describe("read-only preview billing card", () => {
  it("shows plan, dates, cancellation and labeled usage without payment controls", () => {
    render(<PreviewBillingSummary summary={summary} />);
    expect(screen.getByText("Pro")).not.toBeNull(); expect(screen.getByText("Trial")).not.toBeNull();
    expect(screen.getByText("Subscription ends: 2026-11-01 (UTC)")).not.toBeNull();
    expect(screen.getByText("Trial ends: 2026-10-10 (UTC)")).not.toBeNull();
    expect(screen.getByText("6 / 100")).not.toBeNull(); expect(screen.getByRole("progressbar", { name: "AI images this month" })).not.toBeNull();
    expect(screen.getByRole("progressbar", { name: "AI images this month" }).getAttribute("aria-valuenow")).toBe("6");
    expect(screen.queryByRole("button")).toBeNull(); expect(screen.queryByRole("link")).toBeNull();
  });
  it("keeps unavailable distinct from a free plan and never leaks storage errors", () => {
    render(<PreviewBillingSummary summary={null} />); expect(screen.getByRole("status").textContent).toBe("Preview billing is unavailable for this account."); expect(screen.queryByText("No paid plan")).toBeNull();
  });
});
