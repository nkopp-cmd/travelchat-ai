import { expect, type Locator, type Page } from "@playwright/test";

// Selectors for the MapLibre pin map (components/spots/spot-pin-map.tsx). A single pin is a
// button.ll-pin labelled "<name>, <category>"; overlapping pins merge into button.ll-pin-group
// with a count badge. Selecting a pin opens a role=dialog card titled with the spot name.

export function pinMap(discovery: Locator): Locator {
  return discovery.getByRole("region", { name: "Map of this page's spots" });
}

export function singlePins(map: Locator): Locator {
  return map.locator("button.ll-pin:not(.ll-pin-group)");
}

/** Spots on the map: single pins plus the count of every group. */
export async function pinnedTotal(map: Locator): Promise<number> {
  return map.evaluate((element) => {
    const singles = element.querySelectorAll("button.ll-pin:not(.ll-pin-group)").length;
    const grouped = [...element.querySelectorAll("button.ll-pin-group .ll-pin-count")]
      .reduce((sum, badge) => sum + Number(badge.textContent || 0), 0);
    return singles + grouped;
  });
}

export async function expectTilesRendered(map: Locator): Promise<void> {
  await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible();
}

/** A single pin by spot id. Selecting a pin pans the map and redraws every pin, so never hold a pin by index. */
export function pinById(map: Locator, id: string): Locator {
  return map.locator(`button.ll-pin[data-pin-id="${id}"]`);
}

/** The pin that holds a spot: its own pin, or the group it merged into after the map moved. */
export function pinOrGroupOf(map: Locator, id: string): Locator {
  return map.locator(`button.ll-pin[data-pin-id="${id}"], button.ll-pin-group[data-pin-ids~="${id}"]`);
}

/** Phones and tablets keep the list sheet collapsed after a pin card; step it back to the half snap (filters + map). */
export async function openListSheet(page: Page): Promise<void> {
  const handle = page.locator('button[aria-controls][aria-label^="Show "]');
  for (let step = 0; step < 2 && await handle.isVisible(); step++) {
    if ((await handle.getAttribute("aria-label")) === "Show only the map") return;
    await handle.click();
  }
}

/** The first single pin whose centre is not covered by another pin, the list sheet or a control. */
export async function firstClickablePin(map: Locator, skipId = ""): Promise<Locator> {
  let id = "";
  await expect.poll(async () => {
    id = await singlePins(map).evaluateAll((elements, skip) => {
      const pin = elements.find((element) => {
        if (element.getAttribute("data-pin-id") === skip) return false;
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height) return false;
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return Boolean(hit && element.contains(hit));
      });
      return pin?.getAttribute("data-pin-id") || "";
    }, skipId);
    return id;
  }).not.toBe("");
  return pinById(map, id);
}

/** Spot list next to the map. Phones hide it (visibility) while a pin card is open, so no role query. */
export function selectedListTitle(discovery: Locator): Locator {
  return discovery.locator('ul[aria-label="Spots on this page"] > li[aria-current=true]').getByTestId("spot-card-title");
}

/** Spot name of a single pin: its label minus the trailing ", <category>". */
export async function pinName(pin: Locator): Promise<string> {
  const label = (await pin.getAttribute("aria-label")) || "";
  const category = (await pin.locator(".ll-pin-chip").textContent()) || "";
  return label.endsWith(`, ${category}`) ? label.slice(0, -(category.length + 2)) : label;
}

/** The open pin card for a spot, and the /spots/<uuid> path of its Details link. */
export async function expectPinCard(page: Page, name: string): Promise<string> {
  const card = page.getByRole("dialog", { name, exact: true });
  await expect(card).toBeVisible();
  const href = (await card.getByRole("link", { name: "Details", exact: true }).getAttribute("href")) || "";
  expect(href).toMatch(/^\/spots\/[0-9a-f-]{36}$/i);
  return href;
}
