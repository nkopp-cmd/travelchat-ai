import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TemplateCard } from "@/components/templates/template-card";
import type { ItineraryTemplate } from "@/lib/templates";

const template: ItineraryTemplate = {
  id: "local-authentic",
  name: "Live Like a Local",
  description: "A local-first route with food, alleys, and neighborhoods.",
  emoji: "🏮",
  days: 3,
  pace: "moderate",
  activitiesPerDay: 4,
  tags: ["local", "food"],
  prompt: "Build a local-first itinerary.",
};

describe("TemplateCard", () => {
  it("shows an immediate use action on the selected picker card", () => {
    render(
      <TemplateCard
        template={template}
        isSelected
        primaryHref="/itineraries/new?template=local-authentic"
        onSelect={() => undefined}
      />,
    );

    const useAction = screen.getByRole("link", {
      name: "Use this template: Live Like a Local",
    });

    expect(useAction.getAttribute("href")).toBe(
      "/itineraries/new?template=local-authentic",
    );
  });

  it("names the select button by its visible text (label-in-name)", () => {
    render(<TemplateCard template={template} onSelect={() => undefined} />);
    const button = screen.getByRole("button", { name: /Live Like a Local/ });
    expect(button.hasAttribute("aria-label")).toBe(false);
  });

  it("names the plain card link by its visible text", () => {
    render(<TemplateCard template={template} />);
    const link = screen.getByRole("link", { name: /Live Like a Local/ });
    expect(link.hasAttribute("aria-label")).toBe(false);
    expect(link.getAttribute("href")).toBe("/itineraries/new?template=local-authentic");
  });

  it("keeps selected mobile cards compact while exposing an immediate use action", () => {
    render(
      <TemplateCard
        template={template}
        isSelected
        primaryHref="/itineraries/new?template=local-authentic"
        onSelect={() => undefined}
      />,
    );

    const content = screen.getByTestId("template-card-content");
    const inlineAction = screen.getByTestId("template-card-inline-action");

    expect(content.className).not.toContain("pb-8");
    expect(content.className).toContain("sm:pb-9");
    expect(inlineAction.className).toContain("hidden");
    expect(inlineAction.className).toContain("sm:inline-flex");
    expect(inlineAction.className).toContain("sm:bottom-1.5");
  });
});
