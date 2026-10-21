import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// shared/plans/localley-design-consistency.md: /chat uses the shared tokens and components only.
const FILES = [
  "components/chat/chat-interface.tsx",
  "components/chat/source-chat-page.tsx",
  "components/chat/recent-conversations-panel.tsx",
  "components/chat/itinerary-preview.tsx",
  "components/chat/formatted-message.tsx",
  "components/chat/mobile-chat-fab.tsx",
];
const LEGACY = [
  /bg-gradient-to-/,
  /\b(from|to)-(violet|indigo|purple)-\d/,
  /bg-\[#[0-9a-f]{3,8}\]/i,
  /\bbg-white\/(\d|\[)/,
  /\btext-violet-(50|200)\/\d/,
  /\bshadow-violet-\d+\/\d+/,
  /text-\[(10|11)px\]/,
  /\bbg-(emerald|violet|indigo)-[5-7]00\b/,
];

describe("chat design tokens", () => {
  it.each(FILES)("%s has no legacy gradients, raw colours or off-scale tiny text", (file) => {
    const source = readFileSync(file, "utf8");
    for (const pattern of LEGACY) expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
  });

  it("puts the /chat page header in the shared header pattern, not a separate grey bar", () => {
    const page = readFileSync("components/chat/source-chat-page.tsx", "utf8");
    expect(page).toMatch(/max-w-3xl/);
    expect(page).toMatch(/<GradientText variant="violet">Chat with Alley<\/GradientText>/);
    expect(page).not.toMatch(/bg-surface flex-shrink-0 backdrop-blur-xl/);
  });
});
