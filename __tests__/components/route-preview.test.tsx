import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoutePreview } from "@/components/itineraries/wizard/route-preview";

const wizard = vi.hoisted(() => ({
  data: {
    citySlugs: ["seoul", "busan"], days: 7, budget: "moderate", pace: "moderate",
    groupType: "solo", interests: ["food"],
    cityNameBySlug: { seoul: "Seoul", busan: "Busan" },
  },
}));
vi.mock("@/components/itineraries/wizard/wizard-context", () => ({ useWizard: () => wizard }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const success = {
  ok: true,
  preview: {
    stops: [{ position: 0, destinationSlug: "seoul", nights: 3, dayIndexes: [0, 1, 2] }],
    transfers: [], warnings: [],
  },
};
const response = (body: unknown) => ({ json: async () => body }) as Response;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  wizard.data = { ...wizard.data, citySlugs: ["seoul", "busan"], days: 7 };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("RoutePreview", () => {
  it("shows loading immediately and debounces only the latest selection", async () => {
    fetchMock.mockResolvedValue(response(success));
    const { rerender } = render(<RoutePreview />);
    expect(screen.getByText(/Optimizing route/)).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(399));
    expect(fetchMock).not.toHaveBeenCalled();
    wizard.data = { ...wizard.data, days: 8 };
    rerender(<RoutePreview />);
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).totalDays).toBe(8);
    expect(screen.getByText("Seoul")).toBeTruthy();
    expect(screen.queryByText(/Optimizing route/)).toBeNull();
  });

  it("hides completed data when a new request starts and displays API errors", async () => {
    fetchMock.mockResolvedValueOnce(response(success))
      .mockResolvedValueOnce(response({ ok: false, error: { message: "Route unavailable" } }));
    const { rerender } = render(<RoutePreview />);
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(screen.getByText("Seoul")).toBeTruthy();
    wizard.data = { ...wizard.data, days: 8 };
    rerender(<RoutePreview />);
    expect(screen.queryByText("Seoul")).toBeNull();
    expect(screen.getByText(/Optimizing route/)).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(screen.getByText("Route unavailable")).toBeTruthy();
    expect(screen.queryByText(/Optimizing route/)).toBeNull();
  });

  it.each(["success", "failure"])("ignores stale %s even when the selection returns to the original request", async (outcome) => {
    const stale = deferred<Response>();
    const current = deferred<Response>();
    fetchMock.mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
    const { rerender } = render(<RoutePreview />);
    await act(() => vi.advanceTimersByTimeAsync(400));
    wizard.data = { ...wizard.data, days: 8 };
    rerender(<RoutePreview />);
    wizard.data = { ...wizard.data, days: 7 };
    rerender(<RoutePreview />);
    await act(() => vi.advanceTimersByTimeAsync(400));
    await act(async () => {
      if (outcome === "success") stale.resolve(response(success));
      else stale.reject(new Error("stale failure"));
    });
    expect(screen.getByText(/Optimizing route/)).toBeTruthy();
    expect(screen.queryByText("Seoul")).toBeNull();
    expect(screen.queryByText("Could not load the route preview.")).toBeNull();
    await act(async () => current.reject(new Error("offline")));
    expect(screen.getByText("Could not load the route preview.")).toBeTruthy();
    expect(screen.queryByText(/Optimizing route/)).toBeNull();
  });

  it("cancels pending work for invalid selections and retries when valid again", async () => {
    fetchMock.mockResolvedValue(response(success));
    const { rerender, unmount } = render(<RoutePreview />);
    wizard.data = { ...wizard.data, days: 3 };
    rerender(<RoutePreview />);
    expect(screen.getByText(/Add days or remove a city/)).toBeTruthy();
    expect(screen.queryByText(/Optimizing route/)).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(fetchMock).not.toHaveBeenCalled();
    wizard.data = { ...wizard.data, days: 7 };
    rerender(<RoutePreview />);
    expect(screen.getByText(/Optimizing route/)).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(screen.getByText("Seoul")).toBeTruthy();
    wizard.data = { ...wizard.data, days: 8 };
    rerender(<RoutePreview />);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders nothing and sends no request for fewer than two cities", async () => {
    wizard.data = { ...wizard.data, citySlugs: ["seoul"] };
    const { container } = render(<RoutePreview />);
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
