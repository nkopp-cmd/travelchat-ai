// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { previewChatSpotContext } from "@/lib/app-data/preview-chat-spots";
import { formatChatSpotContext, matchedChatCategories } from "@/lib/chat/spot-context";

let db: D1Sqlite;
const source = (id: string, category: string, score: number, pct: number, city = "Seoul") => ({
  id, name: { en: id }, description: { en: "A local place" },
  address: { en: `Street, ${city}` }, category, localley_score: score,
  local_percentage: pct, best_times: { en: "Morning" }, tips: { en: "Go early" },
  subcategories: [], photos: ["https://example.test/photo.jpg"],
});
function add(id: string, category: string, score: number, pct: number, visible = 1, city = "Seoul") {
  const payload = JSON.stringify(source(id, category, score, pct, city));
  db.sqlite.prepare("INSERT INTO spots(id,visible,localley_score) VALUES(?,?,?)").run(id, visible, score);
  db.sqlite.prepare("INSERT INTO legacy_spot_source(spotId,payload,publicIssue) VALUES(?,?,?)")
    .run(id, payload, visible ? null : "hidden");
}
beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE spots(id TEXT PRIMARY KEY, visible INTEGER, localley_score INTEGER);
    CREATE TABLE legacy_spot_source(spotId TEXT PRIMARY KEY, payload TEXT, publicIssue TEXT);
    CREATE TABLE legacy_import_batches(counts TEXT NOT NULL);`);
  add("cafe-high", "Cafe", 6, 90);
  add("food-low", "Food", 5, 95);
  add("cafe-hidden", "Cafe", 6, 99, 0);
  add("tokyo", "Cafe", 6, 98, 1, "Tokyo");
  db.sqlite.prepare("INSERT INTO legacy_import_batches(counts) VALUES(?)")
    .run(JSON.stringify({ spots: 4, legacy_spot_source: 4 }));
  mocks.reader.mockReturnValue(db);
});
afterEach(() => { db.sqlite.close(); vi.clearAllMocks(); });

describe("counted preview chat spot source", () => {
  it("keeps production category keywords and prompt formatting", () => {
    expect(matchedChatCategories("coffee and lunch")).toEqual(["Food", "Cafe"]);
    expect(formatChatSpotContext("Seoul", [source("cafe-high", "Cafe", 6, 90)]))
      .toBe(`\n\n## CURATED SPOTS DATABASE — Real verified places in Seoul
Use these REAL spots in your recommendations when relevant. These are verified, curated places from our database:\n\n- cafe-high [Cafe] (Legendary Alley, 6/6, 90% locals)
  Address: Street, Seoul
  Description: A local place
  Best time: Morning
  
  Has photos\n\nIMPORTANT: Prefer recommending these verified spots over places from your training data. If you recommend a spot from this list, use the exact name and address shown.`);
  });

  it("orders visible city rows and applies the exact category filter", async () => {
    const broad = await previewChatSpotContext("Seoul", "anything");
    expect(broad.spotIds).toEqual(["cafe-high", "food-low"]);
    expect(broad.context).toContain("cafe-high [Cafe]");
    expect(broad.context).not.toContain("cafe-hidden");
    const cafe = await previewChatSpotContext("Seoul", "coffee");
    expect(cafe.spotIds).toEqual(["cafe-high"]);
    expect(cafe.categories).toEqual(["Cafe"]);
  });

  it("applies the production quality check after its SQL limit", async () => {
    for (let index = 0; index < 15; index++) {
      add(`hidden-${index}`, "Cafe", 6, 100, 0);
    }
    db.sqlite.prepare("UPDATE legacy_import_batches SET counts=?")
      .run(JSON.stringify({ spots: 19, legacy_spot_source: 19 }));
    expect((await previewChatSpotContext("Seoul", "coffee")).spotIds).toEqual([]);
    db.sqlite.exec("UPDATE spots SET visible=1 WHERE id='hidden-0'");
    await expect(previewChatSpotContext("Seoul", "coffee")).rejects.toThrow("visibility");
  });

  it("refuses missing or mismatched archives and malformed source rows", async () => {
    db.sqlite.exec("DELETE FROM legacy_import_batches");
    await expect(previewChatSpotContext("Seoul", "coffee")).rejects.toThrow("batch");
    db.sqlite.prepare("INSERT INTO legacy_import_batches(counts) VALUES(?)")
      .run(JSON.stringify({ spots: 4, legacy_spot_source: 3 }));
    await expect(previewChatSpotContext("Seoul", "coffee")).rejects.toThrow("count");
    db.sqlite.exec("DELETE FROM legacy_import_batches");
    db.sqlite.prepare("INSERT INTO legacy_import_batches(counts) VALUES(?)")
      .run(JSON.stringify({ spots: 4, legacy_spot_source: 4 }));
    db.sqlite.prepare("UPDATE legacy_spot_source SET payload=? WHERE spotId='cafe-high'")
      .run(JSON.stringify({ ...source("cafe-high", "Cafe", 6, 90), local_percentage: -1 }));
    await expect(previewChatSpotContext("Seoul", "coffee")).rejects.toThrow("fields");
  });

  it("bounds city and query input before reading D1", async () => {
    await expect(previewChatSpotContext("Unknown", "coffee")).rejects.toThrow(RangeError);
    await expect(previewChatSpotContext("Seoul", "x".repeat(201))).rejects.toThrow(RangeError);
  });
});
