import { describe, expect, it } from "vitest";
import { withHostRobots } from "@/cloudflare/opennext/robots-host";

const res = () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html", "cache-control": "public, max-age=60" } });

describe("withHostRobots", () => {
  it("leaves the canonical host untouched", async () => {
    const out = withHostRobots(new Request("https://www.localley.io/spots"), res());
    expect(out.headers.get("x-robots-tag")).toBeNull();
  });

  it.each(["https://next.localley.io/spots", "https://localley.io/", "https://localley.nkopp.workers.dev/blog"])(
    "adds noindex on %s and keeps status, body and headers", async (url) => {
      const out = withHostRobots(new Request(url), res());
      expect(out.headers.get("x-robots-tag")).toBe("noindex");
      expect(out.status).toBe(200);
      expect(out.headers.get("cache-control")).toBe("public, max-age=60");
      expect(await out.text()).toBe("<html></html>");
    });

  it("keeps redirects intact", () => {
    const out = withHostRobots(new Request("https://localley.io/x"), Response.redirect("https://www.localley.io/x", 308));
    expect(out.status).toBe(308);
    expect(out.headers.get("location")).toBe("https://www.localley.io/x");
  });
});
