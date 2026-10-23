import { describe, expect, it, vi } from "vitest";
import { APEX_REDIRECT_SCRIPT } from "@/lib/canonical-host";

function run(href: string) {
  const url = new URL(href);
  const location = { hostname: url.hostname, pathname: url.pathname, search: url.search, hash: url.hash, replace: vi.fn() };
  new Function("location", APEX_REDIRECT_SCRIPT)(location);
  return location.replace;
}

describe("apex redirect for static public pages", () => {
  it("sends apex visitors to the same path, query and hash on www", () => {
    expect(run("https://localley.io/itineraries/new?city=Seoul#top")).toHaveBeenCalledWith("https://www.localley.io/itineraries/new?city=Seoul#top");
    expect(run("https://localley.io/")).toHaveBeenCalledWith("https://www.localley.io/");
  });

  it("leaves www, preview and local hosts alone", () => {
    for (const href of ["https://www.localley.io/", "https://next.localley.io/", "http://localhost:3119/pricing"]) {
      expect(run(href)).not.toHaveBeenCalled();
    }
  });
});
