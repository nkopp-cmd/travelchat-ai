import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { base } from "./story-studio-preview/fixtures";
import { writeFile } from "node:fs/promises";

function contrastRatio(a: string, b: string) {
  const luminance = (color: string) => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
    .map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

async function open(page: Page, scenario: string, video = true) {
  await page.goto(`/?scenario=${scenario}`);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Stories", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  if (video) {
    await page.getByRole("tab", { name: "Image carousel" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Video", exact: true })).toHaveAttribute("aria-selected", "true");
  }
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const metrics = await page.getByRole("dialog").evaluate(dialog => {
    const bounds = dialog.getBoundingClientRect();
    return {
      width: innerWidth, dialog: { left: bounds.left, right: bounds.right },
      overflow: dialog.scrollWidth > dialog.clientWidth,
      controls: [...dialog.querySelectorAll<HTMLElement>("button, a, [role=radio]")].filter(el => el.getBoundingClientRect().width).map(el => {
        const rect = (el.closest("label") || el).getBoundingClientRect();
        return { text: el.getAttribute("aria-label") || el.textContent || el.getAttribute("value"), width: rect.width, height: rect.height };
      }),
      colors: [...dialog.querySelectorAll("p, h3, [role=tab]")].map(el => ({ text: el.textContent, color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor })),
      focus: { text: document.activeElement?.textContent, visible: document.activeElement?.matches(":focus-visible"), shadow: document.activeElement ? getComputedStyle(document.activeElement).boxShadow : null },
    };
  });
  await info.attach(`${name}-metrics`, { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
  await writeFile(info.outputPath(`${name}-metrics.json`), JSON.stringify(metrics, null, 2));
  expect(metrics.overflow).toBe(false);
  expect(metrics.dialog.left).toBeGreaterThanOrEqual(0);
  expect(metrics.dialog.right).toBeLessThanOrEqual(metrics.width);
  for (const control of metrics.controls) {
    expect(control.width, `${name}: ${control.text} target width`).toBeGreaterThanOrEqual(24);
    expect(control.height, `${name}: ${control.text} target height`).toBeGreaterThanOrEqual(24);
  }
  const close = metrics.controls.find(control => control.text === "Close");
  expect(close).toBeDefined();
  expect(close!.width).toBeGreaterThanOrEqual(44);
  expect(close!.height).toBeGreaterThanOrEqual(44);
}

test.beforeEach(async ({ context }) => {
  await context.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4174" ? route.continue() : route.abort("blockedbyclient"));
});

test("touch, focus trap, font provenance, contrast and reduced motion", async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });
  await context.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4174" ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4174/?scenario=ready");
  await page.getByRole("button", { name: "Stories", exact: true }).first().tap();
  await page.getByRole("tab", { name: "Video", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Create video", exact: true })).toBeEnabled();
  await page.getByText("6 seconds", { exact: false }).tap();
  await expect(page.getByRole("radio").nth(2)).toBeChecked();
  await page.getByRole("tab", { name: "Video", exact: true }).focus();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await page.getByRole("dialog").evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: '[role="dialog"] p' });
  const fonts = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(fonts.fonts.some(font => font.familyName === "Noto Sans KR" && font.isCustomFont && font.glyphCount > 0)).toBe(true);
  const measurements = await page.getByRole("dialog").evaluate(dialog => {
    return [...dialog.querySelectorAll("p, h3, [role=tab], button[data-slot=button], [role=radio]")].map(el => {
      const style = getComputedStyle(el);
      let parent: Element | null = el;
      let background = "rgba(0, 0, 0, 0)";
      while (parent && background === "rgba(0, 0, 0, 0)") { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; }
      const border = el.getAttribute("role") === "radio";
      return { text: el.getAttribute("aria-label") || el.textContent || el.getAttribute("value"), color: border ? style.borderTopColor : style.color, background, minimum: border ? 3 : 4.5 };
    });
  }).then(items => items.map(item => ({ ...item, ratio: contrastRatio(item.color, item.background) })));
  await writeFile(info.outputPath("font-contrast.json"), JSON.stringify({ fonts, measurements }, null, 2));
  for (const item of measurements) expect(item.ratio, `${item.text} contrast`).toBeGreaterThanOrEqual(item.minimum);
  await capture(page, info, "touch-reduced-motion");
  const submission = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(base));
  await page.getByRole("button", { name: "Create video", exact: true }).tap();
  expect((await submission).postDataJSON()).toEqual({ duration: 6 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Stories", exact: true }).first()).toBeFocused();
  await context.close();
});

for (const [width, height] of [[390, 844], [900, 1000], [1440, 1000]]) {
  test(`${width} real components and all video states`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await open(page, "unavailable", false);
    const placeholder = await page.getByText("Story Format", { exact: true }).evaluate(label => {
      const opacities = [];
      let ancestor: Element | null = label;
      let gradient = "none";
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        opacities.push(Number(style.opacity));
        if (style.backgroundImage !== "none") gradient = style.backgroundImage;
        ancestor = ancestor.parentElement;
      }
      return { color: getComputedStyle(label).color, gradient, opacities };
    });
    expect(placeholder.opacities.every(value => value === 1)).toBe(true);
    const stops = placeholder.gradient.match(/rgba?\([^)]+\)/g) || [];
    expect(stops).toHaveLength(2);
    const ratios = stops.map(stop => contrastRatio(placeholder.color, stop));
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await writeFile(info.outputPath("placeholder-contrast.json"), JSON.stringify({ ...placeholder, ratios }, null, 2));
    await capture(page, info, "carousel");
    await page.getByRole("button", { name: "Generate 3 Slides" }).click();
    await expect(page.getByRole("button", { name: "Generate again" })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText("Stories generated!");
    await expect(page.locator("[toast-close]")).toHaveCount(0);
    await page.getByRole("dialog").evaluate(dialog => { dialog.scrollTop = 0; });
    const header = await page.getByRole("heading", { name: "Create Story", exact: true }).evaluate(title => {
      const bounds = title.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return { uncovered: !!hit && title.contains(hit), top: bounds.top, bottom: bounds.bottom };
    });
    expect(header.uncovered).toBe(true);
    await page.getByRole("button", { name: "Close", exact: true }).click({ trial: true });
    await writeFile(info.outputPath("inline-status-header.json"), JSON.stringify(header, null, 2));
    await capture(page, info, "carousel-synthetic");
    await page.getByRole("button", { name: "Generate again" }).scrollIntoViewIfNeeded();
    await capture(page, info, "carousel-settled");
    for (const [scenario, text] of [
      ["unavailable", "Video is not available now."], ["budget", "The video limit has been reached."],
      ["loading", "Checking video availability..."], ["error", "Video status is not available. Check again later."],
      ["zero", "Video is not available now."], ["premium_required", "Video requires Premium."],
      ["unsupported_story_text", "This story contains text that video does not support yet."],
      ["processing_unavailable", "Video processing is not available now."],
      ["unauthorized", "Sign in to check video availability."], ["not_found", "This itinerary or video is not available."],
    ]) {
      await open(page, scenario);
      await expect(page.getByRole("status")).toContainText(text);
      await expect(page.getByRole("button", { name: "Create video", exact: true })).toHaveCount(0);
      for (const radio of await page.getByRole("radio").all()) await expect(radio).toBeDisabled();
      await capture(page, info, scenario);
    }
    await open(page, "ready");
    await expect(page.getByRole("button", { name: "Create video", exact: true })).toBeEnabled();
    await page.getByRole("radio").first().focus();
    await page.keyboard.press("ArrowDown", { delay: 100 });
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
    await capture(page, info, "ready-keyboard");
    for (const [state, text] of Object.entries({
      reserved: "Your video request is reserved.", submitting: "Submitting your video request.", queued: "Your video is queued.",
      running: "Your video is being generated.", provider_ready: "Generation finished. Your download is not ready yet.",
      processing: "Preparing your private MP4 download.", delivered: "Your video is ready.",
      processing_failed: "Video processing failed. No download is available.", failed: "Video generation failed.", cancelled: "The video request was cancelled.",
      unknown: "The request needs review.", delivered_missing: "Download is not available.",
    })) {
      await open(page, state);
      await page.getByRole("button", { name: "Create video", exact: true }).click();
      await expect(page.getByRole("status")).toContainText(text);
      await expect(page.getByRole("progressbar")).toHaveCount(0);
      await capture(page, info, state);
      if (["failed", "processing_failed", "cancelled", "delivered", "delivered_missing"].includes(state)) {
        await expect(page.getByRole("radio").first()).toBeEnabled();
      } else await expect(page.getByRole("radio").first()).toBeDisabled();
      if (state !== "delivered") await expect(page.getByRole("link", { name: "Download MP4" })).toHaveCount(0);
      if (state === "delivered") {
        await expect(page.getByRole("link", { name: "Download MP4" })).toHaveAttribute("href", `${base}/preview-job/download`);
        const download = page.waitForEvent("download");
        await page.getByRole("link", { name: "Download MP4" }).click();
        expect((await download).suggestedFilename()).toBe("synthetic-preview.txt");
      }
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Stories", exact: true }).first()).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("unknown retry preserves body and key across two real dialogs", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: { key: string | undefined; body: string | null }[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(base)) requests.push({ key: request.headers()["idempotency-key"], body: request.postData() }); });
  await open(page, "unknown");
  await page.getByRole("button", { name: "Create video", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check existing request" })).toBeEnabled();
  await capture(page, info, "unknown-first");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Stories", exact: true }).nth(1).click();
  await page.getByRole("tab", { name: "Video", exact: true }).click();
  await page.getByRole("button", { name: "Check existing request" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0].key).toMatch(/^[\da-f-]{36}$/);
  expect(requests[1]).toEqual(requests[0]);
  await capture(page, info, "unknown-second");
});

test("one mock submission polls running through processing to delivery", async ({ page }, info) => {
  await open(page, "ready");
  await page.getByRole("button", { name: "Create video", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Your video is being generated.");
  for (const [name, text] of [["provider-ready", "Generation finished."], ["processing", "Preparing your private"], ["delivered", "Your video is ready."]]) {
    await expect(page.getByRole("status")).toContainText(text, { timeout: 15_000 });
    await capture(page, info, name);
  }
});

test("preview denies unknown APIs and external fetch; 200 percent CSS zoom remains usable", async ({ page }, info) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await open(page, "ready");
  expect(await page.evaluate(async () => (await fetch("/api/preview-denied", { method: "POST" })).status)).toBe(403);
  expect(await page.evaluate(async () => { try { await fetch("https://example.invalid/blocked"); return false; } catch { return true; } })).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await page.getByRole("button", { name: "Create video", exact: true }).scrollIntoViewIfNeeded();
  await capture(page, info, "css-zoom-200");
  await page.getByRole("button", { name: "Create video", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Your video is being generated.");
});
