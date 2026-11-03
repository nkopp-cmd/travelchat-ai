// Edge-docked pins (shared/plans/localley-map-photos-edge-pins.md item 4): places of the current
// result set that leave the visible map stay as small dots on the screen edge, on the line from the
// map centre towards the place, nearest first. Pure screen geometry; the map has no rotation.

export interface DockPoint { id: string; x: number; y: number }

/** The visible map box in container pixels, after the header, sheet and safe-area insets. */
export interface DockRect { left: number; top: number; right: number; bottom: number }

export interface DockDot {
    id: string;
    /** Dot centre in container pixels, inside the rect. */
    x: number;
    y: number;
    /** Pixels between the place and its dot. */
    distance: number;
    /** 1 near the edge, falling to 0 at the fade-out distance. */
    opacity: number;
}

export interface DockOptions {
    /** Most dots on screen; the nearest places win. */
    max?: number;
    /** Places farther than this from their dot are not docked (px). */
    fadeOut: number;
    /** Dots closer than this to a kept dot are dropped, so dots never stack (px). */
    minGap?: number;
}

export const DOCK_INSET_PX = 8;
export const DOCK_MAX = 12;

/** The map box minus the covered edges and the fixed dock inset. */
export function dockRect(width: number, height: number, insets: Partial<DockRect> = {}, inset = DOCK_INSET_PX): DockRect {
    const left = (insets.left ?? 0) + inset;
    const top = (insets.top ?? 0) + inset;
    const right = Math.max(left, width - (insets.right ?? 0) - inset);
    const bottom = Math.max(top, height - (insets.bottom ?? 0) - inset);
    return { left, top, right, bottom };
}

/** Where the line from the rect centre to the point leaves the rect; null when the point is inside. */
export function dockPoint(point: { x: number; y: number }, rect: DockRect): { x: number; y: number } | null {
    if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) return null;
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const halfW = (rect.right - rect.left) / 2;
    const halfH = (rect.bottom - rect.top) / 2;
    // The smallest step along the line that reaches a side; a zero-size side docks at the centre line.
    const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
    const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
    const t = Math.min(tx, ty, 1);
    return {
        x: clamp(cx + dx * t, rect.left, rect.right),
        y: clamp(cy + dy * t, rect.top, rect.bottom),
    };
}

export function edgeDock(points: DockPoint[], rect: DockRect, options: DockOptions): DockDot[] {
    const max = options.max ?? DOCK_MAX;
    const minGap = options.minGap ?? 0;
    const candidates: DockDot[] = [];
    for (const point of points) {
        const at = dockPoint(point, rect);
        if (!at) continue;
        const distance = Math.hypot(point.x - at.x, point.y - at.y);
        if (distance > options.fadeOut) continue;
        // Full strength for the first half of the fade distance, then a linear fade.
        const opacity = clamp(2 - (2 * distance) / options.fadeOut, 0, 1);
        candidates.push({ id: point.id, x: at.x, y: at.y, distance, opacity });
    }
    candidates.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
    const dots: DockDot[] = [];
    for (const dot of candidates) {
        if (dots.length >= max) break;
        if (minGap > 0 && dots.some((kept) => Math.hypot(kept.x - dot.x, kept.y - dot.y) < minGap)) continue;
        dots.push(dot);
    }
    return dots;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
