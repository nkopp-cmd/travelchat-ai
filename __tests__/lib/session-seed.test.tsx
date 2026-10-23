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

beforeEach(() => { resetSessionStore(); document.head.querySelectorAll('meta[name="localley-session"]').forEach((m) => m.remove()); });
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

  it("uses the seed tag of a page whose content hydrates after the navbar subscribes (loading boundary)", async () => {
    const fetcher = vi.fn(async () => Response.json({ user: { id: "other" }, session: {} }));
    vi.stubGlobal("fetch", fetcher);
    const meta = document.createElement("meta");
    meta.name = "localley-session";
    meta.content = JSON.stringify(seed);
    document.head.append(meta);
    render(<Who />);
    expect(await screen.findByText("Hana Kim")).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("renders the seed tag with React-escaped content and ignores a malformed tag", async () => {
    const { container } = render(<SessionSeed session={seed} />);
    const tag = document.querySelector('meta[name="localley-session"]') ?? container.querySelector("meta");
    expect(JSON.parse(tag!.getAttribute("content")!)).toEqual(seed);
    resetSessionStore();
    document.querySelectorAll('meta[name="localley-session"]').forEach((m) => { m.setAttribute("content", "{not json"); });
    const fetcher = vi.fn(async () => Response.json(null));
    vi.stubGlobal("fetch", fetcher);
    render(<Who />);
    expect(await screen.findByText("signed out")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  describe("while the document is still streaming", () => {
    const streaming = () => Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
    afterEach(() => { delete (document as unknown as { readyState?: string }).readyState; });

    it("waits for the rest of the document and then uses the late seed tag without a request", async () => {
      streaming();
      const fetcher = vi.fn(async () => Response.json({ user: { id: "other" }, session: {} }));
      vi.stubGlobal("fetch", fetcher);
      render(<Who />);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fetcher).not.toHaveBeenCalled();
      const meta = document.createElement("meta");
      meta.name = "localley-session";
      meta.content = JSON.stringify(seed);
      document.head.append(meta);
      delete (document as unknown as { readyState?: string }).readyState;
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect(await screen.findByText("Hana Kim")).toBeTruthy();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("fetches once the document is complete when no seed arrived", async () => {
      streaming();
      const fetcher = vi.fn(async () => Response.json(null));
      vi.stubGlobal("fetch", fetcher);
      render(<><Who /><Who /></>);
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect((await screen.findAllByText("signed out")).length).toBe(2);
      expect(fetcher).toHaveBeenCalledOnce();
    });
  });
});
