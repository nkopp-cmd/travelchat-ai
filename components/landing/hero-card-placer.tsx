"use client";

import { useEffect } from "react";
import { heroCardPlace, type Box, type HeroCardSide } from "@/lib/landing/hero-card-place";

const PHONE_ORDER: HeroCardSide[] = ["below", "right", "left", "above"];
const WIDE_ORDER: HeroCardSide[] = ["above", "right", "left", "below"];
// The featured pin grows to 1.18x while its card shows; pins are compared with that margin.
const FOCUS_MARGIN = 4;

function box(rect: DOMRect): Box {
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/** The real text lines and controls of the hero copy, not its full-width blocks (768 px case). */
function copyBoxes(zone: HTMLElement): Box[] {
    const boxes = [...zone.querySelectorAll<HTMLElement>("a, button")].map((el) => box(el.getBoundingClientRect()));
    const walker = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) if (rect.width && rect.height) boxes.push(box(rect));
    }
    return boxes;
}

/**
 * Moves the looping hero card to a side where it covers no pin and no copy (plan localley-map-photos-edge-pins
 * item 5). Layout boxes only (anchors and offset sizes), so the pop and card animations do not change the result.
 */
export function HeroCardPlacer() {
    useEffect(() => {
        const scene = document.querySelector<HTMLElement>(".ll-hero-scene");
        const featured = scene?.querySelector<HTMLElement>(".ll-hero-pin[data-featured]");
        const card = featured?.querySelector<HTMLElement>(".ll-hero-card");
        const face = featured?.querySelector<HTMLElement>(".ll-pin");
        if (!scene || !featured || !card || !face) return;
        let frame = 0;
        const place = () => {
            frame = 0;
            const others = [...scene.querySelectorAll<HTMLElement>(".ll-hero-pin:not([data-featured])")]
                .filter((pin) => getComputedStyle(pin).display !== "none");
            const pinWidth = face.offsetWidth + FOCUS_MARGIN * 2;
            const pinHeight = face.offsetHeight + FOCUS_MARGIN * 2;
            const pinBox = (pin: HTMLElement): Box => {
                const { left: x, top: y } = pin.getBoundingClientRect();
                return { left: x - pinWidth / 2, top: y - pinHeight, right: x + pinWidth / 2, bottom: y + FOCUS_MARGIN };
            };
            const anchor = featured.getBoundingClientRect();
            const result = heroCardPlace({
                anchor: { x: anchor.left, y: anchor.top },
                card: { width: card.offsetWidth, height: card.offsetHeight },
                pin: { width: pinWidth, height: pinHeight },
                pins: others.map(pinBox),
                avoid: [...document.querySelectorAll<HTMLElement>("[data-hero-copy]")].flatMap(copyBoxes),
                bounds: box(scene.getBoundingClientRect()),
                order: window.matchMedia("(max-width: 767px)").matches ? PHONE_ORDER : WIDE_ORDER,
            });
            card.style.left = `${result.dx}px`;
            card.style.top = `${result.dy}px`;
            card.style.bottom = "auto";
            card.dataset.side = result.side;
            others.forEach((pin, index) => {
                if (result.covered.includes(index)) pin.dataset.covered = "";
                else delete pin.dataset.covered;
            });
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
        schedule();
        void document.fonts?.ready.then(schedule);
        window.addEventListener("resize", schedule);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            window.removeEventListener("resize", schedule);
        };
    }, []);
    return null;
}
