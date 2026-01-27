import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSpots() {
    console.log('🔍 Checking spots database...\n');

    // 1. Get total count
    const { count: totalCount, error: countError } = await supabase
        .from('spots')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error('❌ Error counting spots:', countError.message);
        return;
    }

    console.log(`📊 Total spots in database: ${totalCount || 0}\n`);

    if (!totalCount || totalCount === 0) {
        console.log('⚠️  Database is empty! You need to run the seed scripts:');
        console.log('   npx ts-node scripts/seed-spots.ts');
        console.log('   npx ts-node scripts/seed-additional-spots.ts');
        return;
    }

    // 2. Get a sample spot to check address format
    const { data: sampleSpot, error: sampleError } = await supabase
        .from('spots')
        .select('id, name, address')
        .limit(1)
        .single();

    if (sampleSpot) {
        console.log('📋 Sample spot structure:');
        console.log('   Name:', JSON.stringify(sampleSpot.name));
        console.log('   Address:', JSON.stringify(sampleSpot.address));
        console.log('');
    }

    // 3. Count by city
    const cities = [
        { name: 'Seoul', slug: 'seoul' },
        { name: 'Tokyo', slug: 'tokyo' },
        { name: 'Bangkok', slug: 'bangkok' },
        { name: 'Singapore', slug: 'singapore' }
    ];

    console.log('🏙️  Spots by city:');
    for (const city of cities) {
        const { count } = await supabase
            .from('spots')
            .select('*', { count: 'exact', head: true })
            .or(`address->>'en'.ilike.%${city.name}%,address->>'en'.ilike.%${city.slug}%`);

        console.log(`   ${city.name}: ${count || 0} spots`);
    }

    console.log('\n✅ Database check complete!');
}

checkSpots()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });
