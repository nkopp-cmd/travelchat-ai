import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SEOUL_LIVING_URL, SeoulLivingLink } from "@/components/layout/seoul-living-link";

describe("SeoulLivingLink", () => {
  it("links to the hosted nilsgroove signup with the localley source and collects nothing here", () => {
    const { container } = render(<SeoulLivingLink />);
    const link = screen.getByRole("link", { name: "Get the weekly Seoul Living email" });
    expect(link.getAttribute("href")).toBe("https://nilsgroove.com/seoul-living?src=localley");
    expect(SEOUL_LIVING_URL).toBe(link.getAttribute("href"));
    expect(container.querySelector("form, input, iframe, script")).toBeNull();
  });
});
