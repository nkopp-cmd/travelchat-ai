import { z } from 'zod';
import { ViatorActivity, ViatorSearchParams, ViatorSearchResult, ViatorAvailability, ViatorPricing } from '@/types/viator';

interface ViatorConfig {
    apiKey?: string;
    partnerId?: string;
    baseUrl?: string;
    // Retained for callers; mock requests now fail closed.
    useMockData?: boolean;
}

const money = z.number().finite().nonnegative();
const currency = z.string().regex(/^[A-Z]{3}$/);
const productSchema = z.object({
    productCode: z.string().min(1),
    title: z.string().min(1),
    productUrl: z.url().refine(value => {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'www.viator.com'
            && !url.username && !url.password && !url.port;
    }),
    description: z.string().optional(),
    shortDescription: z.string().optional(),
    pricing: z.object({
        currency,
        fromPrice: money.optional(),
        summary: z.object({ fromPrice: money.optional() }).optional(),
    }).refine(value => value.summary?.fromPrice !== undefined || value.fromPrice !== undefined),
    images: z.array(z.object({
        url: z.string().optional(),
        variants: z.array(z.object({ url: z.string() })).optional(),
    })).optional(),
    reviews: z.object({
        combinedAverageRating: z.number().min(0).max(5).optional(),
        totalReviews: z.number().int().nonnegative().optional(),
    }).optional(),
});

class ViatorClient {
    private apiKey?: string;
    private baseUrl?: string;

    constructor(config: ViatorConfig = {}) {
        this.apiKey = config.apiKey ?? process.env.VIATOR_API_KEY;
        const baseUrl = config.baseUrl ?? process.env.VIATOR_API_URL;
        // Never infer production access from a key or expose sandbox inventory.
        if (!config.useMockData && baseUrl &&
            /^https:\/\/api\.viator\.com\/partner\/?$/.test(baseUrl)) {
            this.baseUrl = baseUrl.replace(/\/$/, '');
        }
    }

    private async request(path: string, body?: unknown): Promise<unknown> {
        if (!this.apiKey?.trim() || !this.baseUrl) {
            throw new Error('Viator production service is not configured');
        }
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
                'exp-api-key': this.apiKey,
                'Accept': 'application/json;version=2.0',
                'Accept-Language': 'en-US',
                'Content-Type': 'application/json',
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`Viator API error: ${response.status}`);
        return response.json();
    }

    async searchActivities(params: ViatorSearchParams): Promise<ViatorSearchResult> {
        const empty = { activities: [], total: 0, hasMore: false };
        try {
            // Product search requires a Viator destination ID, not a city name.
            if (!/^\d+$/.test(params.destination)) return empty;
            const data = await this.request('/products/search', {
                filtering: { destination: params.destination },
                currency: params.currency ?? 'USD',
                pagination: { start: (params.offset ?? 0) + 1, count: params.limit ?? 20 },
            });
            const result = z.object({ products: z.array(z.unknown()) }).parse(data);
            const activities = result.products.flatMap(product => {
                const parsed = productSchema.safeParse(product);
                return parsed.success ? [this.transformProduct(parsed.data)] : [];
            });
            // Do not advertise counts for rejected or unverified offers.
            return { activities, total: activities.length, hasMore: false };
        } catch {
            return empty;
        }
    }

    async getActivity(productCode: string): Promise<ViatorActivity | null> {
        try {
            const product = productSchema.parse(await this.request(`/products/${encodeURIComponent(productCode)}`));
            if (product.productCode !== productCode) return null;
            return this.transformProduct(product);
        } catch {
            return null;
        }
    }

    async checkAvailability(productCode: string, date: string): Promise<ViatorAvailability> {
        // The legacy /availability contract was never verified against Viator.
        // A date alone cannot establish availability for a bookable option.
        throw new Error(`Viator availability is unavailable for ${productCode} on ${date}; confirm availability on Viator`);
    }

    async getPricing(productCode: string, date: string, travelers: number): Promise<ViatorPricing> {
        // Do not turn a catalog starting price into a traveler-specific quote.
        throw new Error(`Viator pricing is unavailable for ${productCode} on ${date} for ${travelers} travelers; confirm the final price on Viator`);
    }

    private transformProduct(product: z.infer<typeof productSchema>): ViatorActivity {
        const images = (product.images ?? []).map(image => image.variants?.[0]?.url ?? image.url ?? '').filter(Boolean);
        return {
            id: product.productCode,
            productCode: product.productCode,
            title: product.title,
            description: product.description ?? '',
            shortDescription: product.shortDescription,
            destination: '',
            category: 'Tours',
            duration: 'Varies',
            priceFrom: (product.pricing.summary?.fromPrice ?? product.pricing.fromPrice)!,
            currency: product.pricing.currency,
            rating: product.reviews?.combinedAverageRating,
            reviewCount: product.reviews?.totalReviews ?? 0,
            images,
            thumbnailUrl: images[0],
            bookingUrl: product.productUrl,
            viatorUrl: product.productUrl,
            instantConfirmation: false,
            mobileTicket: false,
        };
    }
}

export const viatorClient = new ViatorClient();
export default ViatorClient;
