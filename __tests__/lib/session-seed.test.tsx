import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SessionSeed } from "@/components/auth/session-seed";
import { useUser } from "@/lib/auth/client";
import { getSessionSnapshot, primeSession, resetSessionStore } from "@/lib/auth/session-store";

const seed = {
  user: { id: "user-1", name: "Hana Kim", email: "hana@example.com", emailVerified: true, image: null, firstName: "Hana", lastName: "Kim", bio: "<script>x</script>" },
  session: {},
};

function Who() {
  const { isLoaded, user } = useUser();
  return <p>{isLoaded ? user?.fullName ?? "signed out" : "loading"}</p>;
}

beforeEach(() => resetSessionStore());
afterEach(() => vi.unstubAllGlobals());

describe("server session seed", () => {
  it("serves the first view from the seed without a get-session request", async () => {
    const fetcher = vi.fn(async () => Response.json({ user: { id: "other" }, session: {} }));
    vi.stubGlobal("fetch", fetcher);
    render(<><SessionSeed session={seed} /><Who /></>);
    expect(await screen.findByText("Hana Kim")).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not overwrite a session the store already resolved (soft navigation)", async () => {
    const fetcher = vi.fn(async () => Response.json({ user: { id: "user-2", name: "Jun", email: "jun@example.com" }, session: {} }));
    vi.stubGlobal("fetch", fetcher);
    render(<Who />);
    expect(await screen.findByText("Jun")).toBeTruthy();
    primeSession(seed);
    expect(getSessionSnapshot().data?.user.id).toBe("user-2");
  });

  it("without a seed, fetches as before", async () => {
    const fetcher = vi.fn(async () => Response.json(null));
    vi.stubGlobal("fetch", fetcher);
    render(<><SessionSeed session={null} /><Who /></>);
    expect(await screen.findByText("signed out")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("re-checks the session when a page is restored from the back/forward cache", async () => {
    const fetcher = vi.fn(async () => Response.json(null));
    vi.stubGlobal("fetch", fetcher);
    render(<><SessionSeed session={seed} /><Who /></>);
    await screen.findByText("Hana Kim");
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(await screen.findByText("signed out")).toBeTruthy();
  });
});
