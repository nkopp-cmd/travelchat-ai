import { describe, expect, it } from "vitest";
import {
  getTemplateFooterCityLabel,
  getTemplateFooterControlsClass,
  getTemplateFooterLayoutClass,
  getTemplateGenerateLabel,
} from "@/components/itineraries/wizard";

describe("template wizard footer copy", () => {
  it("makes sample-city confirmation explicit before one-tap generation", () => {
    expect(getTemplateFooterCityLabel("Seoul")).toBe("Confirm city: Seoul");
    expect(getTemplateGenerateLabel("Seoul")).toBe("Generate for Seoul");
  });

  it("falls back to city-picking copy when no city is selected", () => {
    expect(getTemplateFooterCityLabel("")).toBe("Pick a city");
    expect(getTemplateGenerateLabel("")).toBe("Generate");
  });

  it("keeps template footer controls primary-first and stable on mobile", () => {
    expect(getTemplateFooterLayoutClass(true)).toContain("grid");
    expect(getTemplateFooterLayoutClass(true)).toContain("sm:flex");
    expect(getTemplateFooterControlsClass(true)).toContain(
      "grid-cols-[minmax(0,1fr)_auto]",
    );
    expect(getTemplateFooterControlsClass(true)).toContain("sm:contents");
  });
});
