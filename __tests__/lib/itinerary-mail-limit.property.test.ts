// @vitest-environment node
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthTestDatabase } from "../helpers/d1-sqlite";
import { reserveItineraryMail } from "@/lib/itinerary-mail-limit";

vi.mock("server-only", () => ({}));

const symbol = Symbol.for("__cloudflare-context__");
const globals = globalThis as Record<symbol, unknown>;
const original = globals[symbol];
const USERS = ["u0", "u1", "u2", "u3", "u4"];
const HOUR = 3_600_000;
const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 6, 0);

afterEach(() => { globals[symbol] = original; vi.restoreAllMocks(); });

type Window = { hourStart: number; hourCount: number; dayStart: number; dayCount: number };

// Reference model of the two upserts: the owner row admits first (5/h, 20/day),
// then the global row (10/h, 40/day). An owner reservation stays used when the
// global row refuses. A clock that moves back never resets a window.
function admit(row: Window | undefined, hour: number, day: number, perHour: number, perDay: number): Window | null {
  if (!row) return { hourStart: hour, hourCount: 1, dayStart: day, dayCount: 1 };
  const hourOk = row.hourStart < hour || (row.hourStart === hour && row.hourCount < perHour);
  const dayOk = row.dayStart < day || (row.dayStart === day && row.dayCount < perDay);
  if (!hourOk || !dayOk) return null;
  return {
    hourStart: hour, hourCount: row.hourStart < hour ? 1 : row.hourCount + 1,
    dayStart: day, dayCount: row.dayStart < day ? 1 : row.dayCount + 1,
  };
}

const step = fc.record({
  user: fc.integer({ min: 0, max: USERS.length - 1 }),
  // Mostly small steps inside one hour, sometimes a new hour or a new day,
  // rarely a clock rollback.
  advance: fc.oneof(
    { weight: 8, arbitrary: fc.integer({ min: 0, max: 10 * 60_000 }) },
    { weight: 2, arbitrary: fc.integer({ min: HOUR - 60_000, max: 3 * HOUR }) },
    { weight: 1, arbitrary: fc.integer({ min: DAY - HOUR, max: 2 * DAY }) },
    { weight: 1, arbitrary: fc.integer({ min: -2 * HOUR, max: -1 }) },
  ),
});

describe("itinerary mail quota properties", () => {
  it("never exceeds 5/h and 20/day per user or 10/h and 40/day overall, and matches the window model", async () => {
    await fc.assert(fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 150 }), async (steps) => {
      const db = createAuthTestDatabase();
      try {
        for (const id of USERS) db.sqlite.prepare("INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,0,0)")
          .run(id, id, `${id}@example.test`);
        globals[symbol] = { env: { AUTH_DB: db } };
        const now = vi.spyOn(Date, "now");
        const owners = new Map<string, Window>();
        let global: Window | undefined;
        const sentPerUserHour = new Map<string, number>();
        const sentPerUserDay = new Map<string, number>();
        const sentPerHour = new Map<number, number>();
        const sentPerDay = new Map<number, number>();
        let t = START;
        for (const s of steps) {
          t = Math.max(START, t + s.advance);
          now.mockReturnValue(t);
          const user = USERS[s.user];
          const hour = Math.floor(t / HOUR) * HOUR;
          const day = Math.floor(t / DAY) * DAY;
          let expected: "allowed" | "limited" = "limited";
          const owner = admit(owners.get(user), hour, day, 5, 20);
          if (owner) {
            owners.set(user, owner);
            const shared = admit(global, hour, day, 10, 40);
            if (shared) { global = shared; expected = "allowed"; }
          }
          const result = await reserveItineraryMail(user);
          expect(result).toBe(expected);
          if (result !== "allowed") continue;
          const uh = `${user}:${hour}`, ud = `${user}:${day}`;
          sentPerUserHour.set(uh, (sentPerUserHour.get(uh) ?? 0) + 1);
          sentPerUserDay.set(ud, (sentPerUserDay.get(ud) ?? 0) + 1);
          sentPerHour.set(hour, (sentPerHour.get(hour) ?? 0) + 1);
          sentPerDay.set(day, (sentPerDay.get(day) ?? 0) + 1);
        }
        for (const n of sentPerUserHour.values()) expect(n).toBeLessThanOrEqual(5);
        for (const n of sentPerUserDay.values()) expect(n).toBeLessThanOrEqual(20);
        for (const n of sentPerHour.values()) expect(n).toBeLessThanOrEqual(10);
        for (const n of sentPerDay.values()) expect(n).toBeLessThanOrEqual(40);
      } finally {
        db.sqlite.close();
        vi.restoreAllMocks();
      }
    }), { numRuns: 60 });
  }, 60_000);

  it("admits again in a fresh UTC day after every cap is full", async () => {
    await fc.assert(fc.asyncProperty(fc.integer({ min: 0, max: DAY - 1 }), async (offset) => {
      const db = createAuthTestDatabase();
      try {
        for (const id of USERS) db.sqlite.prepare("INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,0,0)")
          .run(id, id, `${id}@example.test`);
        globals[symbol] = { env: { AUTH_DB: db } };
        const now = vi.spyOn(Date, "now");
        // Fill the global day cap: 4 hours x 2 users x 5 sends = 40.
        for (let h = 0; h < 4; h++) {
          now.mockReturnValue(START + h * HOUR);
          for (const user of ["u0", "u1"]) for (let i = 0; i < 5; i++) expect(await reserveItineraryMail(user)).toBe("allowed");
        }
        now.mockReturnValue(START + 4 * HOUR);
        expect(await reserveItineraryMail("u2")).toBe("limited");
        now.mockReturnValue(START + DAY + offset);
        expect(await reserveItineraryMail("u0")).toBe("allowed");
      } finally {
        db.sqlite.close();
        vi.restoreAllMocks();
      }
    }), { numRuns: 20 });
  }, 60_000);
});
