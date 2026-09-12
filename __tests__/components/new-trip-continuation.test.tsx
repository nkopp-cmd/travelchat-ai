import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ItineraryWizard } from "@/components/itineraries/wizard";
import NewItineraryPage from "@/app/itineraries/new/page";
import NewItineraryClient from "@/app/itineraries/new/client-content";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import postcss from "postcss";
import tailwind from "tailwindcss";
import config from "@/tailwind.config";

const mocks = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn(), spot: vi.fn(), fetch: vi.fn(), user: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useUser: mocks.user }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/spots/planning", () => ({ getPlanningSpot: mocks.spot }));
vi.mock("@/components/itineraries/wizard/wizard-progress", () => ({ WizardProgress: () => null }));
vi.mock("@/components/itineraries/wizard/step-destination", async () => {
  const { useWizard } = await import("@/components/itineraries/wizard/wizard-context");
  const { useEffect } = await import("react");
  return { StepDestination: () => {
    const { data, setData, setCanProceed } = useWizard();
    useEffect(() => setCanProceed(true), [setCanProceed]);
    return <><p>{JSON.stringify(data)}</p><button onClick={() => setData({ city: "Tokyo" })}>Choose Tokyo</button><button onClick={() => setData({ tripMode: "multi", citySlugs: ["seoul", "tokyo"] })}>Choose multi</button></>;
  } };
});
vi.mock("@/components/itineraries/wizard/step-preferences", async () => {
  const { useWizard } = await import("@/components/itineraries/wizard/wizard-context");
  const { useEffect } = await import("react");
  return { StepPreferences: () => {
    const { data, setCanProceed } = useWizard();
    useEffect(() => setCanProceed(true), [setCanProceed]);
    return <p>{JSON.stringify(data)}</p>;
  } };
});
const spot = { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Cafe Onion Anguk", city: "Seoul", address: "Seoul", description: "Cafe", category: "cafe" };
const id = "bbbbbbbb-2222-4222-8222-222222222222";
const initialData = { city: "Seoul", templateName: "Food trip", interests: ["Food & Dining"] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockReturnValue({ isLoaded: true, user: null });
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.stubGlobal("fetch", mocks.fetch);
  window.history.replaceState(null, "", "/itineraries/new");
  mocks.spot.mockResolvedValue(spot);
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, stored: true, itinerary: { id, title: "Saved trip" } }) });
});
afterEach(() => vi.unstubAllGlobals());
const generate = () => fireEvent.click(screen.getByRole("button", { name: /Generate/ }));

