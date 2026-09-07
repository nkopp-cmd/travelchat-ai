import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SpotActivities } from '@/components/spots/spot-activities';
import { ViatorSuggestions } from '@/components/activities/viator-suggestions';

vi.mock('@/components/ui/city-image', () => ({ CityImageAvatar: () => null }));

describe('Booking UI without provider offers', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('hides the optional spot section without inventing cards', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
            success: true,
            data: { activities: [], total: 0, hasMore: false },
        })));
        const { container } = render(<SpotActivities spotId="spot-1" city="Seoul" />);
        await waitFor(() => expect(container.innerHTML).toBe(''));
    });

    it('uses the existing itinerary empty state without prices or booking controls', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
            success: true,
            data: { activities: [], total: 0, hasMore: false },
        })));
        const { container } = render(<ViatorSuggestions city="Seoul" />);
        expect(await screen.findByText('No activities found for Seoul')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^Book/ })).toBeNull();
        expect(container.textContent).not.toMatch(/\$|spots remaining|Street Food Tour/i);
    });
});
