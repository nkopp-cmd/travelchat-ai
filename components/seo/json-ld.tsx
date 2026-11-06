// Base JSON-LD component. A plain server-rendered <script>: crawlers and AI fetchers read the static HTML
// without running JS, so next/script (afterInteractive) left every page without structured data.
interface JsonLdProps {
    data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
        />
    );
}

// Organization schema for the site
export function OrganizationJsonLd() {
    const data = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Localley",
        description: "Phrase cards, menu help, how to pay and spots locals rate in Korea, Japan, Thailand, Vietnam, Taiwan and Singapore.",
        url: process.env.NEXT_PUBLIC_BASE_URL || "https://www.localley.io",
        logo: `${process.env.NEXT_PUBLIC_BASE_URL || "https://www.localley.io"}/logo.png`,
        contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: "hello@localley.io",
        },
    };

    return <JsonLd data={data} />;
}

// Website schema
export function WebsiteJsonLd() {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://www.localley.io";

    const data = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Localley",
        description: "Discover hidden gems with AI-powered local travel guides",
        url: baseUrl,
        potentialAction: {
            "@type": "SearchAction",
            target: {
                "@type": "EntryPoint",
                urlTemplate: `${baseUrl}/spots?search={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
        },
    };

    return <JsonLd data={data} />;
}

// Itinerary/Trip schema
interface ItineraryJsonLdProps {
    title: string;
    description?: string;
    city: string;
    days: number;
    highlights?: string[];
    imageUrl?: string;
    url: string;
    createdAt: string;
    localScore?: number;
    creatorName?: string;
}

export function ItineraryJsonLd({
    title,
    description,
    city,
    days,
    highlights,
    imageUrl,
    url,
    createdAt,
    localScore,
    creatorName,
}: ItineraryJsonLdProps) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://www.localley.io";

    const data = {
        "@context": "https://schema.org",
        "@type": "Trip",
        name: title,
        description: description || `${days}-day travel itinerary for ${city}`,
        itinerary: {
            "@type": "ItemList",
            numberOfItems: days,
            itemListElement: highlights?.map((highlight, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: highlight,
            })),
        },
        touristType: "Traveler",
        ...(imageUrl && {
            image: imageUrl,
        }),
        url: `${baseUrl}${url}`,
        dateCreated: createdAt,
        ...(localScore && {
            aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: localScore,
                bestRating: 10,
                worstRating: 1,
                ratingCount: 1,
            },
        }),
        ...(creatorName && {
            author: {
                "@type": "Person",
                name: creatorName,
            },
        }),
        provider: {
            "@type": "Organization",
            name: "Localley",
            url: baseUrl,
        },
    };

    return <JsonLd data={data} />;
}

// Local Business / Place schema for spots
interface SpotJsonLdProps {
    name: string;
    description: string;
    category: string;
    address: string;
    lat?: number;
    lng?: number;
    imageUrl?: string;
    url: string;
    localleyScore: number;
    reviewCount?: number;
    averageRating?: number;
}

export function SpotJsonLd({
    name,
    description,
    category,
    address,
    lat,
    lng,
    imageUrl,
    url,
    localleyScore,
    reviewCount,
    averageRating,
}: SpotJsonLdProps) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://www.localley.io";

    // Map category to schema.org type
    const schemaType = getSchemaType(category);

    const data = {
        "@context": "https://schema.org",
        "@type": schemaType,
        name,
        description,
        address: {
            "@type": "PostalAddress",
            streetAddress: address,
        },
        ...(lat && lng && {
            geo: {
                "@type": "GeoCoordinates",
                latitude: lat,
                longitude: lng,
            },
        }),
        ...(imageUrl && {
            image: imageUrl,
        }),
        url: `${baseUrl}${url}`,
        ...(reviewCount && averageRating && {
            aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: averageRating,
                bestRating: 5,
                worstRating: 1,
                reviewCount: reviewCount,
            },
        }),
        // Custom property for Localley score
        additionalProperty: {
            "@type": "PropertyValue",
            name: "Localley Score",
            value: localleyScore,
            maxValue: 6,
            minValue: 1,
        },
    };

    return <JsonLd data={data} />;
}

// Helper to map categories to schema.org types
function getSchemaType(category: string): string {
    const categoryMap: Record<string, string> = {
        restaurant: "Restaurant",
        cafe: "CafeOrCoffeeShop",
        bar: "BarOrPub",
        food: "FoodEstablishment",
        shopping: "Store",
        culture: "TouristAttraction",
        nature: "Park",
        nightlife: "NightClub",
        entertainment: "EntertainmentBusiness",
        default: "LocalBusiness",
    };

    return categoryMap[category.toLowerCase()] || categoryMap.default;
}

// Breadcrumb schema
interface BreadcrumbItem {
    name: string;
    url: string;
}

interface BreadcrumbJsonLdProps {
    items: BreadcrumbItem[];
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://www.localley.io";

    const data = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: `${baseUrl}${item.url}`,
        })),
    };

    return <JsonLd data={data} />;
}

// FAQ schema for common questions
interface FAQItem {
    question: string;
    answer: string;
}

interface FAQJsonLdProps {
    items: FAQItem[];
}

export function FAQJsonLd({ items }: FAQJsonLdProps) {
    const data = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
            },
        })),
    };

    return <JsonLd data={data} />;
}
