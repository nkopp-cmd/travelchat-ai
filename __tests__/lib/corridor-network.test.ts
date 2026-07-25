import { describe, expect, it } from "vitest";
import { selectableSlugs, supportedCorridorNetwork } from "@/lib/trips/corridor-network";

describe("supportedCorridorNetwork", () => {
  it("exposes the reviewed corridor destinations with countries", () => {
    const network = supportedCorridorNetwork();
    expect(network.slugs).toEqual([...network.slugs].sort());
    expect(network.slugs).toContain("seoul");
    expect(network.slugs).toContain("tokyo");
    expect(network.countryBySlug.seoul).toBe("KR");
    expect(network.countryBySlug.busan).toBe("KR");
    expect(network.countryBySlug.tokyo).toBe("JP");
    expect(network.countryBySlug.kyoto).toBe("JP");
  });

  it("builds symmetric adjacency from directed edges", () => {
    const network = supportedCorridorNetwork();
    expect(network.adjacency.seoul).toContain("busan");
    expect(network.adjacency.busan).toContain("seoul");
    expect(network.adjacency.busan).toContain("gyeongju");
    expect(network.adjacency.gyeongju).not.toContain("jeju");
  });
});

describe("selectableSlugs", () => {
  const network = supportedCorridorNetwork();

  it("offers every supported destination before any pick", () => {
    const selectable = selectableSlugs(network, []);
    expect(selectable.size).toBe(network.slugs.length);
  });

  it("narrows to same-country connected cities after the first pick", () => {
    const afterSeoul = selectableSlugs(network, ["seoul"]);
    expect(afterSeoul.has("busan")).toBe(true);
    expect(afterSeoul.has("jeju")).toBe(true);
    expect(afterSeoul.has("tokyo")).toBe(false);
    expect(afterSeoul.has("kyoto")).toBe(false);

    const afterGyeongju = selectableSlugs(network, ["gyeongju"]);
    expect(afterGyeongju.has("busan")).toBe(true);
    expect(afterGyeongju.has("jeju")).toBe(false);
  });

  it("unlocks cascade picks once the connecting city is selected", () => {
    const afterGyeongjuBusan = selectableSlugs(network, ["gyeongju", "busan"]);
    expect(afterGyeongjuBusan.has("jeju")).toBe(true);
    expect(afterGyeongjuBusan.has("tokyo")).toBe(false);
  });

  it("excludes already-picked cities", () => {
    const afterSeoul = selectableSlugs(network, ["seoul"]);
    expect(afterSeoul.has("seoul")).toBe(false);
  });
});
