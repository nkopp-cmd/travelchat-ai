import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import VsWanderlogPage from "@/app/vs/wanderlog/page";

// Push DX1: on a phone both comparison tables scroll sideways. jsdom has no layout, so axe cannot see the overflow
// (scrollable-region-focusable); the test checks the scroll boxes directly and runs axe on the rest.
afterEach(cleanup);

describe("/vs/wanderlog accessibility", () => {
  it("lets the keyboard reach every sideways scroll box, each with its own name", () => {
    const { container } = render(<VsWanderlogPage />);
    const boxes = [...container.querySelectorAll<HTMLElement>(".overflow-x-auto")];
    expect(boxes.length).toBe(2);
    for (const box of boxes) {
      expect(box.getAttribute("tabindex")).toBe("0");
      expect(box.getAttribute("role")).toBe("region");
      expect(box.className).toContain("focus-visible:ring");
      expect(box.querySelector("table")).not.toBeNull();
    }
    const names = boxes.map((b) => b.getAttribute("aria-label") ?? "");
    expect(names.every((n) => n.length > 10)).toBe(true);
    expect(new Set(names).size).toBe(2);
  });

  it("has no serious or critical axe violation", async () => {
    const { container } = render(<VsWanderlogPage />);
    const result = await axe.run(container, {
      runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    const hard = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
    expect(hard).toEqual([]);
  });
});
