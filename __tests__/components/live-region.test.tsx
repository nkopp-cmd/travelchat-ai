import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveRegion, useLiveAnnouncer } from "@/components/accessibility/live-region";

afterEach(() => vi.useRealTimers());

describe("LiveRegion", () => {
    it("starts empty on the server and announces after mounting", () => {
        expect(renderToString(<LiveRegion message="Saved" />)).not.toContain("Saved");
        render(<LiveRegion message="Saved" politeness="assertive" />);
        expect(screen.getByRole("status").textContent).toBe("Saved");
        expect(screen.getByRole("status").getAttribute("aria-live")).toBe("assertive");
    });

    it("replaces messages, cancels stale clearing, and permits repetition after clearing", () => {
        vi.useFakeTimers();
        const { rerender, unmount } = render(<LiveRegion message="First" />);
        act(() => vi.advanceTimersByTime(500));
        rerender(<LiveRegion message="Second" />);
        act(() => vi.advanceTimersByTime(500));
        expect(screen.getByRole("status").textContent).toBe("Second");
        act(() => vi.advanceTimersByTime(500));
        expect(screen.getByRole("status").textContent).toBe("");
        rerender(<LiveRegion message="" />);
        rerender(<LiveRegion message="Second" />);
        expect(screen.getByRole("status").textContent).toBe("Second");
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps persistent messages and restarts clearing when the delay changes", () => {
        vi.useFakeTimers();
        const { rerender } = render(<LiveRegion message="Saved" clearAfter={0} />);
        act(() => vi.advanceTimersByTime(5000));
        expect(screen.getByRole("status").textContent).toBe("Saved");
        rerender(<LiveRegion message="Saved" clearAfter={100} />);
        act(() => vi.advanceTimersByTime(100));
        expect(screen.getByRole("status").textContent).toBe("");
    });

    it("announces the same hook message again after its region clears", async () => {
        vi.useFakeTimers();
        function Announcer() {
            const { announce, LiveRegionPortal } = useLiveAnnouncer();
            return <><button onClick={() => announce("Saved")}>Announce</button><LiveRegionPortal /></>;
        }
        render(<Announcer />);
        await act(async () => fireEvent.click(screen.getByRole("button")));
        expect(screen.getByRole("status").textContent).toBe("Saved");
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.getByRole("status").textContent).toBe("");
        await act(async () => fireEvent.click(screen.getByRole("button")));
        expect(screen.getByRole("status").textContent).toBe("Saved");
    });
});
