import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewList } from '@/components/spots/review-list';

vi.mock('@/lib/auth/client', () => ({ useAuth: () => ({ userId: null }) }));
vi.mock('@/components/spots/review-form', () => ({ ReviewForm: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function result(comment?: string) {
    return Response.json({
        reviews: comment ? [{
            id: comment, comment, rating: 5, visit_date: null, helpful_count: 0,
            created_at: '2026-09-01', clerk_user_id: 'author', user: null,
        }] : [],
        total: comment ? 1 : 0,
        averageRating: comment ? 5 : 0,
        ratingDistribution: [0, 0, 0, 0, comment ? 1 : 0],
    });
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe('Review loading', () => {
    beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it.each(['HTTP', 'network', 'JSON'])('shows %s failures and retries successfully', async (failure) => {
        const fetchMock = vi.fn();
        if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'));
        else fetchMock.mockResolvedValueOnce(failure === 'HTTP'
            ? new Response(null, { status: 500 })
            : new Response('<html>Sign in</html>'));
        fetchMock.mockResolvedValueOnce(result('Recovered review'));
        vi.stubGlobal('fetch', fetchMock);
        render(<ReviewList spotId="spot-1" />);

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.queryByText('No reviews yet')).toBeNull();
        expect(screen.queryByText('Reviews (0)')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('Recovered review')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('shows the empty state only after a successful empty response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(result()));
        render(<ReviewList spotId="spot-1" />);
        expect(screen.getByRole('status', { name: 'Loading reviews' })).toBeTruthy();
        expect(await screen.findByText('No reviews yet')).toBeTruthy();
    });

    it.each(['success', 'failure'])('ignores stale %s after the spot changes', async (outcome) => {
        const old = deferred<Response>();
        const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(result('Current review'));
        vi.stubGlobal('fetch', fetchMock);
        const { rerender } = render(<ReviewList spotId="old" />);
        rerender(<ReviewList spotId="current" />);
        expect(await screen.findByText('Current review')).toBeTruthy();
        await act(async () => {
            if (outcome === 'success') old.resolve(result('Outdated review'));
            else old.reject(new Error('old failure'));
        });
        expect(screen.getByText('Current review')).toBeTruthy();
        expect(screen.queryByText('Outdated review')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    });

    it('ignores an outdated response whose JSON finishes later', async () => {
        const body = deferred<unknown>();
        const json = vi.fn().mockReturnValue(body.promise);
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce({ ok: true, json })
            .mockResolvedValueOnce(result('Current review')));
        const { rerender } = render(<ReviewList spotId="old" />);
        await act(async () => {});
        expect(json).toHaveBeenCalledOnce();
        rerender(<ReviewList spotId="current" />);
        expect(await screen.findByText('Current review')).toBeTruthy();
        await act(async () => body.resolve(await result('Outdated review').json()));
        expect(screen.getByText('Current review')).toBeTruthy();
        expect(screen.queryByText('Outdated review')).toBeNull();
    });

    it('keeps loading while an outdated request finishes', async () => {
        const old = deferred<Response>();
        const current = deferred<Response>();
        vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise));
        const { rerender, unmount } = render(<ReviewList spotId="old" />);
        rerender(<ReviewList spotId="current" />);
        await act(async () => old.resolve(result('Outdated review')));
        expect(screen.getByRole('status', { name: 'Loading reviews' })).toBeTruthy();
        expect(screen.queryByText('Outdated review')).toBeNull();
        unmount();
        await act(async () => current.resolve(result('Unmounted review')));
    });
});
