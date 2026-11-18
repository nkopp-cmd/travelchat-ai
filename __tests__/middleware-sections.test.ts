import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import middleware, { isPrivateSection, isPublicRoute } from "@/middleware";

// Push AM1: unknown paths answer 404 (app/not-found.tsx), not a sign-up redirect. Only PRIVATE_SECTIONS redirect, so
// every page or route handler outside the public routes must sit in one of them, or a signed-out visitor would reach it.
function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return /^(page|route)\.tsx?$/.test(name) ? [dir] : [];
  });
}

const samplePath = (dir: string) => "/" + dir.split("/").slice(1)
  .filter((part) => !/^\(.*\)$/.test(part) && !/^\[\[\.\.\..+\]\]$/.test(part))
  .map((part) => (part.startsWith("[") ? "x1" : part))
  .join("/");

// Sitemaps are .xml files, which the middleware matcher skips (they never reach the auth check).
const appRoutes = routes("app").filter((dir) => !/^app\/(api|sitemap)/.test(dir)).map(samplePath);
const get = (path: string, cookie?: string) => middleware(new NextRequest(`https://www.localley.io${path}`, cookie ? { headers: { cookie } } : {}));

describe("unknown paths vs private sections", () => {
  it("finds the app routes", () => {
    expect(appRoutes).toEqual(expect.arrayContaining(["/dashboard", "/itineraries/new", "/spots/x1", "/pricing"]));
  });

  it.each(appRoutes)("%s is public or inside a private section", (path) => {
    expect(isPublicRoute(new NextRequest(`https://www.localley.io${path}`)) || isPrivateSection(path)).toBe(true);
  });

  it.each(["/nope-xyz", "/wp-login.php", "/cities/seoul", "/credits/x", "/blogs"])("lets %s reach the 404 page", async (path) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/dashboard", "/settings", "/itineraries/abc", "/users/sam", "/guide/dashboard", "/chat"])(
    "still sends a signed-out %s to sign-up", async (path) => {
      const response = await get(path);
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/sign-up");
    });

  it("keeps API 401 for signed-out calls", async () => {
    expect((await get("/api/itineraries")).status).toBe(401);
  });
});
