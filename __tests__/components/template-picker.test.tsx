import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TemplatePicker, getTemplateUrl } from "@/components/templates/template-picker";
import type { ItineraryTemplate } from "@/lib/templates";

function makeTemplate(
  overrides: Partial<ItineraryTemplate> & Pick<ItineraryTemplate, "id" | "name">,
): ItineraryTemplate {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description || "Off-the-beaten-path experiences like a local",
    icon: overrides.icon || "key",
    emoji: overrides.emoji || "key",
    days: overrides.days || 5,
    pace: overrides.pace || "moderate",
    focus: overrides.focus || ["Hidden Gems", "Local Neighborhoods"],
    activitiesPerDay: overrides.activitiesPerDay || 4,
    targetAudience: overrides.targetAudience || "Seasoned travelers",
    prompt: overrides.prompt || "Build an authentic local itinerary.",
    tags: overrides.tags || ["Local", "Hidden Gems"],
    color: overrides.color || "from-violet-500 to-purple-500",
  };
}

const template = makeTemplate({
  id: "local-authentic",
  name: "Local's Guide",
  emoji: "L",
});

const templates: ItineraryTemplate[] = [
  template,
  makeTemplate({
    id: "foodie",
    name: "Food Crawl",
    emoji: "F",
    pace: "relaxed",
    days: 3,
  }),
  makeTemplate({
    id: "active-weekend",
    name: "Active Weekend",
    emoji: "A",
    pace: "active",
    days: 2,
  }),
];

describe("getTemplateUrl", () => {
  it("preloads the template and its sample city for one-tap generation", () => {
    const url = getTemplateUrl(template);

    expect(url).toBe("/itineraries/new?template=local-authentic&city=Tokyo");
  });
});

describe("TemplatePicker", () => {
  it("keeps template cards compact and leaves room for the sticky mobile CTA", () => {
    render(<TemplatePicker templates={templates} />);

    expect(screen.getByTestId("template-picker-shell").className).toContain(
      "pb-[calc(8rem+env(safe-area-inset-bottom,0px))]",
    );
    expect(screen.getByTestId("template-picker-shell").className).toContain(
      "lg:grid-cols-[minmax(0,1fr)_21rem]",
    );
    expect(screen.getByTestId("template-picker-shell").className).toContain(
      "lg:pb-0",
    );
    expect(screen.getByTestId("template-picker-grid").className).toContain(
      "grid-cols-2",
    );
    expect(screen.getByTestId("template-picker-grid").className).toContain(
      "gap-1.5",
    );
    expect(screen.getByTestId("template-picker-grid").className).toContain(
      "min-[430px]:grid-cols-3",
    );
    expect(screen.getByTestId("template-picker-grid").className).toContain(
      "xl:grid-cols-4",
    );
    expect(screen.getAllByTestId("template-card-content")[0].className).toContain(
      "p-1.5",
    );
    expect(screen.getAllByTestId("template-card-content")[0].className).toContain(
      "sm:p-2",
    );
    expect(screen.getByTestId("template-mobile-cta").className).toContain(
      "fixed",
    );
    expect(screen.getByTestId("template-mobile-cta").className).toContain(
      "z-40",
    );
    expect(screen.getByTestId("template-mobile-cta").className).toContain(
      "bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]",
    );
    expect(screen.getByTestId("template-mobile-cta").className).toContain(
      "lg:hidden",
    );
  });

  it("updates the one-tap mobile CTA when a different template is selected", () => {
    render(<TemplatePicker templates={templates} />);

    const mobileCta = screen.getByTestId("template-mobile-cta");
    expect(mobileCta.textContent).toContain("Local's Guide");
    expect(
      screen.getByRole("link", { name: /use template/i }).getAttribute("href"),
    ).toBe(
      "/itineraries/new?template=local-authentic&city=Tokyo",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Select Active Weekend template" }),
    );

    expect(mobileCta.textContent).toContain("Active Weekend");
    expect(
      screen.getByRole("link", { name: /use template/i }).getAttribute("href"),
    ).toBe(
      "/itineraries/new?template=active-weekend&city=Tokyo",
    );
  });
});
