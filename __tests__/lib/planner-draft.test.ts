import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePlannerDraft, savePlannerDraft, PLANNER_DRAFT_KEY, PLANNER_DRAFT_TTL, PLANNER_RESUME_PATH, plannerDraftSnapshot } from "@/lib/trips/planner-draft";
import type { WizardData } from "@/components/itineraries/wizard/wizard-context";

const data: WizardData = {
  city: "Seoul", days: 3, budget: "moderate", interests: ["Food & Dining"],
  localnessLevel: 4, pace: "relaxed", groupType: "friends", tripMode: "single",
  citySlugs: [], cityNameBySlug: {}, templateName: "Food route", templatePrompt: "Prefer local markets.",
};
const now = 1_800_000_000_000;
const encode = (value: unknown) => JSON.stringify({ version: 1, savedAt: now, data: value });

describe("planner input recovery", () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  it("keeps all single-city inputs through a same-origin return", () => {
    savePlannerDraft(localStorage, data, now);
    expect(parsePlannerDraft(localStorage.getItem(PLANNER_DRAFT_KEY), now)?.data).toEqual(data);
    expect(PLANNER_RESUME_PATH).toBe("/itineraries/new?resume=1");
  });
  it("retains a multi-city plan without requiring a single-city name", () => {
    const multi = { ...data, city: "", days: 21, tripMode: "multi", citySlugs: ["seoul", "busan"], cityNameBySlug: { seoul: "Seoul", busan: "Busan" } };
    expect(parsePlannerDraft(encode(multi), now)?.data).toEqual(multi);
  });
  it("rejects expired and future-dated inputs", () => {
    expect(parsePlannerDraft(encode(data), now + PLANNER_DRAFT_TTL)).toBeNull();
    expect(parsePlannerDraft(encode(data), now - 1)).toBeNull();
  });
  it.each([null, "{", JSON.stringify({ version: 2, savedAt: now, data }), "한".repeat(6000)])("refuses malformed, unknown-version and oversized storage", raw => {
    expect(parsePlannerDraft(raw, now)).toBeNull();
  });
  it.each([{ ...data, entitlement: "premium" }, { ...data, budget: ["moderate"] }, { ...data, days: 8 }, { ...data, groupType: "unknown" }, { ...data, interests: Array(11).fill("food") }, { ...data, cityNameBySlug: { "../private": "Seoul" } }])("refuses extra privilege fields and invalid inputs", invalid => {
    expect(parsePlannerDraft(encode(invalid), now)).toBeNull();
  });
  it("reports denied storage without exposing the underlying error", () => {
    const storage = { setItem: () => { throw new Error("sensitive browser detail"); } };
    expect(() => savePlannerDraft(storage, data, now)).toThrow("Your browser could not keep your trip inputs.");
  });
  it("tolerates unavailable storage while opening a fresh planner", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(plannerDraftSnapshot()).toBeNull();
  });
});
