import { describe, expect, it } from "vitest";
import { tripEndDate, formatTripDate } from "@/lib/trips/date-range";

describe("calendar trip dates", () => {
  it.each([
    ["2026-12-30", 3, "2027-01-01"],
    ["2028-02-28", 3, "2028-03-01"],
    ["2026-03-07", 3, "2026-03-09"],
    ["2026-11-01", 1, "2026-11-01"],
    ["2026-12-31", 21, "2027-01-20"],
  ])("computes an inclusive calendar range for %s / %s", (start, days, end) => {
    expect(tripEndDate(start, days)).toBe(end);
  });
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "2026-01-01T00:00:00Z", "not-a-date"])("refuses invalid date %s", start => {
    expect(tripEndDate(start, 3)).toBeNull();
  });
  it.each([0, -1, 22, 1.5, NaN])("refuses invalid duration %s", days => {
    expect(tripEndDate("2026-12-30", days)).toBeNull();
  });
  it("refuses a range outside the four-digit input year", () => {
    expect(tripEndDate("9999-12-31", 2)).toBeNull();
  });
  it("formats the calendar day without a local timezone shift", () => {
    expect(formatTripDate("2027-01-01")).toBe("Jan 1, 2027");
  });
});
