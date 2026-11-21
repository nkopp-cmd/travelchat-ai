import { describe, expect, it } from "vitest";
import { versionResponse } from "@/cloudflare/opennext/version-route";

describe("versionResponse (Worker entry /api/version)", () => {
  it("returns the build sha as JSON, never cached", async () => {
    const out = versionResponse(new Request("https://www.localley.io/api/version"), "de11d33");
    expect(out?.status).toBe(200);
    expect(out?.headers.get("cache-control")).toBe("no-store");
    expect(out?.headers.get("content-type")).toBe("application/json");
    expect(await out?.json()).toEqual({ sha: "de11d33" });
  });
  it("returns sha null when the var is missing", async () => {
    expect(await versionResponse(new Request("https://www.localley.io/api/version?x=1"), undefined)?.json()).toEqual({ sha: null });
  });
  it("HEAD has no body", async () => {
    const out = versionResponse(new Request("https://www.localley.io/api/version", { method: "HEAD" }), "abc");
    expect(out?.status).toBe(200);
    expect(await out?.text()).toBe("");
  });
  it.each([
    ["https://www.localley.io/api/version/", "GET"], ["https://www.localley.io/api/versions", "GET"],
    ["https://www.localley.io/", "GET"], ["https://www.localley.io/api/version", "POST"],
  ])("leaves %s %s to Next.js", (url, method) => {
    expect(versionResponse(new Request(url, { method }), "abc")).toBeNull();
  });
});
