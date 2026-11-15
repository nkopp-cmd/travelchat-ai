import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/spots/review-list', () => {
    loaded.count += 1;
    return { ReviewList: ({ spotId }: { spotId: string }) => <p>reviews for {spotId}</p> };
});

import { LazyReviewList } from '@/components/spots/lazy-review-list';

let trigger: ((hit: boolean) => void) | null = null;
const disconnect = vi.fn();

class FakeObserver {
    constructor(callback: IntersectionObserverCallback) {
        trigger = (hit) => callback([{ isIntersecting: hit } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe() {}
    disconnect() { disconnect(); }
}

describe('LazyReviewList', () => {
    beforeEach(() => { loaded.count = 0; trigger = null; disconnect.mockClear(); vi.stubGlobal('IntersectionObserver', FakeObserver); });
    afterEach(() => vi.unstubAllGlobals());

    it('does not load the review code before the section comes near', async () => {
        render(<LazyReviewList spotId="spot-1" />);
        expect(screen.getByTestId('reviews-placeholder')).toBeTruthy();
        await act(async () => { trigger?.(false); await Promise.resolve(); });
        expect(loaded.count).toBe(0);
        expect(screen.queryByText('reviews for spot-1')).toBeNull();
    });

    it('loads and renders the reviews once the section intersects', async () => {
        render(<LazyReviewList spotId="spot-1" />);
        await act(async () => { trigger?.(true); });
        expect(await screen.findByText('reviews for spot-1')).toBeTruthy();
        expect(loaded.count).toBe(1);
        expect(disconnect).toHaveBeenCalled();
        expect(screen.queryByTestId('reviews-placeholder')).toBeNull();
    });
});
