import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerPaidReturn } from "@/components/itineraries/planner-paid-return";
import { PAID_RETURN_DELAY_MS, PAID_RETURN_MAX } from "@/lib/trips/paid-return";

// Push BY3: the planner note after a checkout started at the planner limit.
const setUrl = (path: string) => window.history.replaceState(null, "", path);
function stubStatus(tiers: (string | null)[]) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const tier = tiers[Math.min(call++, tiers.length - 1)];
    return tier === null ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ tier }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
async function flush(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

beforeEach(() => { vi.useFakeTimers(); setUrl("/itineraries/new"); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("planner paid return (Push BY3)", () => {
  it("shows Pro is active only after the plan reads paid, then drops the parameter", async () => {
    setUrl("/itineraries/new?payment=success&city=seoul");
    const fetchMock = stubStatus(["free", "pro"]);
    render(<PlannerPaidReturn />);
    await flush();
    expect(screen.queryByTestId("planner-paid-return")).toBeNull(); // first read is still free
    expect(window.location.search).toBe("?payment=success&city=seoul");
    await flush(PAID_RETURN_DELAY_MS);
    const note = screen.getByTestId("planner-paid-return");
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toBe("Pro is active. Plan your next trip.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => url === "/api/subscription/status")).toBe(true);
    expect(window.location.search).toBe("?city=seoul");
  });
  it("after the bounded re-reads it says payment is received, never that Pro is active", async () => {
    setUrl("/itineraries/new?payment=success");
    const fetchMock = stubStatus(["free", null]);
    render(<PlannerPaidReturn />);
    await flush(PAID_RETURN_DELAY_MS * PAID_RETURN_MAX);
    expect(fetchMock).toHaveBeenCalledTimes(PAID_RETURN_MAX);
    const note = screen.getByTestId("planner-paid-return");
    expect(note.textContent).toContain("Payment received.");
    expect(note.textContent).not.toContain("Pro is active");
    expect(window.location.search).toBe("");
    await flush(PAID_RETURN_DELAY_MS * 5);
    expect(fetchMock).toHaveBeenCalledTimes(PAID_RETURN_MAX); // stops, no more reads
  });
  it.each(["/itineraries/new", "/itineraries/new?payment=canceled", "/itineraries/new?payment=successx"])("shows nothing and reads nothing on %s", async (path) => {
    setUrl(path);
    const fetchMock = stubStatus(["pro"]);
    render(<PlannerPaidReturn />);
    await flush(PAID_RETURN_DELAY_MS * PAID_RETURN_MAX);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("planner-paid-return")).toBeNull();
    expect(window.location.pathname + window.location.search).toBe(path);
  });
  it("stops reading when the planner closes", async () => {
    setUrl("/itineraries/new?payment=success");
    const fetchMock = stubStatus(["free"]);
    const { unmount } = render(<PlannerPaidReturn />);
    await flush();
    unmount();
    await flush(PAID_RETURN_DELAY_MS * PAID_RETURN_MAX);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?payment=success");
  });
});
