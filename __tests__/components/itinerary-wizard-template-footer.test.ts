import { describe, expect, it } from "vitest";
import {
  getTemplateFooterCityLabel,
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
});
