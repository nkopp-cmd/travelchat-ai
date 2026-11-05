import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// React Query is not in the root layout (public pages do not download it). Every component
// that needs a QueryClient must render under one of these QueryProvider roots.
const ROOT = join(__dirname, "..", "..");
const QUERY_ROOTS = [
  "app/chat/layout.tsx",
  "app/dashboard/layout.tsx",
  "app/itineraries/layout.tsx",
  "app/pricing/layout.tsx",
  "app/settings/layout.tsx",
  "app/shared/[shareCode]/layout.tsx",
  "components/layout/navbar-account.tsx",
];
// Files that call React Query hooks directly or through the shared hooks. A new file here
// needs a QueryProvider root above it; add the root to QUERY_ROOTS and the file to this list.
const KNOWN_USERS = [
  "app/pricing/page.tsx",
  "components/activities/itinerary-activity-card.tsx",
  "components/chat/chat-interface.tsx",
  "components/chat/itinerary-preview.tsx",
  "components/chat/recent-conversations-panel.tsx",
  "components/itineraries/itinerary-list.tsx",
  "components/layout/sidebar.tsx",
  "components/subscription/limit-exceeded-modal.tsx",
  "components/subscription/subscription-badge.tsx",
  "components/subscription/subscription-success-handler.tsx",
  "hooks/use-place-photo.ts",
  "hooks/use-queries.ts",
  "hooks/use-subscription.ts",
  "lib/query-client.tsx",
  "providers/subscription-provider.tsx",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("React Query provider scope", () => {
  it("keeps React Query and the subscription context out of the root providers", () => {
    const providers = readFileSync(join(ROOT, "providers/index.tsx"), "utf8");
    expect(providers).not.toMatch(/query-client|react-query|subscription-provider/);
  });

  it("wraps every listed route and island in QueryProvider", () => {
    for (const file of QUERY_ROOTS) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toMatch(/<QueryProvider>/);
    }
  });

  it("knows every React Query user", () => {
    const users = ["app", "components", "hooks", "lib", "providers"]
      .flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((path) => /@tanstack\/react-query|@\/hooks\/use-queries|@\/hooks\/use-subscription|@\/hooks\/use-place-photo|useSubscriptionContext|useSubscriptionOptional/.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path))
      .filter((path) => !QUERY_ROOTS.includes(path))
      .sort();
    expect(users).toEqual([...KNOWN_USERS].sort());
  });
});
