import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import middleware from "@/middleware";
import { authCopy } from "@/lib/auth/auth-copy";

// Push BP3: every page a signed-out visitor is walled from (middleware redirect or requireCommunityPage) must name
// what they get by signing up; the generic "Join Localley" form there lost the reason they came.
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return /^page\.tsx?$/.test(name) ? [full] : [];
  });
}
const samplePath = (file: string) => "/" + file.split("/").slice(1, -1)
  .filter((part) => !/^\(.*\)$/.test(part))
  .map((part) => (part.startsWith("[") ? "x1" : part))
  .join("/");

const files = pages("app");
const get = (path: string) => middleware(new NextRequest(`https://www.localley.io${path}`));
// Admin pages: only the owner signs in there; the default sign-in form is right.
const EXEMPT = /^\/admin(\/|$)/;
const DEFAULT = { "sign-up": authCopy("sign-up", null), "sign-in": authCopy("sign-in", null) };

describe("wall copy on every signed-out wall (Push BP3)", async () => {
  const walled: string[] = [];
  for (const file of files) {
    const path = samplePath(file);
    const response = await get(path);
    const location = response.headers.get("location");
    if (response.status === 307 && location && /^\/sign-(up|in)$/.test(new URL(location).pathname)) walled.push(path);
    else if (readFileSync(file, "utf8").includes("requireCommunityPage(")) walled.push(path);
  }
  it("finds the walls", () => {
    expect(walled).toEqual(expect.arrayContaining(["/dashboard", "/community", "/spots/x1/tips", "/guide/dashboard", "/itineraries/x1"]));
  });
  it.each(walled.filter((path) => !EXEMPT.test(path)).flatMap((path) => (["sign-up", "sign-in"] as const).map((mode) => [path, mode] as const)))(
    "%s (%s) gets its own copy", (path, mode) => {
      expect(authCopy(mode, path)).not.toEqual(DEFAULT[mode]);
    });
  it("keeps the planner and the browser preview on their own copy, not the saved-trip copy", () => {
    expect(authCopy("sign-up", "/itineraries/new").title).toBe("Keep planning");
    expect(authCopy("sign-up", "/itineraries/preview?continue=save").title).toBe("Create an account to save your trip");
    expect(authCopy("sign-in", "/itineraries/abc-123/edit").title).toBe("Sign in to open your trip");
    expect(authCopy("sign-up", "/itineraries/abc/stories")).toEqual(DEFAULT["sign-up"]);
    expect(authCopy("sign-up", "/itineraries/new/edit").title).not.toBe("Open your saved trip");
  });
});
