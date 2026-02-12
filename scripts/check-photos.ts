/**
 * Quick script to check if photos are stored correctly in the database
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPhotos() {
    console.log('📸 Checking photos in database...\n');

    // Count total spots
    const { count: totalCount } = await supabase
        .from('spots')
        .select('*', { count: 'exact', head: true });

    console.log(`Total spots: ${totalCount}`);

    // Count spots with photos
    const { data: spotsWithPhotos, error } = await supabase
        .from('spots')
        .select('id, name, photos, category')
        .not('photos', 'is', null)
        .limit(10);

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    // Count spots with non-empty photos array
    const { count: withPhotosCount } = await supabase
        .from('spots')
        .select('*', { count: 'exact', head: true })
        .not('photos', 'is', null);

    console.log(`Spots with photos column not null: ${withPhotosCount}`);

    // Show sample spots with photos
    console.log('\n📋 Sample spots with photos:');
    spotsWithPhotos?.slice(0, 5).forEach((spot, i) => {
        const name = typeof spot.name === 'object' ? spot.name.en : spot.name;
        const photoCount = spot.photos?.length || 0;
        const firstPhoto = spot.photos?.[0]?.substring(0, 60) || 'none';
        console.log(`${i + 1}. ${name}`);
        console.log(`   Category: ${spot.category}`);
        console.log(`   Photos: ${photoCount}`);
        console.log(`   First URL: ${firstPhoto}...`);
        console.log('');
    });

    // Check for spots with empty arrays
    const { data: emptyPhotos } = await supabase
        .from('spots')
        .select('id, name, photos')
        .eq('photos', '{}')
        .limit(5);

    console.log(`\nSpots with empty photos array: ${emptyPhotos?.length || 0}`);

    // Check city distribution in addresses
    console.log('\n🏙️ City distribution (checking address field):');
    const cities = ['Seoul', 'Tokyo', 'Bangkok', 'Singapore', 'Osaka', 'Kyoto'];

    for (const city of cities) {
        const { count } = await supabase
            .from('spots')
            .select('*', { count: 'exact', head: true })
            .ilike('address->>en', `%${city}%`);

        console.log(`   ${city}: ${count || 0} spots`);
    }

    console.log('\n✅ Check complete!');
}

checkPhotos()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
