import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// JSX text decodes &apos; but a JS string literal renders it verbatim ("Here&apos;s").
const ENTITY_IN_STRING = /"[^"<>{}\n]*&(?:apos|quot|#39);[^"<>{}\n]*"/;

function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return tsxFiles(path);
        return path.endsWith(".tsx") ? [path] : [];
    });
}

describe("UI copy", () => {
    it("has no HTML entities inside JS string literals", () => {
        const hits = ["app", "components"].flatMap(tsxFiles).flatMap((file) =>
            readFileSync(file, "utf8").split("\n").flatMap((line, index) =>
                ENTITY_IN_STRING.test(line) ? [`${file}:${index + 1}`] : []));
        expect(hits).toEqual([]);
    });
});
