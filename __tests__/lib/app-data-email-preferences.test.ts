// @vitest-environment node
import { describe, expect, it } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
import { readEmailPreferences, writeEmailPreferences } from "@/lib/app-data/email-preferences";

const defaults = { marketing: true, weekly_digest: true, product_updates: true, itinerary_shared: true };

// Production localley-app DDL (sqlite_master, 2026-11-03).
function database() {
  const db = new D1Sqlite();
  db.sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE owners (id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL CHECK(source IN ('legacy-fixture','new')));
    CREATE TABLE email_preferences (ownerId TEXT PRIMARY KEY NOT NULL REFERENCES owners(id) ON DELETE CASCADE, marketing INTEGER NOT NULL CHECK (marketing IN (0, 1)), weekly_digest INTEGER NOT NULL CHECK (weekly_digest IN (0, 1)), product_updates INTEGER NOT NULL CHECK (product_updates IN (0, 1)), itinerary_shared INTEGER NOT NULL CHECK (itinerary_shared IN (0, 1)));`);
  return db;
}

describe("production D1 email preferences", () => {
  it("returns defaults for a user without a row and writes nothing on read", async () => {
    const db = database();
    expect(await readEmailPreferences(db, "user-a")).toEqual(defaults);
    expect(db.sqlite.prepare("SELECT count(*) n FROM email_preferences").get().n).toBe(0);
  });

  it("creates the owner and row on the first write, then patches only given keys", async () => {
    const db = database();
    expect(await writeEmailPreferences(db, "user-a", { marketing: false })).toEqual({ ...defaults, marketing: false });
    expect(await writeEmailPreferences(db, "user-a", { weekly_digest: false }))
      .toEqual({ ...defaults, marketing: false, weekly_digest: false });
    expect(db.sqlite.prepare("SELECT id, source FROM owners").all()).toEqual([{ id: "user-a", source: "new" }]);
    expect(await readEmailPreferences(db, "user-b")).toEqual(defaults);
  });

  it("keeps an existing owner row", async () => {
    const db = database();
    db.sqlite.exec("INSERT INTO owners (id, source) VALUES ('user-a', 'legacy-fixture')");
    await writeEmailPreferences(db, "user-a", { itinerary_shared: false });
    expect(db.sqlite.prepare("SELECT source FROM owners WHERE id = 'user-a'").get().source).toBe("legacy-fixture");
    expect((await readEmailPreferences(db, "user-a")).itinerary_shared).toBe(false);
  });
});
