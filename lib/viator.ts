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
            console.warn('Error searching Viator activities:', error);
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
            console.warn('Error fetching Viator activity:', error);
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
            console.warn('Error checking Viator availability:', error);
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
            console.warn('Error fetching Viator pricing:', error);
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
        const cityKey = cityName.toLowerCase();

        // City-specific mock data: images, meeting points, languages, and activity themes
        const cityData: Record<string, {
            code: string;
            food: { images: string[]; meetingPoint: string; title: string; description: string };
            culture: { images: string[]; meetingPoint: string; title: string; description: string };
            night: { images: string[]; meetingPoint: string; title: string; description: string };
            languages: string[];
        }> = {
            seoul: {
                code: 'SEL',
                food: {
                    images: [
                        'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=800',
                        'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=800',
                    ],
                    meetingPoint: 'Myeongdong Station Exit 6',
                    title: `${cityName} Street Food Tour`,
                    description: `Discover the authentic flavors of ${cityName} with tteokbokki, hotteok, and Korean BBQ at bustling local markets.`,
                },
                culture: {
                    images: [
                        'https://images.unsplash.com/photo-1538485399081-7191377e8241?w=800',
                        'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800',
                    ],
                    meetingPoint: 'Gyeongbokgung Palace Main Gate',
                    title: `${cityName} Palaces & Hanok Village Tour`,
                    description: `Explore royal palaces, traditional hanok villages, and hidden temples with a local history expert.`,
                },
                night: {
                    images: [
                        'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=800',
                        'https://images.unsplash.com/photo-1546874177-9e664107314e?w=800',
                    ],
                    meetingPoint: 'Hongdae Station Exit 9',
                    title: `${cityName} Night Market & Nightlife Tour`,
                    description: `Experience the vibrant nightlife of Hongdae and Myeongdong — street food, live music, and neon-lit alleys.`,
                },
                languages: ['English', 'Korean'],
            },
            tokyo: {
                code: 'TYO',
                food: {
                    images: [
                        'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=800',
                        'https://images.unsplash.com/photo-1553621042-f6e147245754?w=800',
                    ],
                    meetingPoint: 'Tsukiji Outer Market Entrance',
                    title: `${cityName} Ramen & Izakaya Food Tour`,
                    description: `Taste authentic ramen, fresh sushi, and izakaya favorites in Tokyo's best food neighborhoods.`,
                },
                culture: {
                    images: [
                        'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=800',
                        'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800',
                    ],
                    meetingPoint: 'Senso-ji Temple Main Gate (Kaminarimon)',
                    title: `${cityName} Temples & Traditional Culture Walk`,
                    description: `Visit Senso-ji, Meiji Shrine, and hidden gardens — experience traditional tea ceremony and shrine rituals.`,
                },
                night: {
                    images: [
                        'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800',
                        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
                    ],
                    meetingPoint: 'Shibuya Crossing (Hachiko Statue)',
                    title: `${cityName} Shibuya & Shinjuku Night Tour`,
                    description: `Explore neon-lit Shibuya, Golden Gai's tiny bars, and Kabukicho — Tokyo after dark at its best.`,
                },
                languages: ['English', 'Japanese'],
            },
            bangkok: {
                code: 'BKK',
                food: {
                    images: [
                        'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=800',
                        'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800',
                    ],
                    meetingPoint: 'BTS Saphan Taksin Station Exit 2',
                    title: `${cityName} Street Food & Floating Market Tour`,
                    description: `Taste pad thai, mango sticky rice, and boat noodles at Bangkok's legendary street stalls and floating markets.`,
                },
                culture: {
                    images: [
                        'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=800',
                        'https://images.unsplash.com/photo-1528181304800-259b08848526?w=800',
                    ],
                    meetingPoint: 'Grand Palace Main Entrance',
                    title: `${cityName} Grand Palace & Wat Pho Temple Tour`,
                    description: `Marvel at the Grand Palace, the Reclining Buddha at Wat Pho, and Wat Arun across the Chao Phraya River.`,
                },
                night: {
                    images: [
                        'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800',
                        'https://images.unsplash.com/photo-1583396618422-fba1c5ae4e23?w=800',
                    ],
                    meetingPoint: 'Khao San Road (North End)',
                    title: `${cityName} Night Market & Rooftop Bar Tour`,
                    description: `Explore Rot Fai night market, sip cocktails at rooftop bars, and soak in Bangkok's electric nightlife.`,
                },
                languages: ['English', 'Thai'],
            },
            singapore: {
                code: 'SIN',
                food: {
                    images: [
                        'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800',
                        'https://images.unsplash.com/photo-1567337710282-00832b415979?w=800',
                    ],
                    meetingPoint: 'Maxwell Food Centre Entrance',
                    title: `${cityName} Hawker Centre Food Tour`,
                    description: `Taste Hainanese chicken rice, laksa, and chili crab at Singapore's UNESCO-recognized hawker centres.`,
                },
                culture: {
                    images: [
                        'https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=800',
                        'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=800',
                    ],
                    meetingPoint: 'Marina Bay Sands ArtScience Museum',
                    title: `${cityName} Marina Bay & Gardens by the Bay`,
                    description: `Explore the iconic Marina Bay skyline, Supertree Grove, and Cloud Forest — a fusion of nature and architecture.`,
                },
                night: {
                    images: [
                        'https://images.unsplash.com/photo-1506351421178-63b52a2d2562?w=800',
                        'https://images.unsplash.com/photo-1533929736562-d9acf26d51b6?w=800',
                    ],
                    meetingPoint: 'Clarke Quay MRT Station Exit E',
                    title: `${cityName} Clarke Quay & Marina Bay Night Tour`,
                    description: `Experience Singapore's glittering waterfront — riverside dining, light shows, and rooftop views at night.`,
                },
                languages: ['English', 'Mandarin', 'Malay'],
            },
        };

        // Find matching city data or use generic fallback
        const matched = cityData[cityKey];
        const data = matched || {
            code: cityName.substring(0, 3).toUpperCase(),
            food: {
                images: [
                    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800',
                    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
                ],
                meetingPoint: `${cityName} City Center`,
                title: `${cityName} Street Food Tour`,
                description: `Discover the authentic flavors of ${cityName} on this guided street food tour through local markets and hidden food stalls.`,
            },
            culture: {
                images: [
                    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
                    'https://images.unsplash.com/photo-1518391846015-55a9cc003b25?w=800',
                ],
                meetingPoint: `${cityName} Old Town`,
                title: `${cityName} Cultural Walking Tour`,
                description: `Explore the cultural landmarks, historical sites, and hidden gems of ${cityName} with a knowledgeable local guide.`,
            },
            night: {
                images: [
                    'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800',
                    'https://images.unsplash.com/photo-1470219556762-1b8ca07e0692?w=800',
                ],
                meetingPoint: `${cityName} Downtown`,
                title: `${cityName} Night Market & Nightlife Tour`,
                description: `Experience the vibrant nightlife and night markets of ${cityName}. Street food, live music, and local nightlife.`,
            },
            languages: ['English'],
        };

        const mockActivities: ViatorActivity[] = [
            {
                id: '1',
                productCode: `${data.code}-FOOD-001`,
                title: data.food.title,
                description: data.food.description,
                shortDescription: `Authentic ${cityName} food experience`,
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
                images: data.food.images,
                thumbnailUrl: data.food.images[0]?.replace('w=800', 'w=400'),
                bookingUrl: `https://www.viator.com/tours/${data.code}-FOOD-001`,
                viatorUrl: `https://www.viator.com/tours/${data.code}-FOOD-001`,
                cancellationPolicy: 'Free cancellation up to 24 hours before',
                included: ['Local guide', 'Food tastings', 'Bottled water'],
                excluded: ['Hotel pickup', 'Gratuities'],
                meetingPoint: data.food.meetingPoint,
                languages: data.languages,
                maxTravelers: 12,
                instantConfirmation: true,
                mobileTicket: true,
            },
            {
                id: '2',
                productCode: `${data.code}-CULTURE-001`,
                title: data.culture.title,
                description: data.culture.description,
                shortDescription: `Discover ${cityName}'s cultural gems`,
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
                images: data.culture.images,
                thumbnailUrl: data.culture.images[0]?.replace('w=800', 'w=400'),
                bookingUrl: `https://www.viator.com/tours/${data.code}-CULTURE-001`,
                viatorUrl: `https://www.viator.com/tours/${data.code}-CULTURE-001`,
                cancellationPolicy: 'Free cancellation up to 24 hours before',
                included: ['Expert guide', 'Entrance fees', 'Cultural experience'],
                excluded: ['Lunch', 'Transportation'],
                meetingPoint: data.culture.meetingPoint,
                languages: data.languages,
                maxTravelers: 10,
                instantConfirmation: true,
                mobileTicket: true,
            },
            {
                id: '3',
                productCode: `${data.code}-NIGHT-001`,
                title: data.night.title,
                description: data.night.description,
                shortDescription: `${cityName} after dark adventure`,
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
                images: data.night.images,
                thumbnailUrl: data.night.images[0]?.replace('w=800', 'w=400'),
                bookingUrl: `https://www.viator.com/tours/${data.code}-NIGHT-001`,
                viatorUrl: `https://www.viator.com/tours/${data.code}-NIGHT-001`,
                cancellationPolicy: 'Free cancellation up to 24 hours before',
                included: ['Guide', 'Market snacks', 'Transportation'],
                excluded: ['Dinner', 'Shopping purchases'],
                meetingPoint: data.night.meetingPoint,
                languages: data.languages,
                maxTravelers: 15,
                instantConfirmation: true,
                mobileTicket: true,
            },
        ];

        return mockActivities;
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
