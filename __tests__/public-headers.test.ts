import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Cloudflare static-asset _headers rules allow one splat per path; a rule with two
// ("/images/picks/*-pick-v1-*") is ignored and the images fall back to max-age=0.
describe("public/_headers", () => {
  it("uses at most one splat in every path rule", async () => {
    const headers = await readFile(resolve("public/_headers"), "utf8");
    const paths = headers.split("\n").filter((line) => line.startsWith("/"));
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path.split("*").length - 1, path).toBeLessThanOrEqual(1);
  });

  it("caches every weekend pick image as immutable", async () => {
    const headers = await readFile(resolve("public/_headers"), "utf8");
    for (const city of ["seoul", "tokyo", "osaka", "kyoto", "taipei", "bangkok", "singapore"]) {
      expect(headers).toContain(`/images/picks/${city}-pick-v1-*\n  Cache-Control: public, max-age=31536000, immutable`);
    }
  });
});
