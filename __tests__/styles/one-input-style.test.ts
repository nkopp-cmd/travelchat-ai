import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// docs/DESIGN.md: every field uses the shared input fill (bg-field, 4.06:1 on overlay); no local fill overrides.
const FILL_OVERRIDE = /<(Input|Textarea)\b(?:(?!\/>)[\s\S])*?className="[^"]*\bbg-(?!transparent\b)/g;

function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return tsxFiles(path);
        return path.endsWith(".tsx") ? [path] : [];
    });
}

describe("form fields", () => {
    it("use the shared input fill everywhere", () => {
        const hits = ["app", "components"].flatMap(tsxFiles).filter((file) => !file.includes("components/ui/"))
            .flatMap((file) => [...readFileSync(file, "utf8").matchAll(FILL_OVERRIDE)].map(() => file));
        expect(hits).toEqual([]);
    });
});