it("loads the selected canonical place on the server and continues to explicit placement", async () => {
  render(await NewItineraryPage({ searchParams: Promise.resolve({ spotId: spot.id }) }));
  expect(mocks.spot).toHaveBeenCalledWith(spot.id);
  expect(screen.getByText(/Choose its day and position/)).toBeTruthy();
});
it.each(["bad", [spot.id], ""])("rejects invalid selection data %s before lookup", async (spotId) => {
  render(await NewItineraryPage({ searchParams: Promise.resolve({ spotId }) }));
  expect(mocks.spot).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("unavailable");
});
it.each([null, "error"])("keeps ordinary creation available when the place is missing or hidden: %s", async (outcome) => {
  if (outcome === "error") mocks.spot.mockRejectedValue(new Error("offline"));
  else mocks.spot.mockResolvedValue(null);
  render(await NewItineraryPage({ searchParams: Promise.resolve({ spotId: spot.id }) }));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
});
it("does not require authentication or a lookup for ordinary creation", async () => {
  render(await NewItineraryPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.spot).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
});
it("passes selection to the saved editor URL, never to generation input", async () => {
  render(<ItineraryWizard initialData={initialData} selectedSpot={spot} />);
  generate();
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/itineraries/${id}/edit?spotId=${spot.id}`));
  expect(mocks.fetch.mock.calls[0][1].body).not.toContain(spot.id);
  expect(mocks.fetch.mock.calls[0][1].body).not.toContain(spot.name);
});
it("keeps normal saved creation on the detail route", async () => {
  render(<ItineraryWizard initialData={initialData} />);
  generate();
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/itineraries/${id}`));
});
it.each(["Choose Tokyo", "Choose multi"])("retains selection without blocking %s", async (action) => {
  render(<ItineraryWizard initialData={initialData} selectedSpot={spot} />);
  fireEvent.click(screen.getByRole("button", { name: action }));
  expect(screen.getByText(/Your selection stays/)).toBeTruthy();
  generate();
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/itineraries/${id}/edit?spotId=${spot.id}`));
});
it("removes selection only on explicit request", async () => {
  window.history.replaceState(null, "", `/itineraries/new?spotId=${spot.id}&city=Seoul`);
  render(<ItineraryWizard initialData={initialData} selectedSpot={spot} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove selected place" }));
  expect(window.location.search).toBe("?city=Seoul");
  generate();
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/itineraries/${id}`));
});
it.each([undefined, "not-a-uuid"])("retains generated content and selection when no persisted UUID exists: %s", async (savedId) => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, itinerary: { id: savedId, title: "Private draft" } }) });
  const storage = vi.spyOn(Storage.prototype, "setItem");
  render(<ItineraryWizard initialData={initialData} selectedSpot={spot} />);
  generate();
  await screen.findByRole("button", { name: "Download draft" });
  expect(screen.getByText(/Selected place: Cafe Onion/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Generate|Retry/ })).toBeNull();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(storage).not.toHaveBeenCalled();
  const create = vi.fn().mockReturnValue("blob:draft");
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Download draft" }));
  const blob = create.mock.calls[0][0] as Blob;
  const content = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
  expect(JSON.parse(content)).toMatchObject({ itinerary: { title: "Private draft" }, selectedSpot: spot });
  storage.mockRestore();
});
it("keeps anonymous generation available without shared draft storage", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ isAnonymous: true, itinerary: { title: "Anonymous draft" } }) });
  render(<ItineraryWizard initialData={initialData} />);
  generate();
  await screen.findByRole("button", { name: "Download draft" });
  expect(screen.getByRole("link", { name: "Sign up after downloading" })).toBeTruthy();
  expect(mocks.toast).not.toHaveBeenCalled();
});
it.each(["signup_required", { code: "unauthorized" }])("uses a local Clerk return URL and preserves wizard prefill", async (error) => {
  window.history.replaceState(null, "", "/itineraries/new?template=food-focused&redirect_url=https://evil.example");
  mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error, signupUrl: "https://evil.example" }) });
  render(<ItineraryWizard initialData={initialData} selectedSpot={spot} />);
  fireEvent.click(screen.getByRole("button", { name: "Choose multi" }));
  generate();
  await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  const signup = new URL(mocks.push.mock.calls[0][0], "https://localley.io");
  const returnTo = signup.searchParams.get("redirect_url")!;
  expect(returnTo.startsWith("/itineraries/new?")).toBe(true);
  expect(returnTo).not.toContain("evil.example");
  const query = new URL(returnTo, "https://localley.io").searchParams;
  expect(query.get("spotId")).toBe(spot.id);
  expect(query.get("cities")).toBe("seoul,tokyo");
  expect(query.get("interests")).toBe("Food & Dining");
  expect(query.get("template")).toBe("food-focused");
});
it("retains query prefill through the client split", () => {
  window.history.replaceState(null, "", "/itineraries/new?city=Seoul&days=12&interests=Food+%26+Dining&pace=active&budget=cheap&group=couple&localness=5&cities=seoul,tokyo");
  render(<NewItineraryClient />);
  expect(screen.getByText(/"days":12/).textContent).toContain('"tripMode":"multi"');
  expect(screen.getByText(/"days":12/).textContent).toContain('"pace":"active"');
  expect(screen.getByRole("button", { name: "Generate Itinerary" })).toBeTruthy();
});
it("preserves one-tap template generation with selected city", async () => {
  window.history.replaceState(null, "", "/itineraries/new?template=weekend-getaway&city=Seoul");
  render(<NewItineraryClient selectedSpot={spot} />);
  expect(screen.getByText(/"days":2/).textContent).toContain('"pace":"relaxed"');
  generate();
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/itineraries/${id}/edit?spotId=${spot.id}`));
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).templatePrompt).toContain("relaxed weekend getaway");
});
it("retains an explicitly unsaved draft even if a response contains an ID", async () => {
  mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ success: false, stored: false, itinerary: { id, title: "Draft" } }) });
  render(<ItineraryWizard initialData={initialData} selectedSpot={spot} />);
  generate();
  await screen.findByRole("button", { name: "Download draft" });
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});

it.each(["fetch success", "fetch error", "json success", "json error", "json draft", "json signup"])("ignores late %s after unmount", async (outcome) => {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise((res, rej) => { resolve = res; reject = rej; });
  const json = vi.fn(() => pending);
  if (outcome.startsWith("fetch")) mocks.fetch.mockReturnValue(pending);
  else mocks.fetch.mockResolvedValue({ ok: outcome !== "json signup", json });
  const { unmount } = render(<ItineraryWizard initialData={initialData} selectedSpot={spot} />);
  generate();
  if (outcome.startsWith("json")) await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
  unmount();
  await act(async () => {
    if (outcome.endsWith("error")) reject(new Error("Private late error"));
    else if (outcome === "fetch success") resolve({ ok: true, json });
    else if (outcome === "json draft") resolve({ stored: false, itinerary: { title: "Private late draft" } });
    else if (outcome === "json signup") resolve({ error: "signup_required" });
    else resolve({ stored: true, itinerary: { id, title: "Private late trip" } });
    await pending.catch(() => {});
  });
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  if (outcome === "fetch success") expect(json).not.toHaveBeenCalled();
});

it.each([
  ["user-a", "user-b"], ["user-a", "anonymous"], ["user-a", "loading"],
  ["loading", "anonymous"], ["anonymous", "user-a"],
])("discards the draft when Clerk identity changes from %s to %s", async (from, to) => {
  const identity = (value: string) => ({ isLoaded: value !== "loading", user: value.startsWith("user-") ? { id: value } : null });
  window.history.replaceState(null, "", "/itineraries/new?template=weekend-getaway&city=Seoul");
  mocks.user.mockReturnValue(identity(from));
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ stored: false, itinerary: { title: "Private draft" } }) });
  const { rerender } = render(<NewItineraryClient selectedSpot={spot} />);
  generate();
  await screen.findByRole("button", { name: "Download draft" });
  rerender(<NewItineraryClient selectedSpot={spot} />);
  expect(screen.getByRole("button", { name: "Download draft" })).toBeTruthy();
  mocks.user.mockReturnValue(identity(to));
  rerender(<NewItineraryClient selectedSpot={spot} />);
  expect(screen.queryByRole("region", { name: "Generated draft" })).toBeNull();
  expect(screen.getByRole("button", { name: "Generate for Seoul" })).toBeTruthy();
  mocks.user.mockReturnValue(identity(from));
  rerender(<NewItineraryClient selectedSpot={spot} />);
  expect(screen.queryByRole("button", { name: "Download draft" })).toBeNull();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("ignores the previous account's response after a new account mounts", async () => {
  window.history.replaceState(null, "", "/itineraries/new?template=weekend-getaway&city=Seoul");
  mocks.user.mockReturnValue({ isLoaded: true, user: { id: "user-a" } });
  let resolve!: (value: unknown) => void;
  const pending = new Promise((res) => { resolve = res; });
  mocks.fetch.mockResolvedValue({ ok: true, json: () => pending });
  const { rerender } = render(<NewItineraryClient selectedSpot={spot} />);
  generate();
  await act(async () => {});
  mocks.user.mockReturnValue({ isLoaded: true, user: { id: "user-b" } });
  rerender(<NewItineraryClient selectedSpot={spot} />);
  await act(async () => {
    resolve({ stored: true, itinerary: { id, title: "Account A trip" } });
    await pending;
  });
  expect(screen.getByRole("button", { name: "Generate for Seoul" })).toBeTruthy();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it.skipIf(!process.env.NEW_TRIP_SCREENSHOT_DIR)("reviews selection and recovery panels without external requests", async () => {
  const output = process.env.NEW_TRIP_SCREENSHOT_DIR!;
  await mkdir(output, { recursive: true });
  const css = await postcss([tailwind(config)]).process(await readFile("app/globals.css", "utf8"), { from: "app/globals.css" });
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ stored: false, itinerary: { title: "Draft" } }) });
  render(<ItineraryWizard initialData={initialData} selectedSpot={spot} />);
  fireEvent.click(screen.getByRole("button", { name: "Choose multi" }));
  const selection = screen.getByRole("region", { name: "Selected place" }).outerHTML;
  generate();
  await screen.findByRole("button", { name: "Download draft" });
  const recovery = screen.getByRole("region", { name: "Generated draft" }).outerHTML;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.route("**/*", (route) => route.abort());
    for (const width of [390, 900, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [state, markup] of [["selection", selection], ["recovery", recovery]]) {
        await page.setContent(`<html class="dark"><head><style>${css.css}</style></head><body class="bg-background text-foreground"><main class="mx-auto max-w-3xl">${markup}</main></body></html>`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.keyboard.press("Tab");
        expect(await page.locator("button").evaluate((button) => button === document.activeElement)).toBe(true);
        await page.screenshot({ path: `${output}/${state}-${width}.png`, fullPage: true });
      }
    }
  } finally { await browser.close(); }
}, 60000);
