import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Live 2026-10-21: every /explore request logged PGRST200 because the page embedded users through a
// foreign key (itineraries_clerk_user_id_fkey) that does not exist, so the page always showed 0 itineraries.
describe("/explore public itineraries query", () => {
  const source = readFileSync("app/explore/page.tsx", "utf8");
  const fn = source.slice(source.indexOf("async function getPublicItineraries"), source.indexOf("async function", source.indexOf("async function getPublicItineraries") + 10));

  it("does not embed users through a nonexistent foreign key or read nonexistent user columns", () => {
    expect(fn).not.toMatch(/users!/);
    expect(fn).not.toMatch(/\bavatar_url\b|\bname,/);
  });

  it("selects the owner id and looks creators up in one bounded users query", () => {
    expect(fn).toMatch(/clerk_user_id/);
    expect(fn).toMatch(/\.from\("users"\)\s*\.select\("clerk_id, username"\)\s*\.in\("clerk_id", ownerIds\)/);
    expect(fn).toMatch(/if \(ownerIds\.length > 0\)/);
  });
});
