import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ candidate: true, error: "Failed to fetch notifications", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/hooks/use-notifications", () => ({ useNotifications: () => ({ isPreviewCandidate: mocks.candidate,
  error: mocks.error, notifications: [], unreadCount: 0, isLoading: false, hasMore: false }) }));
vi.mock("@/lib/notifications", () => ({ getNotificationMeta: vi.fn(), getNotificationUrl: vi.fn() }));
import { NotificationCenter } from "@/components/notifications/notification-center";
beforeEach(() => { mocks.candidate = true; mocks.error = "Failed to fetch notifications"; vi.clearAllMocks(); });
afterEach(cleanup);
describe("candidate inbox honest state", () => {
  it("shows unavailable instead of an empty inbox after candidate refusal", () => {
    render(<NotificationCenter />); fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByRole("status").textContent).toContain("currently unavailable");
    expect(screen.queryByText("No notifications yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Notification settings" }));
    expect(mocks.push).toHaveBeenCalledWith("/settings?data_candidate=d1");
  });
  it("reports normal storage failure and preserves the settings URL", () => {
    mocks.candidate = false; render(<NotificationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByText("No notifications yet")).toBeNull(); expect(screen.getByRole("status").textContent).toContain("currently unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Notification settings" })); expect(mocks.push).toHaveBeenCalledWith("/settings");
  });
});
