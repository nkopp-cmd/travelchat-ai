// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthTestDatabase, type D1Sqlite } from "../helpers/d1-sqlite";
import { reserveItineraryMail } from "@/lib/itinerary-mail-limit";
const symbol = Symbol.for("__cloudflare-context__");
const globals = globalThis as Record<symbol, unknown>;
const original = globals[symbol];
let db: D1Sqlite;
beforeEach(() => {
  db = createAuthTestDatabase();
  db.sqlite.exec("PRAGMA foreign_keys=ON");
  for (const id of ["owner", "other", "third"]) db.sqlite.prepare('INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,0,0)')
    .run(id, id, `${id}@example.test`);
  globals[symbol] = { env: { AUTH_DB: db } };
  vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 6, 10));
});
afterEach(() => { db.sqlite.close(); globals[symbol] = original; vi.restoreAllMocks(); });
describe("atomic itinerary mail reservations", () => {
  it("admits only five concurrent reservations per UTC hour and isolates owners", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveItineraryMail("owner")));
    expect(results.filter(v => v === "allowed")).toHaveLength(5);
    expect(results.filter(v => v === "limited")).toHaveLength(15);
    expect(await reserveItineraryMail("other")).toBe("allowed");
    expect(db.sqlite.prepare('SELECT hourCount,dayCount FROM itinerary_mail_limits WHERE userId=?').get("owner"))
      .toEqual({ hourCount: 5, dayCount: 5 });
  });
  it("resets the hour but caps the UTC day at twenty, then resets the next day", async () => {
    for (let hour = 0; hour < 4; hour++) {
      vi.mocked(Date.now).mockReturnValue(Date.UTC(2026, 9, 6, 10 + hour));
      for (let i = 0; i < 5; i++) expect(await reserveItineraryMail("owner")).toBe("allowed");
    }
    vi.mocked(Date.now).mockReturnValue(Date.UTC(2026, 9, 6, 14));
    expect(await reserveItineraryMail("owner")).toBe("limited");
    vi.mocked(Date.now).mockReturnValue(Date.UTC(2026, 9, 7));
    expect(await reserveItineraryMail("owner")).toBe("allowed");
  });
  it("refuses clock rollback and unknown users; missing schema or binding fails closed", async () => {
    expect(await reserveItineraryMail("owner")).toBe("allowed");
    vi.mocked(Date.now).mockReturnValue(Date.UTC(2026, 9, 5));
    expect(await reserveItineraryMail("owner")).toBe("limited");
    expect(await reserveItineraryMail("unknown")).toBe("unavailable");
    db.sqlite.exec("DROP TABLE itinerary_mail_limits");
    expect(await reserveItineraryMail("owner")).toBe("unavailable");
    globals[symbol] = undefined;
    expect(await reserveItineraryMail("owner")).toBe("unavailable");
  });
  it("deletes only owned counters when the owned auth fixture is removed", async () => {
    expect(await reserveItineraryMail("owner")).toBe("allowed");
    expect(await reserveItineraryMail("other")).toBe("allowed");
    db.sqlite.prepare('DELETE FROM user WHERE id=?').run("owner");
    expect(db.sqlite.prepare('SELECT userId FROM itinerary_mail_limits').all()).toEqual([{ userId: "other" }]);
  });
  it("caps all owners at forty per UTC day without bypass through fresh accounts", async () => {
    for (let hour = 0; hour < 4; hour++) {
      vi.mocked(Date.now).mockReturnValue(Date.UTC(2026, 9, 6, 10 + hour));
      for (const user of ["owner", "other"]) for (let i = 0; i < 5; i++)
        expect(await reserveItineraryMail(user)).toBe("allowed");
      expect(await reserveItineraryMail("third")).toBe("limited");
    }
    vi.mocked(Date.now).mockReturnValue(Date.UTC(2026, 9, 6, 14));
    expect(await reserveItineraryMail("third")).toBe("limited");
    expect(db.sqlite.prepare('SELECT dayCount FROM itinerary_mail_global_limit').get()).toEqual({ dayCount: 40 });
    vi.mocked(Date.now).mockReturnValue(Date.UTC(2026, 9, 7));
    expect(await reserveItineraryMail("third")).toBe("allowed");
  });
});
