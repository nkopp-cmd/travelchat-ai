import assert from "node:assert/strict";
import { resolve } from "node:path";

// Computed token checks and keyboard sampling are evidence, not a full WCAG audit.
export async function captureBrowserState(page, results, state, evidence, widths = [390, 1440]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    if (state === "reset-signed-in") {
      assert.equal(await page.locator("#account-title").textContent(), "Reset password",
        `Signed-in reset heading must identify the reset form at ${width}px`);
    }
    const measured = await page.evaluate((state) => {
      const root = getComputedStyle(document.documentElement);
      const rgb = (color) => {
        if (color.startsWith("#")) {
          const hex = color.length === 4 ? [...color.slice(1)].map((value) => value + value).join("") : color.slice(1);
          return hex.match(/../g).map((value) => parseInt(value, 16));
        }
        return color.match(/[\d.]+/g).slice(0, 3).map(Number);
      };
      const luminance = (color) => rgb(color).map((value) => {
        value /= 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
      const contrast = (a, b) => {
        const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (values[0] + .05) / (values[1] + .05);
      };
      const token = (name) => name.startsWith("--") ? root.getPropertyValue(name).trim() : name;
      const pairs = [
        ["text/background", "--text", "--background", 4.5],
        ["muted/background", "--muted", "--background", 4.5],
        ["text/surface", "--text", "--surface", 4.5],
        ["muted/surface", "--muted", "--surface", 4.5],
        ["action text", "#ffffff", "--accent", 4.5],
        ["selected action", "--accent", "--accent-soft", 4.5],
        ["error text", "--error", "--error-bg", 4.5],
        ["control boundary", "--control", "--background", 3],
        ["focus indicator", "--accent", "--background", 3],
      ].map(([role, foreground, background, minimum]) => ({ role, minimum, ratio: contrast(token(foreground), token(background)) }));
      if (state.startsWith("preferences-")) {
        for (const [index, element] of [...document.querySelectorAll('.native-trips p, .native-trips label')].entries()) {
          pairs.push({ role: `preference text ${index}`, minimum: 4.5,
            ratio: contrast(getComputedStyle(element).color, token('--background')) });
        }
        for (const element of document.querySelectorAll('.native-trips [role="switch"]')) {
          const track = element.getBoundingClientRect();
          const thumb = element.querySelector('[data-slot="switch-thumb"]').getBoundingClientRect();
          if (thumb.left < track.left || thumb.right > track.right) throw new Error('Preference thumb clips outside track');
          const checked = element.getAttribute('aria-checked') === 'true';
          if (checked ? thumb.left <= track.left + track.width / 2 : thumb.right >= track.left + track.width / 2) throw new Error('Preference thumb does not show the selected side');
        }
      }
      const controls = [...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex='0']")].filter((element) => {
        const box = element.getBoundingClientRect();
        const css = getComputedStyle(element);
        return box.width && box.height && box.right > 0 && css.visibility !== "hidden" && css.display !== "none";
      }).map((element) => {
        const box = element.getBoundingClientRect();
        return { tag: element.tagName, width: box.width, height: box.height, disabled: !!element.disabled };
      });
      const moving = [...document.querySelectorAll("*")].some((element) => {
        const css = getComputedStyle(element);
        return css.animationName !== "none" || css.transitionDuration.split(",").some((duration) => parseFloat(duration) > 0);
      });
      return { pairs, controls, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches && !moving,
        overflow: document.documentElement.scrollWidth > innerWidth,
        korean: [...document.querySelectorAll("article h3")].some((element) => /[\uac00-\ud7a3]{2}/.test(element.textContent)) };
    }, state);
    assert.equal(measured.overflow, false);
    assert.equal(measured.reducedMotion, true);
    assert.ok(measured.controls.length > 0);
    assert.ok(measured.controls.every((control) => control.width >= 24 && control.height >= 24), "Every measured target meets 24px");
    assert.ok(measured.controls.every((control) => control.width >= 44 && control.height >= 44), "Every measured target meets preferred 44px");
    assert.ok(measured.pairs.every((pair) => pair.ratio >= pair.minimum), "Measured token contrast meets its threshold");
    if (state === "long-name" || state === "saved") assert.ok(measured.korean, "Real Korean fixture text must render");
    // Real Tab navigation, not a programmatic focus style or a screenshot-only override.
    const visited = new Set();
    let outline = Infinity;
    const enabled = measured.controls.filter((control) => !control.disabled).length;
    // Establish a start point, then use real forward/backward Tab to enter keyboard modality.
    await page.getByRole("link", { name: "Skip to places", exact: true }).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    for (let i = 0; i < enabled * 2 + 2 && visited.size < enabled; i++) {
      const focus = await page.evaluate(() => {
        const active = document.activeElement;
        const css = getComputedStyle(active);
        return { index: [...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex='0']")].indexOf(active),
          visible: active.matches(":focus-visible"), width: parseFloat(css.outlineWidth), style: css.outlineStyle };
      });
      // Chromium briefly puts focus on browser chrome when Tab wraps past the last control.
      if (focus.index < 0) { await page.keyboard.press("Tab"); continue; }
      assert.ok(focus.visible && focus.width >= 2 && !["none", "hidden"].includes(focus.style), "Keyboard focus must have a visible outline");
      visited.add(focus.index);
      outline = Math.min(outline, focus.width);
      if (visited.size < enabled) await page.keyboard.press("Tab");
    }
    assert.equal(visited.size, enabled, "Every enabled control must be reachable with Tab");
    // Full-page captures otherwise paint sticky elements at the previous keyboard-scroll offset.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const secretsHidden = await page.evaluate(() => {
      const token = new URL(location.href).searchParams.get("token");
      const text = document.body.innerText;
      const passwords = [...document.querySelectorAll('input[type="password"]')].map((input) => input.value).filter(Boolean);
      const visibleInputs = [...document.querySelectorAll("input,textarea")].filter((input) => !["password", "hidden"].includes(input.type));
      return [...passwords, ...(token ? [token] : [])].every((secret) => !text.includes(secret)
        && visibleInputs.every((input) => !input.value.includes(secret)));
    });
    assert.ok(secretsHidden, "Screenshot must not expose a token or plaintext password");
    await page.screenshot({ path: resolve(results, `${state}-${width}.png`), fullPage: true });
    evidence.push({ state, width, controls: measured.controls.length,
      minimumTarget: Math.min(...measured.controls.flatMap((control) => [control.width, control.height])),
      contrast: measured.pairs.map((pair) => ({ role: pair.role, ratio: Number(pair.ratio.toFixed(2)) })),
      keyboardControls: visited.size, focusOutlinePx: outline, reducedMotion: measured.reducedMotion, overflow: measured.overflow, korean: measured.korean });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
