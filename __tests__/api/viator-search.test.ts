import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

describe('Viator search API failure states', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('VIATOR_API_KEY', '');
        vi.stubEnv('VIATOR_API_URL', '');
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it.each(['missing', 'sandbox', 'unverified', 'provider-error'])('keeps GET and POST shapes without offers for %s', async mode => {
        if (mode !== 'missing') vi.stubEnv('VIATOR_API_KEY', 'key');
        vi.stubEnv('VIATOR_API_URL', mode === 'sandbox'
            ? 'https://api.sandbox.viator.com/partner'
            : mode === 'unverified' ? 'https://unverified.example/partner' : 'https://api.viator.com/partner');
        fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
        const { GET, POST } = await import('@/app/api/viator/search/route');
        const responses = [
            await GET(new NextRequest('https://localley.io/api/viator/search?destination=973')),
            await POST(new NextRequest('https://localley.io/api/viator/search', {
                method: 'POST',
                body: JSON.stringify({ destination: '973' }),
            })),
        ];
        for (const response of responses) {
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                success: true,
                data: { activities: [], total: 0, hasMore: false },
            });
        }
        expect(fetchMock).toHaveBeenCalledTimes(mode === 'provider-error' ? 2 : 0);
    });
});
