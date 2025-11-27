import { ViatorActivity, ViatorSearchParams, ViatorSearchResult, ViatorAvailability, ViatorPricing } from '@/types/viator';

interface ViatorConfig {
    apiKey?: string;
    partnerId?: string;
    baseUrl?: string;
    useMockData?: boolean;
}

class ViatorClient {
    private config: ViatorConfig;
    private useMock: boolean;

    constructor(config: ViatorConfig = {}) {
        const apiKey = config.apiKey || process.env.VIATOR_API_KEY;

        // Use sandbox endpoint for testing
        const baseUrl = config.baseUrl || process.env.VIATOR_API_URL || 'https://api.sandbox.viator.com/partner';

        this.config = {
            apiKey,
            partnerId: config.partnerId || process.env.VIATOR_PARTNER_ID,
            baseUrl,
            useMockData: config.useMockData ?? !apiKey,
        };

        this.useMock = this.config.useMockData || !this.config.apiKey;

        if (this.useMock) {
            console.log('🎭 Viator Client: Using mock data (API key not configured)');
        } else {
            console.log('✅ Viator Client: Connected to sandbox API');
        }
    }

    /**
     * Search for activities by destination and filters
     */
    async searchActivities(params: ViatorSearchParams): Promise<ViatorSearchResult> {
        if (this.useMock) {
            return this.getMockSearchResults(params);
        }

        try {
            const queryParams = new URLSearchParams({
                destination: params.destination,
                ...(params.category && { category: params.category }),
                ...(params.startDate && { startDate: params.startDate }),
                ...(params.currency && { currency: params.currency }),
                limit: String(params.limit || 20),
                offset: String(params.offset || 0),
            });

            const response = await fetch(`${this.config.baseUrl}/search?${queryParams}`, {
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Viator API error: ${response.statusText}`);
            }

            const data = await response.json();
            return this.transformSearchResponse(data);
        } catch (error) {
            console.error('Error searching Viator activities:', error);
            // Fallback to mock data on error
            return this.getMockSearchResults(params);
        }
    }

    /**
     * Get activity details by product code
     */
    async getActivity(productCode: string): Promise<ViatorActivity | null> {
        if (this.useMock) {
            return this.getMockActivity(productCode);
        }

        try {
            const response = await fetch(`${this.config.baseUrl}/products/${productCode}`, {
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Viator API error: ${response.statusText}`);
            }

            const data = await response.json();
            return this.transformActivityResponse(data);
        } catch (error) {
            console.error('Error fetching Viator activity:', error);
            return this.getMockActivity(productCode);
        }
    }

