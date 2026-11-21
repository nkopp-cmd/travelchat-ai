#!/usr/bin/env node
// Push BV3: axe on the pages a payer walks through, at phone and desktop width.
// Usage: node scripts/a11y-money-pages.mjs [base-url]   (default https://www.localley.io)
// Exit 1 on any serious/critical violation, exit 2 when the tools are missing.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const base = (process.argv[2] || "https://www.localley.io").replace(/\/$/, "");
const PAGES = ["/", "/pricing", "/sign-up?redirect_url=%2Fpricing", "/sign-in", "/forgot-password", "/itineraries/new", "/spots"];
const VIEWPORTS = [["mobile", 390, 844], ["desktop", 1280, 900]];
const BLOCKING = new Set(["serious", "critical"]);

let chromium, axeSource;
try {
    ({ chromium } = await import("@playwright/test"));
    axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch (error) {
    console.error(`a11y-money-pages: tools missing (npm ci, npx playwright install chromium): ${error.message}`);
    process.exit(2);
}

const browser = await chromium.launch();
let blocking = 0;
try {
    for (const [name, width, height] of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width, height } });
        for (const path of PAGES) {
            await page.goto(base + path, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
            await page.addScriptTag({ content: axeSource });
            const violations = await page.evaluate(async () =>
                (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] })).violations
                    .map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, targets: v.nodes.slice(0, 2).map((n) => n.target.join(" ")) })));
            const hard = violations.filter((v) => BLOCKING.has(v.impact));
            blocking += hard.length;
            console.log(`${hard.length ? "FAIL" : "ok  "} ${name} ${path}`);
            for (const v of violations) console.log(`     ${v.impact} ${v.id} x${v.count}: ${v.targets.join(" | ")}`);
        }
        await page.close();
    }
} finally {
    await browser.close();
}
console.log(blocking ? `a11y-money-pages: ${blocking} serious/critical` : "a11y-money-pages: all ok");
process.exit(blocking ? 1 : 0);
