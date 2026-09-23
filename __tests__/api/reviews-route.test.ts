import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/spots/[id]/reviews/route';

const { auth, from } = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ auth }));
vi.mock('@/lib/supabase-server', () => ({
    createSupabaseServerClient: async () => ({ from }),
}));

const review = {
    id: 'review-1', clerk_user_id: 'author-1', rating: 4, comment: 'Market visit',
    visit_date: null, helpful_count: 2, created_at: '2026-09-01',
};

function query(result: object) {
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        then: Promise.resolve(result).then.bind(Promise.resolve(result)),
    };
    from.mockReturnValueOnce(chain);
    return chain;
}

function get() {
    return GET(new Request('https://localley.io/api/spots/spot-1/reviews?sort=helpful'), {
        params: Promise.resolve({ id: 'spot-1' }),
    });
}

describe('Review GET schema alignment', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        auth.mockResolvedValue({ userId: null });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('reads reviews without a nonexistent FK and maps usernames to public authors', async () => {
        const reviews = query({ data: [review], error: null });
        const users = query({ data: [{ clerk_id: 'author-1', username: 'Visitor' }], error: null });
        query({ count: 1, error: null });
        query({ data: [{ rating: 4 }], error: null });
        const response = await get();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            reviews: [{ ...review, user: { name: 'Visitor', avatar_url: null }, user_voted: false }],
            total: 1, averageRating: 4, ratingDistribution: [0, 0, 0, 1, 0],
        });
        expect(reviews.select.mock.calls[0][0].replace(/\s/g, '')).toBe(
            'id,rating,comment,visit_date,helpful_count,created_at,clerk_user_id',
        );
        expect(reviews.eq).toHaveBeenCalledWith('spot_id', 'spot-1');
        expect(reviews.order).toHaveBeenCalledWith('helpful_count', { ascending: false });
        expect(users.select).toHaveBeenCalledWith('clerk_id, username');
        expect(users.in).toHaveBeenCalledWith('clerk_id', ['author-1']);
        expect(from.mock.calls.map(([table]) => table)).toEqual(['spot_reviews', 'users', 'spot_reviews', 'spot_reviews']);
    });

    it('preserves reviews when the author is absent or hidden by RLS', async () => {
        query({ data: [review], error: null });
        query({ data: [], error: null });
        query({ count: 1, error: null });
        query({ data: [{ rating: 4 }], error: null });
        const response = await get();
        expect(response.status).toBe(200);
        expect((await response.json()).reviews[0]).toEqual({ ...review, user: null, user_voted: false });
    });

    it('returns a real empty result without querying authors or votes', async () => {
        query({ data: [], error: null });
        query({ count: 0, error: null });
        query({ data: [], error: null });
        const response = await get();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ reviews: [], total: 0, averageRating: 0, ratingDistribution: [0, 0, 0, 0, 0] });
        expect(from.mock.calls.every(([table]) => table === 'spot_reviews')).toBe(true);
    });

    it('retains authenticated vote state', async () => {
        auth.mockResolvedValue({ userId: 'viewer' });
        query({ data: [review], error: null });
        query({ data: [], error: null });
        const votes = query({ data: [{ review_id: review.id }], error: null });
        query({ count: 1, error: null });
        query({ data: [{ rating: 4 }], error: null });
        const response = await get();
        expect((await response.json()).reviews[0].user_voted).toBe(true);
        expect(votes.eq).toHaveBeenCalledWith('clerk_user_id', 'viewer');
    });

    it.each(['reviews', 'authors', 'votes', 'count', 'ratings'])('does not mask a %s database failure', async (stage) => {
        auth.mockResolvedValue({ userId: 'viewer' });
        const stages = ['reviews', 'authors', 'votes', 'count', 'ratings'];
        for (const current of stages) {
            query(current === stage
                ? { data: null, error: { code: 'PGRST200', message: 'Schema failure' } }
                : { data: current === 'reviews' ? [review] : [], count: 1, error: null });
            if (current === stage) break;
        }
        const response = await get();
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe('database_error');
        expect(body.reviews).toBeUndefined();
    });

    it('rejects anonymous writes before database access', async () => {
        const response = await POST(new Request('https://localley.io/api/spots/spot-1/reviews', { method: 'POST' }), {
            params: Promise.resolve({ id: 'spot-1' }),
        });
        expect(response.status).toBe(401);
        expect(from).not.toHaveBeenCalled();
    });
});