    /**
     * Check availability for a specific date
     */
    async checkAvailability(productCode: string, date: string): Promise<ViatorAvailability> {
        if (this.useMock) {
            return this.getMockAvailability(productCode, date);
        }

        try {
            const response = await fetch(`${this.config.baseUrl}/availability`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ productCode, date }),
            });

            if (!response.ok) {
                throw new Error(`Viator API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error checking Viator availability:', error);
            return this.getMockAvailability(productCode, date);
        }
    }

    /**
     * Get pricing for specific date and travelers
     */
    async getPricing(productCode: string, date: string, travelers: number): Promise<ViatorPricing> {
        if (this.useMock) {
            return this.getMockPricing(productCode, date, travelers);
        }

        try {
            const response = await fetch(`${this.config.baseUrl}/pricing`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ productCode, date, travelers }),
            });

            if (!response.ok) {
                throw new Error(`Viator API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching Viator pricing:', error);
            return this.getMockPricing(productCode, date, travelers);
        }
    }

    // ============================================
    // MOCK DATA METHODS (for development)
    // ============================================

    private getMockSearchResults(params: ViatorSearchParams): ViatorSearchResult {
        const mockActivities = this.generateMockActivities(params.destination, params.city);

        // Filter by category if specified
        let filtered = mockActivities;
        if (params.category) {
            filtered = mockActivities.filter(a => a.category === params.category);
        }

        // Apply pagination
        const limit = params.limit || 20;
        const offset = params.offset || 0;
        const paginated = filtered.slice(offset, offset + limit);

        return {
            activities: paginated,
            total: filtered.length,
            hasMore: offset + limit < filtered.length,
        };
    }

    private getMockActivity(productCode: string): ViatorActivity | null {
        const activities = this.generateMockActivities('Seoul');
        return activities.find(a => a.productCode === productCode) || activities[0];
    }

    private getMockAvailability(productCode: string, date: string): ViatorAvailability {
        return {
            productCode,
            date,
            available: true,
            spotsRemaining: Math.floor(Math.random() * 20) + 5,
            price: 50 + Math.random() * 150,
            currency: 'USD',
        };
    }

    private getMockPricing(productCode: string, date: string, travelers: number): ViatorPricing {
        const pricePerPerson = 50 + Math.random() * 150;
        const basePrice = pricePerPerson * travelers;
        const taxes = basePrice * 0.1;
        const fees = 5;

        return {
            productCode,
            date,
            travelers,
            totalPrice: basePrice + taxes + fees,
            pricePerPerson,
            currency: 'USD',
            breakdown: {
                basePrice,
                taxes,
                fees,
            },
        };
    }

    private generateMockActivities(destination: string, city?: string): ViatorActivity[] {
        const cityName = city || destination;

        const mockData: ViatorActivity[] = [
            {
                id: '1',
                productCode: 'SEOUL-FOOD-001',
                title: `${cityName} Street Food Tour`,
                description: `Discover the authentic flavors of ${cityName} on this guided street food tour. Visit local markets, try traditional dishes, and learn about the culinary culture.`,
                shortDescription: `Authentic ${cityName} street food experience`,
                destination,
                city: cityName,
                category: 'Food & Drink',
                subcategories: ['Food Tours', 'Street Food', 'Cultural'],
                duration: '3 hours',
                durationMinutes: 180,
                priceFrom: 65,
                priceTo: 85,
                currency: 'USD',
                rating: 4.8,
                reviewCount: 1247,
                images: [
                    'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=800',
                    'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=800',
                ],
                thumbnailUrl: 'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=400',
                bookingUrl: 'https://www.viator.com/tours/SEOUL-FOOD-001',
                viatorUrl: 'https://www.viator.com/tours/SEOUL-FOOD-001',
                cancellationPolicy: 'Free cancellation up to 24 hours before',
                included: ['Local guide', 'Food tastings', 'Bottled water'],
                excluded: ['Hotel pickup', 'Gratuities'],
                meetingPoint: 'Myeongdong Station Exit 6',
                languages: ['English', 'Korean'],
                maxTravelers: 12,
                instantConfirmation: true,
                mobileTicket: true,
            },
            {
                id: '2',
                productCode: 'SEOUL-CULTURE-001',
                title: `${cityName} Hidden Temples & Palaces`,
                description: `Explore the hidden temples and lesser-known palaces of ${cityName}. Avoid the crowds and discover authentic cultural sites with a local expert.`,
                shortDescription: `Discover hidden cultural gems`,
                destination,
                city: cityName,
                category: 'Cultural Tours',
                subcategories: ['Historical', 'Temples', 'Walking Tours'],
                duration: '4 hours',
                durationMinutes: 240,
                priceFrom: 75,
                priceTo: 95,
                currency: 'USD',
                rating: 4.9,
                reviewCount: 892,
                images: [
                    'https://images.unsplash.com/photo-1583470790878-4e0a76e0e5c5?w=800',
                ],
                thumbnailUrl: 'https://images.unsplash.com/photo-1583470790878-4e0a76e0e5c5?w=400',
                bookingUrl: 'https://www.viator.com/tours/SEOUL-CULTURE-001',
                viatorUrl: 'https://www.viator.com/tours/SEOUL-CULTURE-001',
                cancellationPolicy: 'Free cancellation up to 24 hours before',
                included: ['Expert guide', 'Temple entrance fees', 'Tea ceremony'],
                excluded: ['Lunch', 'Transportation'],
                meetingPoint: 'Gyeongbokgung Palace Main Gate',
                languages: ['English', 'Korean', 'Japanese'],
                maxTravelers: 10,
                instantConfirmation: true,
                mobileTicket: true,
            },
            {
                id: '3',
                productCode: 'SEOUL-NIGHT-001',
                title: `${cityName} Night Market Adventure`,
                description: `Experience the vibrant nightlife and night markets of ${cityName}. Shop, eat, and explore the city after dark with a local guide.`,
                shortDescription: `Night market and street food adventure`,
                destination,
                city: cityName,
                category: 'Nightlife',
                subcategories: ['Night Tours', 'Shopping', 'Food'],
                duration: '3.5 hours',
                durationMinutes: 210,
                priceFrom: 55,
                priceTo: 70,
                currency: 'USD',
                rating: 4.7,
                reviewCount: 654,
                images: [
                    'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800',
                ],
                thumbnailUrl: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=400',
                bookingUrl: 'https://www.viator.com/tours/SEOUL-NIGHT-001',
                viatorUrl: 'https://www.viator.com/tours/SEOUL-NIGHT-001',
                cancellationPolicy: 'Free cancellation up to 24 hours before',
                included: ['Guide', 'Market snacks', 'Transportation'],
                excluded: ['Dinner', 'Shopping purchases'],
                meetingPoint: 'Dongdaemun Design Plaza',
                languages: ['English', 'Korean'],
                maxTravelers: 15,
                instantConfirmation: true,
                mobileTicket: true,
            },
        ];

        return mockData;
    }

    private transformSearchResponse(data: Record<string, unknown>): ViatorSearchResult {
        // Transform actual Viator API response to our format
        // Based on Viator Partner API v1 response structure
        const products = (data.products || data.data || []) as Record<string, unknown>[];
        const pagination = data.pagination as Record<string, unknown> | undefined;

        const activities: ViatorActivity[] = products.map((product) =>
            this.transformProductToActivity(product)
        );

        return {
            activities,
            total: (pagination?.totalCount as number) || activities.length,
            hasMore: (pagination?.totalPages as number) > (pagination?.currentPage as number) || false,
        };
    }

    private transformActivityResponse(data: Record<string, unknown>): ViatorActivity {
        // Transform actual Viator API product response to our format
        const product = (data.product || data.data || data) as Record<string, unknown>;
        return this.transformProductToActivity(product);
    }

    private transformProductToActivity(product: Record<string, unknown>): ViatorActivity {
        // Map Viator API fields to our ViatorActivity interface
        const pricing = product.pricing as Record<string, unknown> | undefined;
        const pricingSummary = pricing?.summary as Record<string, unknown> | undefined;
        const reviews = product.reviews as Record<string, unknown> | undefined;
        const images = (product.images || []) as Array<{ url?: string; variants?: Array<{ url: string }> }>;
        const itinerary = product.itinerary as Record<string, unknown> | undefined;
        const logistics = product.logistics as Record<string, unknown> | undefined;
        const logisticsStart = logistics?.start as Array<Record<string, unknown>> | undefined;
        const bookingInfo = product.bookingInfo as Record<string, unknown> | undefined;
        const cancellationPolicy = bookingInfo?.cancellationPolicy as Record<string, unknown> | undefined;
        const destination = product.destination as Record<string, unknown> | undefined;
        const primaryDestination = product.primaryDestination as Record<string, unknown> | undefined;
        const productCategories = (product.productCategories || []) as Array<{ name?: string }>;
        const languageGuides = (product.languageGuides || []) as Array<{ language?: string }>;

        return {
            id: (product.productCode || product.id || '') as string,
            productCode: (product.productCode || '') as string,
            title: (product.title || product.name || '') as string,
            description: (product.description || '') as string,
            shortDescription: (product.shortDescription || product.synopsis || '') as string,
            destination: (destination?.name || product.destinationName || '') as string,
            city: (primaryDestination?.name || '') as string,
            category: (productCategories[0]?.name || product.category || 'Tours') as string,
            subcategories: productCategories.map(c => c.name || '').filter(Boolean),
            duration: this.formatDuration(product.duration as Record<string, unknown> | undefined),
            durationMinutes: this.getDurationMinutes(product.duration as Record<string, unknown> | undefined),
            priceFrom: (pricingSummary?.fromPrice || pricing?.fromPrice || 0) as number,
            priceTo: (pricingSummary?.toPrice || pricing?.toPrice) as number | undefined,
            currency: (pricing?.currency || 'USD') as string,
            rating: (reviews?.combinedAverageRating || product.rating) as number | undefined,
            reviewCount: (reviews?.totalReviews || product.reviewCount || 0) as number,
            images: images.map(img => img.variants?.[0]?.url || img.url || '').filter(Boolean),
            thumbnailUrl: images[0]?.variants?.[0]?.url || images[0]?.url,
            bookingUrl: `https://www.viator.com/tours/${product.productCode}`,
            viatorUrl: (product.productUrl || `https://www.viator.com/tours/${product.productCode}`) as string,
            cancellationPolicy: (cancellationPolicy?.description || itinerary?.cancellationPolicy) as string | undefined,
            included: ((itinerary?.inclusions || []) as string[]),
            excluded: ((itinerary?.exclusions || []) as string[]),
            meetingPoint: (logisticsStart?.[0]?.description || logistics?.meetingPoint) as string | undefined,
            languages: languageGuides.map(l => l.language || '').filter(Boolean),
            maxTravelers: (bookingInfo?.maxTravelersPerBooking) as number | undefined,
            instantConfirmation: (bookingInfo?.confirmationType === 'INSTANT') || false,
            mobileTicket: (bookingInfo?.voucherOption === 'MOBILE') || true,
        };
    }

    private formatDuration(duration: Record<string, unknown> | undefined): string {
        if (!duration) return 'Varies';

        const fixedDuration = duration.fixedDurationInMinutes as number | undefined;
        const variableDuration = duration.variableDurationFromMinutes as number | undefined;

        const minutes = fixedDuration || variableDuration || 0;
        if (minutes < 60) return `${minutes} minutes`;

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (remainingMinutes === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
        return `${hours}h ${remainingMinutes}m`;
    }

    private getDurationMinutes(duration: Record<string, unknown> | undefined): number | undefined {
        if (!duration) return undefined;
        return (duration.fixedDurationInMinutes || duration.variableDurationFromMinutes) as number | undefined;
    }
}

// Export singleton instance
export const viatorClient = new ViatorClient();

// Export class for custom instances
export default ViatorClient;
