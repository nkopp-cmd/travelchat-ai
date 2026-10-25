import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({ state: { isLoaded: true, isSignedIn: false } }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => auth.state }));

import { SpotActivities, getSpotActivitiesCopy } from "@/components/spots/spot-activities";

describe("SpotActivities", () => {
  it("describes Viator results as city-level instead of exact nearby picks", () => {
    expect(getSpotActivitiesCopy("Seoul", "Gwangjang Market")).toEqual({
      heading: "Bookable activities in Seoul",
      loadingDescription:
        "Finding city-level tours that can pair with Gwangjang Market.",
      description:
        "These are city-level tours and activities around Seoul, not exact walking-distance picks from Gwangjang Market.",
    });
  });
});

describe("SpotActivities requests", () => {
  afterEach(() => { vi.unstubAllGlobals(); auth.state = { isLoaded: true, isSignedIn: false }; });

  it("makes no Viator request for signed-out visitors and renders nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    auth.state = { isLoaded: true, isSignedIn: false };
    const { container } = render(<SpotActivities spotId="s1" city="Seoul" spotName="Gwangjang Market" />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches activities for signed-in users", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { activities: [] } })));
    vi.stubGlobal("fetch", fetchMock);
    auth.state = { isLoaded: true, isSignedIn: true };
    render(<SpotActivities spotId="s1" city="Seoul" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/viator/search", expect.objectContaining({ method: "POST" })));
  });
});
