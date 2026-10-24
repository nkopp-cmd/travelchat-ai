// @vitest-environment node
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Supabase public.itineraries columns (information_schema, 2026-10-24). A select of any other
// column fails with 42703 and the page silently renders no rows (app/profile showed none).
const COLUMNS = new Set(["id", "user_id", "title", "city", "days", "activities", "local_score", "shared", "share_code",
  "created_at", "clerk_user_id", "highlights", "estimated_cost", "subtitle", "status", "is_favorite", "is_public",
  "like_count", "view_count", "ai_backgrounds", "story_slides"]);

describe("itineraries selects", () => {
  it("only name columns that exist in Supabase", () => {
    const files = execSync("git ls-files 'app/**/*.ts' 'app/**/*.tsx' 'lib/**/*.ts' 'lib/**/*.tsx'", { encoding: "utf8" }).trim().split("\n");
    const unknown: string[] = [];
    let checked = 0;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\.from\(\s*["']itineraries["']\s*\)\s*\.select\(\s*(["'`])([^"'`]*)\1/g)) {
        checked++;
        for (const column of match[2].split(",").map((c) => c.trim()).filter(Boolean)) {
          if (column !== "*" && !COLUMNS.has(column)) unknown.push(`${file}: ${column}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(unknown).toEqual([]);
  });
});
