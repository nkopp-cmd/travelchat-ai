/**
 * Check all cities in the database
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAllCities() {
    console.log('🏙️ Checking all cities in database...\n');

    // Get all spots and extract city info
    const { data: spots, error } = await supabase
        .from('spots')
        .select('address');

    if (error || !spots) {
        console.error('Error:', error?.message);
        return;
    }

    // Count cities
    const cityCounts: Record<string, number> = {};

    spots.forEach(spot => {
        const address = typeof spot.address === 'object' ? spot.address.en : spot.address;
        if (!address) {
            cityCounts['NO ADDRESS'] = (cityCounts['NO ADDRESS'] || 0) + 1;
            return;
        }

        // Try to extract city from address (usually after first comma or before country)
        const parts = address.split(',').map((p: string) => p.trim());

        // Look for common city patterns
        const knownCities = [
            'Seoul', 'Tokyo', 'Bangkok', 'Singapore', 'Osaka', 'Kyoto',
            'Busan', 'Taipei', 'Hong Kong', 'Kuala Lumpur', 'Hanoi',
            'Ho Chi Minh', 'Chiang Mai', 'Bali', 'Ubud', 'Melaka',
            'Japan', 'Korea', 'Thailand', 'Vietnam', 'Malaysia', 'Indonesia'
        ];

        let foundCity = 'Unknown';
        for (const city of knownCities) {
            if (address.toLowerCase().includes(city.toLowerCase())) {
                foundCity = city;
                break;
            }
        }

        cityCounts[foundCity] = (cityCounts[foundCity] || 0) + 1;
    });

    // Sort by count
    const sorted = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]);

    console.log('City distribution:');
    let total = 0;
    sorted.forEach(([city, count]) => {
        console.log(`   ${city}: ${count} spots`);
        total += count;
    });

    console.log(`\nTotal: ${total} spots`);
}

checkAllCities()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
