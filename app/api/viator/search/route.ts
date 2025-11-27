import { NextRequest, NextResponse } from 'next/server';
import { viatorClient } from '@/lib/viator';
import { ViatorSearchParams } from '@/types/viator';

export async function POST(request: NextRequest) {
    try {
        const body: ViatorSearchParams = await request.json();

        // Validate required fields
        if (!body.destination) {
            return NextResponse.json(
                { error: 'Destination is required' },
                { status: 400 }
            );
        }

        // Search for activities
        const result = await viatorClient.searchActivities({
            destination: body.destination,
            city: body.city,
            category: body.category,
            startDate: body.startDate,
            endDate: body.endDate,
            minPrice: body.minPrice,
            maxPrice: body.maxPrice,
            rating: body.rating,
            currency: body.currency || 'USD',
            limit: body.limit || 20,
            offset: body.offset || 0,
        });

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error('Error searching Viator activities:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to search activities. Please try again.'
            },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);

        const destination = searchParams.get('destination');
        if (!destination) {
            return NextResponse.json(
                { error: 'Destination parameter is required' },
                { status: 400 }
            );
        }

        const params: ViatorSearchParams = {
            destination,
            city: searchParams.get('city') || undefined,
            category: searchParams.get('category') || undefined,
            startDate: searchParams.get('startDate') || undefined,
            currency: searchParams.get('currency') || 'USD',
            limit: parseInt(searchParams.get('limit') || '20'),
            offset: parseInt(searchParams.get('offset') || '0'),
        };

        const result = await viatorClient.searchActivities(params);

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error('Error searching Viator activities:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to search activities. Please try again.'
            },
            { status: 500 }
        );
    }
}
