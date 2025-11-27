import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title') || 'Discover Hidden Gems';
    const city = searchParams.get('city') || '';
    const days = searchParams.get('days') || '';

    // Construct subtitle
    const subtitle = city && days
      ? `${days} ${parseInt(days) === 1 ? 'Day' : 'Days'} in ${city}`
      : city || 'Travel Itinerary';

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {/* Background pattern */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.05) 0%, transparent 50%)',
            }}
          />

          {/* Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px',
              maxWidth: '1000px',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            {/* Title */}
            <div
              style={{
                fontSize: title.length > 40 ? 60 : 72,
                fontWeight: 'bold',
                color: 'white',
                marginBottom: 24,
                lineHeight: 1.2,
                textShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              {title}
            </div>

            {/* Subtitle */}
            {subtitle && (
              <div
                style={{
                  fontSize: 36,
                  color: 'rgba(255,255,255,0.95)',
                  marginBottom: 48,
                  fontWeight: 500,
                }}
              >
                {subtitle}
              </div>
            )}

            {/* Localley branding */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginTop: 40,
              }}
            >
              {/* Logo icon */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                }}
              >
                🗺️
              </div>

              {/* Brand name */}
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 'bold',
                  color: 'white',
                  letterSpacing: '-0.5px',
                }}
              >
                Localley
              </div>

              {/* Tagline */}
              <div
                style={{
                  fontSize: 24,
                  color: 'rgba(255,255,255,0.8)',
                  marginLeft: 16,
                  paddingLeft: 24,
                  borderLeft: '2px solid rgba(255,255,255,0.3)',
                }}
              >
                Discover Hidden Gems
              </div>
            </div>
          </div>

          {/* Bottom decorative element */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 8,
              background: 'linear-gradient(90deg, #f093fb 0%, #f5576c 100%)',
            }}
          />
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating OG image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
