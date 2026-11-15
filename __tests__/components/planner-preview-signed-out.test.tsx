import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
const auth = { isLoaded: true, isSignedIn: false, userId: null as string | null, signOut: vi.fn() };
vi.mock("@/lib/auth/client", () => ({ useAuth: () => auth }));

import { PlannerCitiesContext } from "@/components/itineraries/wizard/planner-cities-context";
import { StepDestination } from "@/components/itineraries/wizard/step-destination";
import { WizardProvider } from "@/components/itineraries/wizard/wizard-context";

const cities = [{ slug: "seoul", name: "Seoul", emoji: "*", spotCount: 386, status: "recommended" as const }];

function renderStep() {
  return render(
    <PlannerCitiesContext.Provider value={cities}>
      <WizardProvider><StepDestination /></WizardProvider>
    </PlannerCitiesContext.Provider>,
  );
}

const previewCalls = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/api/v2/trips/preview"));

afterEach(() => vi.unstubAllGlobals());

describe("planner multi-city probe", () => {
  it("sends no preview request for a signed-out visitor (the API answers 401)", async () => {
    Object.assign(auth, { isLoaded: true, isSignedIn: false });
    const fetcher = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    renderStep();
    expect(screen.getByText("Seoul")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(previewCalls(fetcher)).toEqual([]);
  });

  it("sends no preview request while the session is still loading", async () => {
    Object.assign(auth, { isLoaded: false, isSignedIn: false });
    const fetcher = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    renderStep();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(previewCalls(fetcher)).toEqual([]);
  });

  it("still asks once for a signed-in visitor", async () => {
    Object.assign(auth, { isLoaded: true, isSignedIn: true });
    const fetcher = vi.fn(async () => Response.json({ enabled: true, network: null }));
    vi.stubGlobal("fetch", fetcher);
    renderStep();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(previewCalls(fetcher)).toEqual(["/api/v2/trips/preview"]);
  });
});
