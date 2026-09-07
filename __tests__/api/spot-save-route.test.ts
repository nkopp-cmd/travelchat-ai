// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, POST } from '@/app/api/spots/save/route';

const { auth, client, from, admin, getUserTier, checkUsageLimit, trackEngagement, fetchMock } = vi.hoisted(() => ({
    auth: vi.fn(), client: vi.fn(), from: vi.fn(), admin: vi.fn(),
    getUserTier: vi.fn(), checkUsageLimit: vi.fn(), trackEngagement: vi.fn(), fetchMock: vi.fn(),
}));
vi.mock('@clerk/nextjs/server', () => ({ auth }));
vi.mock('@/lib/supabase-server', () => ({ createSupabaseServerClient: client }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: admin }));
vi.mock('@/lib/usage-tracking', () => ({ getUserTier, checkUsageLimit }));
vi.mock('@/lib/engagement-tracking', () => ({ trackEngagement }));

const spotId = '01234567-89ab-4cde-8fab-0123456789ab';
const dbError = { code: '42501', message: 'private database detail' };
const handlers = { GET, POST, DELETE };

function request(method: keyof typeof handlers, body: unknown = { spotId }, search = '') {
    return new NextRequest(`https://localley.io/api/spots/save${search}`, {
        method,
        ...(method !== 'GET' && { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    });
}

function query(result: object) {
    const promise = Promise.resolve(result);
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue(result),
        maybeSingle: vi.fn().mockResolvedValue(result), then: promise.then.bind(promise),
    };
    from.mockReturnValueOnce(chain);
    return chain;
}

describe('Spot save API', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        auth.mockResolvedValue({ userId: 'user-owner' });
        client.mockResolvedValue({ from });
        getUserTier.mockResolvedValue('free');
        checkUsageLimit.mockResolvedValue({ allowed: true });
        admin.mockReturnValue({ from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }) });
        vi.stubGlobal('fetch', fetchMock.mockResolvedValue(new Response(null, { status: 200 })));
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it.each(['GET', 'POST', 'DELETE'] as const)('%s rejects missing auth before any database or quota call', async (method) => {
        auth.mockResolvedValue({ userId: null });
        const response = await handlers[method](request(method));
        expect(response.status).toBe(401);
        expect((await response.json()).error.code).toBe('unauthorized');
        expect(client).not.toHaveBeenCalled();
        expect(getUserTier).not.toHaveBeenCalled();
        expect(admin).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    for (const method of ['POST', 'DELETE'] as const) {
        it.each([null, [], {}, { spotId: 123 }, { spotId: true }, { spotId: {} }, { spotId: [] },
            { spotId: '' }, { spotId: '  ' }, { spotId: 'not-a-uuid' }].map(body => ({ body })))(`${method} rejects invalid body $body`, async ({ body }) => {
            const response = await handlers[method](request(method, body));
            expect(response.status).toBe(400);
            expect((await response.json()).error.code).toBe('validation_error');
            expect(client).not.toHaveBeenCalled();
            expect(getUserTier).not.toHaveBeenCalled();
        });

        it(`${method} rejects malformed JSON`, async () => {
            const response = await handlers[method](new NextRequest('https://localley.io/api/spots/save', {
                method, body: '{',
            }));
            expect(response.status).toBe(400);
            expect(client).not.toHaveBeenCalled();
        });
    }

    it.each(['', ' ', 'not-a-uuid'])('GET rejects an invalid explicit spotId %j', async (id) => {
        const response = await GET(request('GET', undefined, `?spotId=${encodeURIComponent(id)}`));
        expect(response.status).toBe(400);
        expect(client).not.toHaveBeenCalled();
    });

    it.each([null, { id: 'saved-row' }])('GET preserves saved status for %j and scopes ownership', async (data) => {
        const lookup = query({ data, error: null });
        const response = await GET(request('GET', undefined, `?spotId=${spotId}&clerk_user_id=other-user`));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ saved: !!data });
        expect(lookup.eq.mock.calls).toEqual([['clerk_user_id', 'user-owner'], ['spot_id', spotId]]);
    });

    it.each([[], [{ id: 'saved-row', spot_id: spotId, spots: { id: spotId } }]].map(data => ({ data })))('GET preserves the list response for $data', async ({ data }) => {
        const list = query({ data, error: null });
        const response = await GET(request('GET', undefined, '?clerk_user_id=other-user'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, spots: data });
        expect(list.eq.mock.calls).toEqual([['clerk_user_id', 'user-owner']]);
        expect(list.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('POST assigns the authenticated owner and preserves its response', async () => {
        const lookup = query({ data: null, error: null });
        const insert = query({ error: null });
        const response = await POST(request('POST', { spotId, clerk_user_id: 'other-user', name: 'A cafe', city: 'Seoul' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, saved: true, message: 'Spot saved successfully' });
        expect(lookup.eq.mock.calls).toEqual([['clerk_user_id', 'user-owner'], ['spot_id', spotId]]);
        expect(insert.insert).toHaveBeenCalledWith({ clerk_user_id: 'user-owner', spot_id: spotId });
        expect(checkUsageLimit).toHaveBeenCalledWith('user-owner', 'spots_saved', 'free');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('POST keeps duplicate saves successful even at the quota limit', async () => {
        query({ data: { id: 'saved-row' }, error: null });
        checkUsageLimit.mockResolvedValue({ allowed: false, currentUsage: 10, limit: 10 });
        const response = await POST(request('POST'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, saved: true, message: 'Spot already saved' });
        expect(from).toHaveBeenCalledTimes(1);
        expect(checkUsageLimit).not.toHaveBeenCalled();
        expect(admin).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('POST still rejects new saves at the quota limit', async () => {
        query({ data: null, error: null });
        checkUsageLimit.mockResolvedValue({ allowed: false, currentUsage: 10, limit: 10 });
        const response = await POST(request('POST'));
        expect(response.status).toBe(429);
        expect((await response.json()).error.code).toBe('limit_exceeded');
        expect(from).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('DELETE scopes both filters and retains idempotent success with no matching row', async () => {
        const deletion = query({ data: null, error: null });
        const response = await DELETE(request('DELETE', { spotId, clerk_user_id: 'other-user' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, saved: false, message: 'Spot removed from saved' });
        expect(deletion.delete).toHaveBeenCalledOnce();
        expect(deletion.eq.mock.calls).toEqual([['clerk_user_id', 'user-owner'], ['spot_id', spotId]]);
    });

    it.each(['status', 'list', 'lookup', 'insert', 'delete'])('reports %s database failure without success or side effects', async (stage) => {
        if (stage === 'insert') query({ data: null, error: null });
        query({ data: null, error: dbError });
        const response = stage === 'status' || stage === 'list'
            ? await GET(request('GET', undefined, stage === 'status' ? `?spotId=${spotId}` : ''))
            : stage === 'delete' ? await DELETE(request('DELETE')) : await POST(request('POST'));
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe('database_error');
        expect(body.saved).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain(dbError.message);
        expect(from).toHaveBeenCalledTimes(stage === 'insert' ? 2 : 1);
        expect(admin).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['GET', 'POST', 'DELETE'] as const)('%s handles client creation failure', async (method) => {
        client.mockRejectedValue(new Error('private connection detail'));
        const response = await handlers[method](request(method));
        expect(response.status).toBe(500);
        expect((await response.json()).error.code).toBe('internal_error');
        expect(from).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
