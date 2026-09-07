import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ViatorClient from '@/lib/viator';

const liveUrl = 'https://api.viator.com/partner';
const params = { destination: '973', currency: 'KRW' };
const product = {
    productCode: '123P1',
    title: 'Provider tour',
    productUrl: 'https://www.viator.com/tours/Seoul/Provider-tour/d973-123P1',
    pricing: { currency: 'KRW', summary: { fromPrice: 42000 } },
};
const empty = { activities: [], total: 0, hasMore: false };

describe('Viator offer trust', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.stubEnv('VIATOR_API_KEY', '');
        vi.stubEnv('VIATOR_API_URL', '');
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it.each([
        {},
        { apiKey: 'key' },
        { baseUrl: liveUrl },
        { apiKey: ' ', baseUrl: liveUrl },
        { apiKey: 'key', baseUrl: 'https://api.sandbox.viator.com/partner' },
        { apiKey: 'key', baseUrl: 'https://unverified.example/partner' },
        { apiKey: 'key', baseUrl: 'https://api.viator.com.evil.example/partner' },
        { apiKey: 'key', baseUrl: 'http://api.viator.com/partner' },
        { apiKey: 'key', baseUrl: liveUrl, useMockData: true },
    ])('returns no offers or quotes for unsafe configuration %j', async config => {
        const client = new ViatorClient(config);
        expect(await client.searchActivities(params)).toEqual(empty);
        expect(await client.getActivity('SEL-FOOD-001')).toBeNull();
        await expect(client.checkAvailability('123P1', '2026-10-01')).rejects.toThrow('availability is unavailable');
        await expect(client.getPricing('123P1', '2026-10-01', 2)).rejects.toThrow('pricing is unavailable');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['http', 'network', 'json', 'invalid'])('does not replace %s errors with invented products', async failure => {
        fetchMock.mockImplementation(async () => {
            if (failure === 'network') throw new Error('offline');
            if (failure === 'http') return new Response('{}', { status: 503 });
            if (failure === 'json') return new Response('not json');
            return Response.json({ products: null });
        });
        const client = new ViatorClient({ apiKey: 'key', baseUrl: liveUrl });
        expect(await client.searchActivities(params)).toEqual(empty);
        expect(await client.getActivity('123P1')).toBeNull();
    });

    it('preserves provider prices, currency and URLs without generated booking links', async () => {
        fetchMock.mockResolvedValue(Response.json({ products: [product] }));
        const client = new ViatorClient({ apiKey: 'key', baseUrl: `${liveUrl}/` });
        const result = await client.searchActivities(params);
        expect(result.activities).toHaveLength(1);
        expect(result.activities[0]).toMatchObject({
            productCode: product.productCode,
            priceFrom: 42000,
            currency: 'KRW',
            bookingUrl: product.productUrl,
            viatorUrl: product.productUrl,
            instantConfirmation: false,
            mobileTicket: false,
        });
        expect(fetchMock).toHaveBeenCalledWith(`${liveUrl}/products/search`, expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ 'exp-api-key': 'key', Accept: 'application/json;version=2.0' }),
            cache: 'no-store',
            redirect: 'error',
            body: JSON.stringify({ filtering: { destination: '973' }, currency: 'KRW', pagination: { start: 1, count: 20 } }),
        }));
    });

    it.each([
        { pricing: {} },
        { pricing: { currency: 'USD' } },
        { pricing: { summary: { fromPrice: 50 } } },
        { pricing: { currency: 'USD', fromPrice: -1 } },
        { pricing: { currency: 'USD', fromPrice: '50' } },
        { productCode: '' },
        { productUrl: undefined },
        { productUrl: 'https://api.sandbox.viator.com/product' },
        { productUrl: 'https://www.viator.com.evil.example/product' },
    ])('rejects incomplete or unsafe offers %j', async override => {
        const invalid = { ...product, ...override };
        fetchMock.mockResolvedValue(Response.json({ products: [invalid], totalCount: 100 }));
        const client = new ViatorClient({ apiKey: 'key', baseUrl: liveUrl });
        expect(await client.searchActivities(params)).toEqual(empty);
        fetchMock.mockResolvedValue(Response.json(invalid));
        expect(await client.getActivity('123P1')).toBeNull();
    });

    it('keeps an explicit provider zero price but never supplies one', async () => {
        fetchMock.mockResolvedValue(Response.json({ products: [{ ...product, pricing: { currency: 'USD', fromPrice: 0 } }] }));
        const client = new ViatorClient({ apiKey: 'key', baseUrl: liveUrl });
        expect((await client.searchActivities(params)).activities[0].priceFrom).toBe(0);
    });

    it('does not substitute a different activity for an unknown product', async () => {
        fetchMock.mockImplementation(async () => Response.json(product));
        const client = new ViatorClient({ apiKey: 'key', baseUrl: liveUrl });
        expect(await client.getActivity('unknown')).toBeNull();
        expect(await client.getActivity('123P1')).toMatchObject({ priceFrom: 42000 });
    });

    it('does not send city names as provider destination IDs', async () => {
        const client = new ViatorClient({ apiKey: 'key', baseUrl: liveUrl });
        expect(await client.searchActivities({ destination: 'Seoul' })).toEqual(empty);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects unverified quote and inventory contracts even with production credentials', async () => {
        const client = new ViatorClient({ apiKey: 'key', baseUrl: liveUrl });
        await expect(client.checkAvailability('123P1', '2026-10-01')).rejects.toThrow();
        await expect(client.getPricing('123P1', '2026-10-01', 2)).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
