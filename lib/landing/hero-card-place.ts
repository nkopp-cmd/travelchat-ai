/** A screen box in px. */
export interface Box { left: number; top: number; right: number; bottom: number }

export type HeroCardSide = "below" | "above" | "right" | "left";

export interface HeroCardInput {
    /** Featured pin anchor: the tip of the pin. */
    anchor: { x: number; y: number };
    card: { width: number; height: number };
    /** Pin face size; the pin sits above its anchor, centred. */
    pin: { width: number; height: number };
    /** The other visible pins. */
    pins: Box[];
    /** Hero copy and buttons: the card must not cover them. */
    avoid: Box[];
    /** The visible hero area. */
    bounds: Box;
    /** Preferred sides, best first. */
    order: HeroCardSide[];
}

export interface HeroCardPlace {
    side: HeroCardSide;
    /** Card centre x and top, relative to the anchor (the card is translated -50 % in x). */
    dx: number;
    dy: number;
    /** Indices of pins the card still covers; hide them while the card shows. */
    covered: number[];
}

const GAP = 8;
/** Matches .ll-hero-card bottom: 54px (desktop, above the pin) and top: 10px (phone, below the pin). */
const ABOVE_OFFSET = 54;
const BELOW_OFFSET = 10;

function overlaps(a: Box, b: Box) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function offset(side: HeroCardSide, card: HeroCardInput["card"], pin: HeroCardInput["pin"]) {
    switch (side) {
        case "below": return { dx: 0, dy: BELOW_OFFSET };
        case "above": return { dx: 0, dy: -ABOVE_OFFSET - card.height };
        case "right": return { dx: pin.width / 2 + GAP + card.width / 2, dy: -pin.height / 2 - card.height / 2 };
        case "left": return { dx: -(pin.width / 2 + GAP + card.width / 2), dy: -pin.height / 2 - card.height / 2 };
    }
}

function slideInside(x: number, cardWidth: number, bounds: Box) {
    const pastLeft = bounds.left + GAP - (x - cardWidth / 2);
    const pastRight = x + cardWidth / 2 - (bounds.right - GAP);
    if (pastLeft > 0) return pastLeft;
    if (pastRight > 0) return -pastRight;
    return 0;
}

/**
 * The side where the looping hero card covers no pin and no copy and stays on screen. When every side covers a pin,
 * the side with the fewest covered pins wins and those pins are returned to be hidden: a label never sits on a pin.
 */
export function heroCardPlace(input: HeroCardInput): HeroCardPlace {
    const { anchor, card, pin, pins, avoid, bounds, order } = input;
    let best: (HeroCardPlace & { score: number }) | null = null;
    for (const side of order) {
        const base = offset(side, card, pin);
        // Above and below may slide sideways to stay on screen (a pin at the screen edge, 768 px case).
        const slide = side === "above" || side === "below" ? slideInside(anchor.x, card.width, bounds) : 0;
        const dx = base.dx + slide;
        const dy = base.dy;
        const left = anchor.x + dx - card.width / 2;
        const top = anchor.y + dy;
        const box = { left: left - GAP / 2, top: top - GAP / 2, right: left + card.width + GAP / 2, bottom: top + card.height + GAP / 2 };
        const outside = left < bounds.left + GAP || top < bounds.top + GAP
            || left + card.width > bounds.right - GAP || top + card.height > bounds.bottom - GAP;
        const covered = pins.flatMap((other, index) => overlaps(box, other) ? [index] : []);
        const score = (outside ? 1000 : 0) + avoid.filter((zone) => overlaps(box, zone)).length * 100 + covered.length;
        if (!best || score < best.score) best = { side, dx, dy, covered, score };
        if (score === 0) break;
    }
    const { side, dx, dy, covered } = best!;
    return { side, dx, dy, covered };
}
