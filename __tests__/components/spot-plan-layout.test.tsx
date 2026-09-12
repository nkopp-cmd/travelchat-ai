import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { expect, it, vi } from "vitest";
import config from "@/tailwind.config";
import { ItineraryEditor, type ItineraryEditorProps } from "@/components/itineraries/itinerary-editor";

function EditForm(props: Omit<ItineraryEditorProps, "onNavigate" | "saveRequest">) {
    return <ItineraryEditor {...props} onNavigate={() => {}} saveRequest={async () => new Response()} />;
}

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Opt-in static layout review. Component tests separately cover client behavior.
it.skipIf(!process.env.PLANNING_SCREENSHOT_DIR)("reviews editor layouts with local CSS and no network", async () => {
    const output = process.env.PLANNING_SCREENSHOT_DIR!;
    await mkdir(output, { recursive: true });
    const css = await postcss([tailwind(config)]).process(await readFile("app/globals.css", "utf8"), { from: "app/globals.css" });
    const spot = { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Cafe Onion Anguk", city: "Seoul", address: "5 Gyedong-gil, Jongno-gu, Seoul", description: "", category: "cafe" };
    const itinerary = { id: "test", title: "Layout test: Seoul trip", city: "Seoul", days: 1, activities: [{ day: 7, activities: [{ name: "Gyeongbokgung Palace", description: "Layout fixture only", address: "161 Sajik-ro, Seoul" }] }], highlights: null, estimated_cost: null };
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
    try {
        const page = await browser.newPage();
        await page.route("**/*", (route) => route.abort());
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        for (const width of [390, 900, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const state of ["ready", "unavailable", "duplicate", "empty"] as const) {
                const markup = renderToStaticMarkup(<div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50"><div className="container mx-auto px-4 py-8">
                    <EditForm itinerary={{ ...itinerary, activities: state === "empty" ? [] : state === "duplicate" ? [{ day: 7, activities: [{ name: spot.name, spotId: spot.id }] }] : itinerary.activities }} planningSpot={state === "unavailable" ? null : spot} spotNotice={state === "unavailable" ? "This spot is unavailable for planning. Your itinerary has not changed." : undefined} />
                </div></div>);
                await page.setContent(`<html><head><style>${css.css}</style></head><body>${markup}</body></html>`);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
                await page.screenshot({ path: path.join(output, `editor-${width}-${state}.png`), fullPage: true });
                if (state === "ready") {
                    const day = page.getByLabel("Day", { exact: true });
                    expect((await day.boundingBox())!.height).toBeGreaterThanOrEqual(44);
                    await day.focus();
                    expect(await day.evaluate((element) => element === document.activeElement && getComputedStyle(element).boxShadow !== "none")).toBe(true);
                    const contrast = await day.evaluate((element) => {
                        const luminance = (color: string) => {
                            const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map((value) => {
                                const channel = Number(value) / 255;
                                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
                            });
                            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
                        };
                        const style = getComputedStyle(element);
                        const background = luminance(style.backgroundColor);
                        return [style.color, style.borderColor].map((color) => {
                            const foreground = luminance(color);
                            return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
                        });
                    });
                    expect(contrast[0]).toBeGreaterThanOrEqual(4.5);
                    expect(contrast[1]).toBeGreaterThanOrEqual(3);
                }
            }
        }
        expect(errors).toEqual([]);
    } finally { await browser.close(); }
}, 60000);
