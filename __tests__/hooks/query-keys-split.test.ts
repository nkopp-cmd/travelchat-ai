import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/hooks/query-keys";
import { queryKeys as reExported } from "@/hooks/use-queries";

// The root SubscriptionProvider wraps every public page; importing use-queries there
// bundled lib/api-client (all endpoints, ~10 KB gzip) into the home page.
describe("query keys module", () => {
    it("keeps use-subscription off the api client", () => {
        const source = readFileSync("hooks/use-subscription.ts", "utf8");
        expect(source).not.toMatch(/@\/hooks\/use-queries|@\/lib\/api-client/);
        expect(readFileSync("hooks/query-keys.ts", "utf8")).not.toMatch(/^import /m);
    });

    it("re-exports the same keys from use-queries", () => {
        expect(reExported).toBe(queryKeys);
        expect(queryKeys.subscription).toEqual(["subscription", "status"]);
    });
});
