import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ItinerariesPage from "@/app/itineraries/page";
import { readFile, mkdir } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import postcss from "postcss";
import tailwind from "tailwindcss";
import config from "@/tailwind.config";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), spot: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/spots/planning", () => ({ getPlanningSpot: mocks.spot }));
vi.mock("@/hooks/use-queries", () => ({
    useDuplicateItinerary: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteItinerary: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const spotId = "aaaaaaaa-1111-4111-8111-111111111111";
const trips = [
    { id: "seoul-trip", title: "My Seoul weekend", city: "Seoul", days: 2 },
    { id: "tokyo-trip", title: "Tokyo holiday", city: "Tokyo", days: 3 },
];
const page = (spotId?: string) => ItinerariesPage({ searchParams: Promise.resolve(spotId === undefined ? {} : { spotId }) });
beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    const query = { select: () => query, eq: mocks.eq, order: mocks.order };
    mocks.eq.mockReturnValue(query);
    mocks.order.mockResolvedValue({ data: trips, error: null });
    mocks.admin.mockReturnValue({ from: () => query });
    mocks.spot.mockResolvedValue({ id: spotId, name: "Cafe Onion Anguk", city: "Seoul" });
});

it.skipIf(!process.env.PLANNING_SCREENSHOT_DIR)("reviews chooser layouts without network access", async () => {
    const output = process.env.PLANNING_SCREENSHOT_DIR!;
    await mkdir(output, { recursive: true });
    const css = await postcss([tailwind(config)]).process(await readFile("app/globals.css", "utf8"), { from: "app/globals.css" });
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
    try {
        const browserPage = await browser.newPage();
        await browserPage.route("**/*", (route) => route.abort());
        for (const width of [390, 900, 1440]) {
            await browserPage.setViewportSize({ width, height: 1000 });
            for (const state of ["ready", "empty", "unavailable"]) {
                mocks.order.mockResolvedValue({ data: state === "empty" ? [] : trips, error: null });
                mocks.spot.mockResolvedValue(state === "unavailable" ? null : { id: spotId, name: "Cafe Onion Anguk", city: "Seoul" });
                const markup = renderToStaticMarkup(await page(spotId));
                await browserPage.setContent(`<html><head><style>${css.css}</style></head><body>${markup}</body></html>`);
                expect(await browserPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                await browserPage.screenshot({ path: `${output}/chooser-${width}-${state}.png`, fullPage: true });
            }
        }
    } finally { await browser.close(); }
}, 60000);

describe("discovery itinerary continuation", () => {
    it("keeps the normal itinerary collection unchanged", async () => {
        render(await page());
        expect(screen.getByRole("textbox", { name: "Search itineraries" })).toBeTruthy();
        expect(screen.getAllByText("My Seoul weekend").length).toBeGreaterThan(0);
        expect(mocks.spot).not.toHaveBeenCalled();
    });

    it("preserves the selected place through sign-in before reading data", async () => {
        mocks.auth.mockResolvedValue({ userId: null });
        await expect(page(spotId)).rejects.toThrow(`/sign-in?redirect_url=${encodeURIComponent(`/itineraries?spotId=${spotId}`)}`);
        expect(mocks.admin).not.toHaveBeenCalled();
        expect(mocks.spot).not.toHaveBeenCalled();
    });

    it("shows only owned trips in the matching city and keeps the place in the editor URL", async () => {
        render(await page(spotId));
        expect(mocks.eq).toHaveBeenCalledWith("clerk_user_id", "owner");
        expect(screen.getByRole("link", { name: /My Seoul weekend/ }).getAttribute("href")).toBe(`/itineraries/seoul-trip/edit?spotId=${spotId}`);
        expect(screen.queryByRole("link", { name: /Tokyo holiday/ })).toBeNull();
        expect(screen.getByRole("link", { name: "Back to discovery" }).getAttribute("href")).toBe(`/spots/${spotId}`);
        expect(screen.getByRole("link", { name: "New Itinerary" }).getAttribute("href")).toBe(`/itineraries/new?city=Seoul&spotId=${spotId}`);
        expect(screen.queryByRole("textbox", { name: "Search itineraries" })).toBeNull();
    });

    it("explains an empty compatible collection without claiming the spot was added", async () => {
        mocks.order.mockResolvedValue({ data: [trips[1]], error: null });
        render(await page(spotId));
        expect(screen.getByText(/You do not have an itinerary in Seoul yet/)).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Tokyo holiday/ })).toBeNull();
    });

    it("does not offer planning links for an unavailable place", async () => {
        mocks.spot.mockResolvedValue(null);
        render(await page("invalid"));
        expect(screen.getByRole("alert").textContent).toContain("unavailable");
        expect(screen.queryByRole("link", { name: /My Seoul weekend/ })).toBeNull();
    });

    it("distinguishes a database failure from an empty collection", async () => {
        mocks.order.mockResolvedValue({ data: null, error: { message: "test failure" } });
        render(await page(spotId));
        expect(screen.getByText(/Failed to load itineraries/)).toBeTruthy();
        expect(screen.queryByText(/You do not have an itinerary/)).toBeNull();
    });
});
