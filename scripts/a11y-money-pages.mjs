#!/usr/bin/env node
// Push BV3: axe on the pages a payer walks through, at phone and desktop width.
// Push DJ3: `--wide` adds every city list page linked from /spots (read live, so a new city needs no edit here)
// plus the other public browse pages; a page that fails to load now counts as a failure instead of an empty "ok".
// Usage: node scripts/a11y-money-pages.mjs [--wide] [base-url]   (default https://www.localley.io)
// Exit 1 on any serious/critical violation or failed page load, exit 2 when the tools are missing.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pacer } from "./seo/click-depth-lib.mjs";

export const PAGES = ["/", "/pricing", "/sign-up?redirect_url=%2Fpricing", "/sign-in", "/forgot-password", "/itineraries/new", "/spots"];
export const BROWSE_PAGES = ["/trending", "/templates", "/help", "/help/korea", "/help/korea/pay", "/blog"];
export const VIEWPORTS = [["mobile", 390, 844], ["desktop", 1280, 900]];
const BLOCKING = new Set(["serious", "critical"]);
const CITY_LINK = /href="(\/spots(?:\?city=|\/a-z\/)[a-z0-9-]+)"/g;

/** The page list: the money walk, plus (wide) the browse pages and every city link in the /spots HTML, each once. */
export function pagesFor(wide, spotsHtml = "") {
    if (!wide) return [...PAGES];
    const cities = [...new Set([...spotsHtml.matchAll(CITY_LINK)].map((m) => m[1]))].sort();
    return [...new Set([...PAGES, ...BROWSE_PAGES, ...cities])];
}

async function main() {
    const args = process.argv.slice(2);
    const wide = args.includes("--wide");
    const base = (args.find((a) => !a.startsWith("--")) || "https://www.localley.io").replace(/\/$/, "");
    const require = createRequire(import.meta.url);
    let chromium, axeSource;
    try {
        ({ chromium } = await import("@playwright/test"));
        axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
    } catch (error) {
        console.error(`a11y-money-pages: tools missing (npm ci, npx playwright install chromium): ${error.message}`);
        return 2;
    }
    // Our own check: the funnel skips it (lib/check-traffic.ts).
    const headers = { "X-Localley-Check": "1" };
    let spotsHtml = "";
    let spotsStatus = 0;
    if (wide) {
        const response = await fetch(`${base}/spots`, { headers });
        spotsStatus = response.status;
        spotsHtml = response.ok ? await response.text() : "";
    }
    const pages = pagesFor(wide, spotsHtml);
    if (wide && pages.length === pagesFor(true, "").length) {
        console.error(`a11y-money-pages: no city links on ${base}/spots (HTTP ${spotsStatus})`);
        return 1;
    }
    const pace = pacer(2);
    const browser = await chromium.launch();
    let blocking = 0;
    try {
        for (const [name, width, height] of VIEWPORTS) {
            const page = await browser.newPage({ viewport: { width, height }, extraHTTPHeaders: headers });
            // Push DM2: link prefetches (?_rsc=) render dozens of Worker pages per check page and are not part of
            // the audit; pages load at most 2 per second.
            await page.route((url) => url.searchParams.has("_rsc"), (route) => route.abort());
            for (const path of pages) {
                await pace();
                const response = await page.goto(base + path, { waitUntil: "networkidle", timeout: 30_000 }).catch((error) => error);
                if (response instanceof Error || !response || response.status() >= 400) {
                    blocking += 1;
                    console.log(`FAIL ${name} ${path}: load ${response instanceof Error ? response.message.split("\n")[0] : response?.status()}`);
                    continue;
                }
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
    console.log(blocking ? `a11y-money-pages: ${blocking} serious/critical or failed loads (${pages.length} pages)` : `a11y-money-pages: all ok (${pages.length} pages)`);
    return blocking ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
