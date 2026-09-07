import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "allow" });

for (const width of [390, 900, 1440]) {
  test(`real hosted anonymous Seoul ${width}`, async ({ browser, baseURL }, info) => {
    test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Requires an explicit hosted candidate and official access file");
    test.setTimeout(240_000);
    const access = JSON.parse(await readFile(".vercel/browser-access.json", "utf8"));
    const origin = new URL(baseURL!).origin;
    if (access.origin !== origin) throw new Error("Authorized access origin does not match test origin");
    const headers: Record<string, string> = access.headers;
    if (!headers || Object.keys(headers).length !== 1 || !Object.entries(headers).every(([key, value]) => key.toLowerCase() === "x-vercel-protection-bypass" && typeof value === "string" && value.length > 0)) {
      throw new Error(`Unexpected access schema; field names only: ${Object.keys(access).join(",")}`);
    }
    const safe = (value: string) => {
      for (const secret of Object.values(headers)) value = value.split(secret).join("[redacted]");
      return value.replace(/https?:\/\/[^\s"'<>]+/g, (raw) => {
        try { const url = new URL(raw); return url.origin + url.pathname + (url.search ? "?" + [...url.searchParams.keys()].join("&") : ""); }
        catch { return "[url]"; }
      }).replace(/(token|secret|authorization|cookie)[=:]\s*[^\s,;]+/gi, "$1=[redacted]");
    };
    const results: { check: string; passed: boolean; detail?: unknown }[] = [];
    const errors: { kind: string; message: string }[] = [];
    const network: { path: string; status: number; type: string }[] = [];
    const blocked = new Set<string>();
    const upstream: unknown[] = [];
    const clerkErrors: unknown[] = [];
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const decoded = decodeURIComponent(url.href);
      if (decoded.includes("/api/places/photo") || /(^|\.)(googleapis\.com|fal\.ai|fal\.run|openai\.com|anthropic\.com|byteplus\.com|volces\.com|tripadvisor\.com|pexels\.com)$/.test(url.hostname)
        || /\/api\/(images|subscription|connect|viator)\//.test(url.pathname)
        || (url.origin === origin && !["GET", "HEAD", "OPTIONS"].includes(request.method()) && !/^\/api\/spots\/(save|[0-9a-f-]{36}\/reviews)$/.test(url.pathname))) {
        blocked.add(safe(url.href));
        return route.abort("blockedbyclient");
      }
      if (url.origin === access.origin) {
        // Real upstream responses only. Disable automatic redirects so the secret cannot follow an off-origin redirect.
        try {
          const response = await route.fetch({ headers: { ...request.headers(), ...headers }, maxRedirects: 0, timeout: 45_000 });
          if (request.isNavigationRequest() || request.method() !== "GET") upstream.push({
            path: safe(url.href), method: request.method(), status: response.status(),
            location: response.headers().location ? safe(new URL(response.headers().location, origin).href) : undefined,
          });
          await route.fulfill({ response });
        } catch {
          errors.push({ kind: "transport", message: `Upstream request failed: ${safe(url.href)}` });
          await route.abort();
        }
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    page.on("pageerror", error => errors.push({ kind: "pageerror", message: safe(error.message) }));
    page.on("console", message => {
      if (message.type() === "error") errors.push({ kind: "console", message: safe(message.text()) });
    });
    page.on("response", async response => {
      const url = new URL(response.url());
      if (url.origin === origin || /clerk/.test(url.hostname)) network.push({ path: safe(response.url()), status: response.status(), type: response.request().resourceType() });
      if (url.hostname === "clerk.localley.io" && response.status() >= 400) {
        const body = await response.json().catch(() => null);
        clerkErrors.push({ path: safe(url.href), status: response.status(), errors: body?.errors?.map((error: { code?: string; message?: string; long_message?: string }) => ({ code: error.code, message: safe(error.message || ""), detail: safe(error.long_message || "") })) });
      }
    });
    const check = async (name: string, action: () => Promise<unknown>) => {
      try { results.push({ check: name, passed: true, detail: await action() }); }
      catch (error) { results.push({ check: name, passed: false, detail: safe(error instanceof Error ? error.message : String(error)) }); }
    };
    const navigate = async (path: string) => {
      const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
      return { status: response?.status(), path: safe(page.url()) };
    };
    const shot = async (name: string) => {
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      return { overflow };
    };
    let selectedPath = "";
    let selectedName = "";
    try {
      await check("landing SSR and JavaScript", async () => {
        const response = await navigate("/");
        expect(response.status).toBe(200);
        expect(new URL(page.url()).origin).toBe(origin);
        await expect(page.locator("h1")).toBeVisible();
        await expect.poll(() => network.filter(r => r.type === "script" && r.status === 200).length).toBeGreaterThan(0);
        return { ...response, ...await shot("landing") };
      });
      await check("Seoul map 24 real pins and tiles", async () => {
        const response = await navigate("/spots?city=seoul&view=map");
        expect(response.status).toBe(200);
        await expect(page.getByRole("button", { name: "Map view", exact: true })).toHaveAttribute("aria-pressed", "true");
        const discovery = page.getByRole("region", { name: "Discovery map", exact: true });
        await expect(discovery.getByRole("button", { name: /^Pin \d+:/ })).toHaveCount(24);
        await expect(discovery.locator(".leaflet-marker-icon")).toHaveCount(24);
        await expect(discovery.locator(".leaflet-tile-loaded").first()).toBeVisible();
        return { ...response, pins: 24, ...await shot("map") };
      });
      await check("keyboard selection matches real mapped card", async () => {
        const discovery = page.getByRole("region", { name: "Discovery map", exact: true });
        const choices = discovery.getByRole("button", { name: /^Pin \d+:/ });
        await choices.first().focus();
        await page.keyboard.press("Tab");
        // The list can include a directions link between spot buttons.
        for (let step = 0; step < 4 && !await choices.nth(1).evaluate(el => el === document.activeElement); step++) await page.keyboard.press("Tab");
        await expect(choices.nth(1)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(choices.nth(1)).toHaveAttribute("aria-pressed", "true");
        selectedName = (await choices.nth(1).locator("span").first().innerText()).replace(/^Pin \d+: /, "");
        await expect(discovery.getByTestId("spot-card-title")).toHaveText(selectedName);
        selectedPath = await discovery.getByTestId("spot-card-title").locator("..").getAttribute("href") || "";
        expect(selectedPath).toMatch(/^\/spots\/[0-9a-f-]{36}$/i);
        await discovery.getByTestId("spot-card").scrollIntoViewIfNeeded();
        return { selectedName, selectedPath, ...await shot("selected-card") };
      });
      await check("mouse map selection matches card", async () => {
        const discovery = page.getByRole("region", { name: "Discovery map", exact: true });
        const map = discovery.getByRole("region", { name: "Map of this page's spots" });
        await map.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
        const markers = map.locator(".leaflet-marker-icon");
        const visible = await markers.evaluateAll(elements => elements.flatMap(el => {
          const label = el.querySelector("span");
          if (!label) return [];
          const box = label.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return hit && el.contains(hit) ? [Number(label.textContent)] : [];
        }));
        const number = visible.find(value => value !== 2);
        expect(number).toBeDefined();
        await markers.locator("span").filter({ hasText: new RegExp(`^${number}$`) }).click();
        const choice = discovery.getByRole("button", { name: new RegExp(`^Pin ${number}:`) });
        await expect(choice).toHaveAttribute("aria-pressed", "true");
        const name = (await choice.locator("span").first().innerText()).replace(/^Pin \d+: /, "");
        await expect(discovery.getByTestId("spot-card-title")).toHaveText(name);
        return { number, name, ...await shot("mouse-selection") };
      });
      await check("real backend Food filter and search", async () => {
        await page.getByRole("group", { name: "Quick filters" }).getByRole("button", { name: "Food", exact: true }).click();
        await expect(page).toHaveURL(url => url.searchParams.get("category") === "Food");
        const discovery = page.getByRole("region", { name: "Discovery map", exact: true });
        await expect(discovery.getByTestId("spot-category-chip").filter({ visible: true }).first()).toHaveText("Food");
        const count = await discovery.getByRole("button", { name: /^Pin \d+:/ }).count();
        const name = await discovery.getByTestId("spot-card-title").innerText();
        await page.getByRole("textbox", { name: "Search spots", exact: true }).fill(name);
        await expect(page).toHaveURL(url => url.searchParams.get("search") === name);
        await expect(discovery.getByTestId("spot-card-title")).toHaveText(name);
        const pins = discovery.getByRole("button", { name: /^Pin \d+:/ });
        await expect.poll(() => pins.count()).toBeLessThan(count);
        const searchedPins = await pins.count();
        expect(searchedPins).toBeGreaterThan(0);
        const names = await pins.locator("span:first-child").allTextContents();
        expect(names.every(label => label.includes(name))).toBe(true);
        return { filteredPins: count, searchedPins, names, search: name, ...await shot("filtered-search") };
      });
      await check("service worker scope and second map load", async () => {
        await navigate("/spots?city=seoul&view=map");
        await expect(page.locator(".leaflet-marker-icon")).toHaveCount(24);
        const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => ({ scope: r.scope, script: r.active?.scriptURL })));
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.locator(".leaflet-marker-icon")).toHaveCount(24);
        await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
        expect(registrations.length).toBeGreaterThan(0);
        expect(registrations.every(r => r.scope === origin + "/")).toBe(true);
        return { registrations, ...await shot("second-load") };
      });
      await check("selected real spot detail", async () => {
        expect(selectedPath).not.toBe("");
        const response = await navigate(selectedPath);
        expect(response.status).toBe(200);
        await expect(page.getByTestId("spot-detail-hero")).toBeVisible();
        await expect(page.getByTestId("spot-detail-address").filter({ visible: true }).first()).toBeVisible();
        return { ...response, ...await shot("detail") };
      });
      await check("anonymous save API rejection", async () => {
        const result = await page.evaluate(async () => {
          const response = await fetch("/api/spots/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", redirect: "manual" });
          return { status: response.status, type: response.type };
        });
        results.push({ check: "save HTTP status", passed: result.status >= 400, detail: result });
        expect([401, 404].includes(result.status) || result.type === "opaqueredirect").toBe(true);
        return result;
      });
      await check("public GET reviews and unsigned POST rejection", async () => {
        expect(selectedPath).not.toBe("");
        const path = `/api${selectedPath}/reviews`;
        const result = await page.evaluate(async path => {
          const get = await fetch(path);
          const body = await get.json().catch(() => null);
          // Invalid payload provides a second write guard if authentication fails open.
          const post = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", redirect: "manual" });
          return { get: get.status, total: body?.total, reviewsArray: Array.isArray(body?.reviews), post: post.status, postType: post.type };
        }, path);
        results.push({ check: "review HTTP statuses", passed: result.get === 200 && [401, 404].includes(result.post), detail: result });
        expect(result.get).toBe(200);
        expect(result.reviewsArray).toBe(true);
        expect([401, 404].includes(result.post) || result.postType === "opaqueredirect").toBe(true);
        return result;
      });
      await check("anonymous save UI requires sign-in", async () => {
        await page.getByRole("button", { name: `Save ${selectedName}`, exact: true }).filter({ visible: true }).first().click();
        await expect(page).toHaveURL(url => url.pathname.startsWith("/sign-in"));
        return { path: safe(page.url()), ...await shot("save-rejected") };
      });
      for (const path of ["/sign-in", "/sign-up", "/dashboard"]) {
        await check(`${path} status and widget`, async () => {
          const response = await navigate(path);
          results.push({ check: `${path} HTTP`, passed: response.status !== undefined && response.status < 500, detail: response });
          expect(response.status).toBeLessThan(500);
          if (path !== "/dashboard") {
            await page.waitForTimeout(2500);
            await shot(path.slice(1));
            await expect(page.locator(".cl-card").first()).toBeVisible({ timeout: 20_000 });
            await expect(page.locator("input").filter({ visible: true }).first()).toBeVisible();
          }
          if (path === "/dashboard") {
            expect(new URL(page.url()).hostname, "Protected route must reach app authentication, not Vercel login").not.toBe("vercel.com");
          }
          return { ...response, ...await shot(path.slice(1)) };
        });
      }
    } finally {
      await page.screenshot({ path: info.outputPath(`final-${width}.png`), fullPage: true }).catch(() => {});
      await writeFile(info.outputPath("evidence.json"), JSON.stringify({ width, results, errors, clerkErrors, upstream, network, blocked: [...blocked] }, null, 2));
      await context.close();
    }
    expect(results.filter(result => !result.passed).map(result => result.check)).toEqual([]);
  });
}
