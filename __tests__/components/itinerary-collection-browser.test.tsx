// @vitest-environment node
import { it, expect } from "vitest";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "tailwindcss";
import config from "@/tailwind.config";

it("bundles the native collection without Next, Clerk, or legacy query modules", async () => {
    const result = await build({ entryPoints: ["components/itineraries/native-itinerary-collection.tsx"], bundle: true,
        write: false, metafile: true, platform: "browser", format: "esm", logLevel: "silent" });
    expect(Object.keys(result.metafile!.inputs).filter((path) => /node_modules\/(next|@clerk|@tanstack)|hooks\/use-queries|lib\/city-images/.test(path))).toEqual([]);
});

it.skipIf(!process.env.COLLECTION_SCREENSHOT_DIR)("reviews the real native collection at mobile, intermediate, and desktop widths", async () => {
    const result = await build({ stdin: { contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { AppSessionProvider } from "./providers/app-session-provider";
        import { NativeItineraryCollection } from "./components/itineraries/native-itinerary-collection";
        const session = { status: "ready", provider: "better-auth", ownerId: "owner", accountKey: "account",
            sessionId: "session", authUserId: "auth", userRecordId: "profile", canBookmark: false,
            refresh: async () => {}, requestSignIn: () => {} };
        createRoot(document.getElementById("root")).render(
            <AppSessionProvider value={session}><NativeItineraryCollection onNavigate={() => {}} /></AppSessionProvider>);
        `, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife",
        define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
    const css = await postcss([tailwind(config)]).process(await readFile("app/globals.css", "utf8"), { from: "app/globals.css" });
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
    try {
        const page = await browser.newPage({ reducedMotion: "reduce" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const row = { id: "aaaaaaaa-1111-4111-8111-111111111111", ownerId: "owner", title: "Seoul weekend: museums and quiet streets",
            city: "Seoul", days: 2, local_score: null, created_at: "2026-09-01", status: null,
            subtitle: null, highlights: null, estimated_cost: null, is_favorite: false };
        let empty = false;
        let writes = 0;
        await page.route("**/*", async (route) => {
            const url = new URL(route.request().url());
            if (url.origin !== "http://collection.test") return route.abort();
            if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<html><head><style>${css.css}</style></head><body><main class="max-w-6xl mx-auto p-4"><h1 class="text-2xl font-bold mb-6">Your itineraries</h1><div id="root"></div></main><script>${result.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></body></html>` });
            if (url.pathname.startsWith("/api/itineraries")) {
                if (route.request().method() === "DELETE") { writes++; empty = true; return route.fulfill({ json: { success: true } }); }
                return route.fulfill({ json: { itineraries: empty ? [] : [row], nextOffset: null } });
            }
            return route.abort();
        });
        for (const width of [390, 900, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.goto("http://collection.test/");
            await page.getByRole("button", { name: /Actions for/ }).waitFor();
            const contrast = await page.getByText("Not scored", { exact: true }).evaluate((element) => {
                const luminance = (color: string) => {
                    const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
                        const channel = value / 255;
                        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
                    });
                    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
                };
                const foreground = luminance(getComputedStyle(element).color);
                const background = luminance(getComputedStyle(element.parentElement!).backgroundColor);
                return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
            });
            expect(contrast).toBeGreaterThanOrEqual(4.5);
            for (const mode of ["Grid", "List"]) {
                await page.getByRole("button", { name: `${mode} view` }).click();
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                await page.screenshot({ path: `${process.env.COLLECTION_SCREENSHOT_DIR}/collection-${width}-${mode}.png`, fullPage: true });
            }
            const trigger = page.getByRole("button", { name: /Actions for/ });
            await trigger.click(); await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
            await page.getByRole("alertdialog").waitFor();
            await page.screenshot({ path: `${process.env.COLLECTION_SCREENSHOT_DIR}/collection-${width}-confirm.png`, fullPage: true });
            expect(await page.getByRole("button", { name: "Cancel" }).evaluate((el) => el === document.activeElement)).toBe(true);
            await page.keyboard.press("Tab");
            expect(await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).evaluate((el) => el === document.activeElement)).toBe(true);
            await page.keyboard.press("Tab");
            expect(await page.getByRole("button", { name: "Cancel" }).evaluate((el) => el === document.activeElement)).toBe(true);
            await page.getByRole("button", { name: "Cancel" }).click();
            expect(writes).toBe(0);
            expect(await trigger.evaluate((el) => el === document.activeElement)).toBe(true);
        }
        await page.getByRole("button", { name: /Actions for/ }).click();
        await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
        await page.getByText("No itineraries yet").waitFor();
        expect(writes).toBe(1);
        expect(errors).toEqual([]);
    } finally { await browser.close(); }
}, 60000);
